import FileType from 'file-type';

// Regular expression to detect svg file content, inspired by: https://github.com/sindresorhus/is-svg/blob/master/index.js
// It is not always possible to check for an end tag if a file is very big. The firstChunk, see below, might not be the entire file.
var svgRegex = /^\s*(?:<\?xml[^>]*>\s*)?(?:<!doctype svg[^>]*>\s*)?<svg[^>]*>/i;

const isSvg = (svg) => {
  // Remove DTD entities
  svg = svg.replace(/\s*<!Entity\s+\S*\s*(?:"|')[^"]+(?:"|')\s*>/gim, '');
  // Remove DTD markup declarations
  svg = svg.replace(/\[?(?:\s*<![A-Z]+[^>]*>\s*)*\]?/g, '');
  // Remove HTML comments

  return svgRegex.test(svg);
};

export const guessContentType = async (chunk, fallback) => {
  const type = await FileType.fromBuffer(chunk);
  let mime = fallback || 'application/octet-stream'; // default type

  // Make sure to check xml-extension for svg files.
  if ((!type || type.ext === 'xml') && isSvg(chunk.toString())) {
    mime = 'image/svg+xml';
  } else if (type) {
    mime = type.mime;
  }

  return mime;
};
