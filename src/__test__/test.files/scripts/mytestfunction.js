var main = ({ body, method, query, id, response }) => {
  const result = { hello: true, method, query, body, console, id };
  try {
    result.response = response;
  } catch {
    console.log('Missing result');
  }
  return result;
};

Object.defineProperty(exports, '__esModule', {
  value: true,
});

exports.default = main;
