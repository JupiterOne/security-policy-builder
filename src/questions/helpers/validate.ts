import joi from 'joi';

const emailSchema = joi.string().email();
const urlSchema = joi.string().uri({ scheme: [/https?/] });

export function validateEmail(addr: string) {
  if (addr.trim() === '') {
    return true;
  }

  const result = emailSchema.validate(addr);
  return result.error == null ? true : 'Please enter a valid email address';
}

export function validateWebURL(url: string) {
  if (url.trim() === '') {
    return true;
  }
  const result = urlSchema.validate(url);
  return result.error == null ? true : 'Please enter a valid Web URL';
}
