const joi = require("joi");

exports.email = validateEmail;
exports.webURL = validateWebURL;

function validateEmail(addr) {
  if (addr.trim() === "") {
    return true;
  }
  const result = joi.validate(addr, joi.string().email());
  return result.error == null ? true : "Please enter a valid email address";
}

function validateWebURL(url) {
  if (url.trim() === "") {
    return true;
  }
  const result = joi.validate(url, joi.string().uri({ scheme: [/https?/] }));
  return result.error == null ? true : "Please enter a valid Web URL";
}
