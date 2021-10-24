import easyNoPassword from 'easy-no-password';
import express from 'express';
import crypto from 'crypto';
import log from './log.js';

import { throwError, errorGuard, errorMiddleware } from './error.js';

const sha256 = (data) => {
  return crypto.createHash('sha256').update(data, 'binary').digest('hex');
};

// Auth Middleware
export const authentication = ({
  prefix = 'auth',
  secret,
  onSendToken = ({ remote, userEmail, userId, token, req }) =>
    Promise.resolve(),
  onLogin = (req, userId) => {},
  onLogout = (req) => {},
} = {}) => {
  const router = express.Router();

  const enp = easyNoPassword(secret);

  // Verify token
  router.get(
    `/${prefix}/verify/:userId/:token`,
    errorGuard(async (req, res) => {
      const {
        params: { token, userId },
      } = req;

      const isValid = await new Promise((resolve, reject) => {
        enp.isValid(token, userId, (err, isValid) => {
          if (err) {
            reject(err);
          }
          resolve(isValid);
        });
      });

      if (!isValid) {
        throwError('Token invalid or has expired', 403);
      } else {
        onLogin(userId, req);
        res.json({ message: 'success' });
      }
    })
  );

  // Allow to check authentification
  router.get(
    `/${prefix}/check`,
    errorGuard(async (req, res) => {
      if (req.session.userId) {
        res.json({ message: 'success' });
      } else {
        throwError('Not authenticated', 403);
      }
    })
  );

  // Get token
  router.post(
    `/${prefix}/`,
    errorGuard(async (req, res, next) => {
      const {
        body: { userEmail },
        ricochetOrigin,
      } = req;

      if (!userEmail) {
        throwError("Missing mandatory 'email' parameter", 400);
      }

      const userId = sha256(userEmail.toLowerCase());

      enp.createToken(userId, (err, token) => {
        if (err) {
          throwError('Unknown error', 500);
        }
        return onSendToken({
          remote: ricochetOrigin,
          userEmail,
          userId,
          token,
          req,
        }).then(
          () => {
            res.json({ message: 'Token sent' });
          },
          (e) => {
            log.error({ error: e }, 'Error while sending email');
            const errorObject = new Error(e);
            errorObject.statusCode = 503;
            next(errorObject);
          }
        );
      });
    })
  );

  // Logout
  router.get(
    `/${prefix}/logout/`,
    errorGuard(async (req, res) => {
      onLogout(req);
      res.json({ message: 'logged out' });
    })
  );

  router.use(errorMiddleware);

  return router;
};

export default authentication;
