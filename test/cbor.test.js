import test from 'node:test';
import assert from 'node:assert/strict';
import { cborDecode, cborEncode } from '../src/cbor.js';

test('integers round trip', () => {
  for (const n of [0, 1, 23, 24, 255, 256, 1000, 65535, 65536, 1000000, -1, -24, -25, -256, -1000]) {
    assert.equal(cborDecode(cborEncode(n)), n);
  }
});

test('known encodings decode', () => {
  assert.equal(cborDecode(Buffer.from([0x01])), 1);
  assert.equal(cborDecode(Buffer.from([0x18, 0x2a])), 42);
  assert.equal(cborDecode(Buffer.from([0x20])), -1);
  assert.equal(cborDecode(Buffer.from([0x39, 0x03, 0xe7])), -1000);
  assert.equal(cborDecode(Buffer.from([0x61, 0x61])), 'a');
  assert.deepEqual(cborDecode(Buffer.from([0x82, 0x01, 0x02])), [1, 2]);
  assert.deepEqual(cborDecode(Buffer.from([0xa1, 0x61, 0x61, 0x01])), { a: 1 });
  assert.equal(cborDecode(Buffer.from([0xf4])), false);
  assert.equal(cborDecode(Buffer.from([0xf5])), true);
  assert.equal(cborDecode(Buffer.from([0xf6])), null);
});

test('byte strings and text round trip', () => {
  const bytes = Buffer.from([0x02, 0x44, 0x53, 0x83, 0x19]);
  assert.deepEqual(cborDecode(cborEncode(bytes)), bytes);
  assert.equal(cborDecode(cborEncode('hello cashu')), 'hello cashu');
  assert.equal(cborDecode(cborEncode('')), '');
});

test('nested token-shaped structure round trips', () => {
  const obj = {
    t: [{ i: Buffer.from('00ffd48b8f5ecf80', 'hex'), p: [{ a: 1, s: 'secret', c: Buffer.from('02' + '11'.repeat(32), 'hex') }] }],
    m: 'http://localhost:3338',
    u: 'sat',
  };
  const decoded = cborDecode(cborEncode(obj));
  assert.equal(decoded.m, obj.m);
  assert.equal(decoded.u, obj.u);
  assert.deepEqual(decoded.t[0].i, obj.t[0].i);
  assert.equal(decoded.t[0].p[0].a, 1);
  assert.equal(decoded.t[0].p[0].s, 'secret');
  assert.deepEqual(decoded.t[0].p[0].c, obj.t[0].p[0].c);
});

test('indefinite length arrays and maps decode', () => {
  // 0x9f 0x01 0x02 0xff = [1, 2]
  assert.deepEqual(cborDecode(Buffer.from([0x9f, 0x01, 0x02, 0xff])), [1, 2]);
  // 0xbf 0x61 0x61 0x01 0xff = {"a": 1}
  assert.deepEqual(cborDecode(Buffer.from([0xbf, 0x61, 0x61, 0x01, 0xff])), { a: 1 });
});

test('tags are skipped', () => {
  // 0xd8 0x00 0x01 = tag 0 around 1
  assert.equal(cborDecode(Buffer.from([0xd8, 0x00, 0x01])), 1);
});

test('truncated input throws', () => {
  assert.throws(() => cborDecode(Buffer.from([0x82, 0x01])), /unexpected end|truncated/);
  assert.throws(() => cborDecode(Buffer.from([0x42, 0x01])), /truncated/);
  assert.throws(() => cborDecode(Buffer.from([])), /unexpected end/);
});

test('trailing bytes throw', () => {
  assert.throws(() => cborDecode(Buffer.from([0x01, 0x02])), /trailing/);
});

test('floats decode', () => {
  assert.equal(cborDecode(Buffer.from([0xfa, 0x47, 0xc3, 0x50, 0x00])), 100000.0);
});
