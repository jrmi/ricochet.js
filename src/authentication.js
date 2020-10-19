import easyNoPassword from 'easy-no-password';
import express from 'express';
import crypto from 'crypto';

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
  onSendToken = (userEmail, userId, token) => {},
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
    errorGuard(async (req, res) => {
      const {
        body: { userEmail },
      } = req;

      if (!userEmail) {
        throwError("Missing mandatory 'email' parameter", 400);
      }

      const userId = sha256(userEmail);

      enp.createToken(userId, (err, token) => {
        if (err) {
          throwError('Unknown error', 500);
        }
        onSendToken(userEmail, userId, token);

        res.json({ message: 'Token sent' });
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