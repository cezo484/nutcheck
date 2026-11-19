// Base64url helpers. Cashu tokens use base64url without padding.

export function b64urlDecode(s) {
  if (typeof s !== 'string' || s.length === 0) {
    throw new Error('empty base64url input');
  }
  if (!/^[A-Za-z0-9_-]+={0,2}$/.test(s)) {
    throw new Error('invalid base64url characters');
  }
  const buf = Buffer.from(s, 'base64url');
  if (buf.length === 0) {
    throw new Error('base64url decoded to empty bytes');
  }
  return buf;
}

export function b64urlEncode(buf) {
  return Buffer.from(buf).toString('base64url');
}
