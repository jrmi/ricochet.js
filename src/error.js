export const throwError = (message, code = 400) => {
  const errorObject = new Error(message);
  errorObject.statusCode = code;
  throw errorObject;
};

export const errorGuard = (func) => async (req, res, next) => {
  try {
    return await func(req, res, next);
  } catch (error) {
    //console.log(error);
    next(error);
  }
};

// Middleware to handle errors
// eslint-disable-next-line no-unused-vars
export const errorMiddleware = (err, req, res, _next) => {
  //console.error(err);
  res.status(err.statusCode || 500).json({ message: err.message });
};
