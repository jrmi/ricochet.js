import easyNoPassword from 'easy-no-password';
import express from 'express';
import crypto from 'crypto';
import log from './log.js';

const errorGuard = (func) => async (req, res, next) => {
  try {
    return await func(req, res, next);
  } catch (error) {
    // console.log(error);
    next(error);
  }
};

const throwError = (message, code = 400) => {
  const errorObject = new Error(message);
  errorObject.statusCode = code;
  throw errorObject;
};

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

  // Get token
  router.post(
    `/${prefix}/`,
    errorGuard(async (req, res, next) => {
      const {
        body: { userEmail },
        headers: { 'x-auth-host': authHost = '', origin },
      } = req;

      if (!origin && !authHost) {
        throwError('X-Auth-Host or origin header is required', 400);
      }

      if (!userEmail) {
        throwError("Missing mandatory 'email' parameter", 400);
      }

      const userId = sha256(userEmail);

      enp.createToken(userId, (err, token) => {
        if (err) {
          throwError('Unknown error', 500);
        }
        const remote = authHost ?? origin;
        return onSendToken({ remote, userEmail, userId, token, req }).then(
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

  // Middleware to handle errors
  // eslint-disable-next-line no-unused-vars
  router.use((err, req, res, _next) => {
    res.status(err.statusCode || 500).json({ message: err.message });
  });

  return router;
};

export default authentication;
