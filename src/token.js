// Cashu token parsing and encoding, per NUT-00.
// V3: cashuA + base64url(JSON). V4: cashuB + base64url(CBOR).
// Normalized output: { version, mints: [{ mint, proofs }], unit, memo }.

import { b64urlDecode, b64urlEncode } from './base64.js';
import { cborDecode, cborEncode } from './cbor.js';

const HEX = /^[0-9a-fA-F]+$/;

function isHex(s, minLen = 1) {
  return typeof s === 'string' && s.length >= minLen && HEX.test(s);
}

function checkProof(p) {
  if (!p || typeof p !== 'object') throw new Error('token: proof is not an object');
  if (!Number.isInteger(p.amount) || p.amount < 0) {
    throw new Error('token: proof amount must be a non-negative integer');
  }
  if (!isHex(p.id, 2)) throw new Error('token: proof id must be a hex string');
  if (typeof p.secret !== 'string' || p.secret.length === 0) {
    throw new Error('token: proof secret must be a non-empty string');
  }
  if (!isHex(p.C, 2)) throw new Error('token: proof C must be a hex string');
  return { amount: p.amount, id: p.id.toLowerCase(), secret: p.secret, C: p.C.toLowerCase() };
}

// Keyset IDs: full form is 33 bytes (66 hex chars), short form is the first
// 8 bytes (16 hex chars). Both appear in tokens.
export function keysetIdKind(id) {
  if (id.length === 66) return 'full';
  if (id.length === 16) return 'short';
  return 'unknown';
}

export function stripUriPrefix(s) {
  const t = String(s).trim();
  if (/^cashu:/i.test(t)) return t.slice(6);
  return t;
}

export function splitTokenString(s) {
  const t = stripUriPrefix(s);
  if (!t.startsWith('cashu')) throw new Error('token: must start with cashuA or cashuB');
  const version = t[5];
  if (version !== 'A' && version !== 'B') {
    throw new Error('token: unknown version "' + version + '", expected A or B');
  }
  const payload = t.slice(6);
  if (payload.length === 0) throw new Error('token: empty payload');
  return { version, payload };
}

function decodeV3(payload) {
  let json;
  try {
    json = JSON.parse(b64urlDecode(payload).toString('utf8'));
  } catch (err) {
    throw new Error('token: V3 payload is not valid base64url JSON (' + err.message + ')');
  }
  if (!json || typeof json !== 'object' || !Array.isArray(json.token) || json.token.length === 0) {
    throw new Error('token: V3 token must have a non-empty "token" array');
  }
  const mints = json.token.map((entry, i) => {
    if (!entry || typeof entry.mint !== 'string' || entry.mint.length === 0) {
      throw new Error('token: V3 entry ' + i + ' has no mint URL');
    }
    if (!Array.isArray(entry.proofs) || entry.proofs.length === 0) {
      throw new Error('token: V3 entry ' + i + ' has no proofs');
    }
    return { mint: entry.mint.replace(/\/+$/, ''), proofs: entry.proofs.map(checkProof) };
  });
  return {
    version: 'A',
    mints,
    unit: typeof json.unit === 'string' ? json.unit : 'sat',
    memo: typeof json.memo === 'string' ? json.memo : null,
  };
}

function decodeV4(payload) {
  let obj;
  try {
    obj = cborDecode(b64urlDecode(payload));
  } catch (err) {
    throw new Error('token: V4 payload is not valid base64url CBOR (' + err.message + ')');
  }
  if (!obj || typeof obj !== 'object') throw new Error('token: V4 token must be a CBOR map');
  if (typeof obj.m !== 'string' || obj.m.length === 0) {
    throw new Error('token: V4 token has no mint (m)');
  }
  if (!Array.isArray(obj.t) || obj.t.length === 0) {
    throw new Error('token: V4 token has no proof groups (t)');
  }
  const proofs = [];
  for (const group of obj.t) {
    if (!group || typeof group !== 'object') throw new Error('token: V4 proof group is not a map');
    const idBytes = group.i;
    if (!Buffer.isBuffer(idBytes) && !(idBytes instanceof Uint8Array)) {
      throw new Error('token: V4 keyset id (i) must be bytes');
    }
    const id = Buffer.from(idBytes).toString('hex');
    if (id.length !== 16 && id.length !== 66) {
      throw new Error('token: V4 keyset id must be 8 or 33 bytes, got ' + idBytes.length);
    }
    if (!Array.isArray(group.p) || group.p.length === 0) {
      throw new Error('token: V4 proof group has no proofs (p)');
    }
    for (const p of group.p) {
      if (!p || typeof p !== 'object') throw new Error('token: V4 proof is not a map');
      if (!Buffer.isBuffer(p.c) && !(p.c instanceof Uint8Array)) {
        throw new Error('token: V4 proof signature (c) must be bytes');
      }
      proofs.push(checkProof({
        amount: p.a,
        id,
        secret: p.s,
        C: Buffer.from(p.c).toString('hex'),
      }));
    }
  }
  return {
    version: 'B',
    mints: [{ mint: obj.m.replace(/\/+$/, ''), proofs }],
    unit: typeof obj.u === 'string' ? obj.u : 'sat',
    memo: typeof obj.d === 'string' ? obj.d : null,
  };
}

export function decodeToken(s) {
  const { version, payload } = splitTokenString(s);
  return version === 'A' ? decodeV3(payload) : decodeV4(payload);
}

export function tokenTotals(token) {
  const proofs = token.mints.flatMap((m) => m.proofs);
  const total = proofs.reduce((sum, p) => sum + p.amount, 0);
  const keysets = {};
  for (const p of proofs) {
    if (!keysets[p.id]) keysets[p.id] = { count: 0, total: 0, kind: keysetIdKind(p.id) };
    keysets[p.id].count += 1;
    keysets[p.id].total += p.amount;
  }
  return { total, proofCount: proofs.length, keysets };
}

export function encodeTokenV3(token) {
  const json = {
    token: token.mints.map((m) => ({ mint: m.mint, proofs: m.proofs })),
  };
  if (token.unit) json.unit = token.unit;
  if (token.memo) json.memo = token.memo;
  return 'cashuA' + b64urlEncode(Buffer.from(JSON.stringify(json), 'utf8'));
}

export function encodeTokenV4(token) {
  if (token.mints.length !== 1) {
    throw new Error('encode: V4 tokens hold proofs from a single mint only');
  }
  const groups = {};
  for (const p of token.mints[0].proofs) {
    if (!groups[p.id]) groups[p.id] = [];
    groups[p.id].push({
      a: p.amount,
      s: p.secret,
      c: Buffer.from(p.C, 'hex'),
    });
  }
  const obj = {
    t: Object.entries(groups).map(([id, p]) => ({ i: Buffer.from(id, 'hex'), p })),
    m: token.mints[0].mint,
    u: token.unit || 'sat',
  };
  if (token.memo) obj.d = token.memo;
  return 'cashuB' + b64urlEncode(cborEncode(obj));
}
