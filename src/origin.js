const getRemoteFromQuery = ({
  headers: {
    'x-spc-host': spcHost = '',
    'x-ricochet-origin': ricochetOrigin,
    origin,
    referer,
  },
}) => ricochetOrigin || (referer ? new URL(referer).origin : origin || spcHost);

const originMiddleware = () => (req, res, next) => {
  const remote = getRemoteFromQuery(req);

  if (!remote) {
    res.status(400).json({
      message: 'One of X-Ricochet-Origin, Origin, Referer header is required',
    });
  }

  req.ricochetOrigin = remote;
  next();
};

export default originMiddleware;
