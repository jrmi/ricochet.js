var main = ({ body, method, query, id, response }) => {
  const result = { hello: true, method, query, body, console, id };
  try {
    result.response = response;
  } catch {}
  return result;
};
