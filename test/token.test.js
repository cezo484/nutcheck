import test from 'node:test';
import assert from 'node:assert/strict';
import {
  decodeToken, encodeTokenV3, encodeTokenV4, tokenTotals, keysetIdKind,
} from '../src/token.js';
import { V3_SPEC_TOKEN, V4_SPEC_TOKEN } from '../src/vectors.js';

test('V3 spec token decodes', () => {
  const t = decodeToken(V3_SPEC_TOKEN);
  assert.equal(t.version, 'A');
  assert.equal(t.mints.length, 1);
  assert.equal(t.mints[0].mint, 'https://8333.space:3338');
  assert.equal(t.unit, 'sat');
  assert.equal(t.memo, 'Thank you.');
  assert.equal(t.mints[0].proofs.length, 2);
  assert.equal(t.mints[0].proofs[0].amount, 2);
  assert.equal(t.mints[0].proofs[1].amount, 8);
  assert.equal(t.mints[0].proofs[0].id, '009a1f293253e41e');
  const totals = tokenTotals(t);
  assert.equal(totals.total, 10);
  assert.equal(totals.proofCount, 2);
  assert.equal(totals.keysets['009a1f293253e41e'].kind, 'short');
});

test('V4 spec token decodes', () => {
  const t = decodeToken(V4_SPEC_TOKEN);
  assert.equal(t.version, 'B');
  assert.equal(t.mints.length, 1);
  assert.equal(t.mints[0].mint, 'http://localhost:3338');
  assert.equal(t.unit, 'sat');
  assert.equal(t.memo, null);
  assert.equal(t.mints[0].proofs.length, 3);
  const amounts = t.mints[0].proofs.map((p) => p.amount).sort();
  assert.deepEqual(amounts, [1, 1, 2]);
  const totals = tokenTotals(t);
  assert.equal(totals.total, 4);
  assert.equal(totals.proofCount, 3);
  assert.ok(totals.keysets['00ffd48b8f5ecf80']);
  assert.ok(totals.keysets['00ad268c4d1f5826']);
  assert.equal(totals.keysets['00ad268c4d1f5826'].count, 2);
});

test('cashu: URI prefix is accepted', () => {
  const t = decodeToken('cashu:' + V3_SPEC_TOKEN);
  assert.equal(tokenTotals(t).total, 10);
  const t2 = decodeToken('cashu:' + V4_SPEC_TOKEN);
  assert.equal(tokenTotals(t2).total, 4);
});

test('V3 encode round trip', () => {
  const t = decodeToken(V3_SPEC_TOKEN);
  const again = decodeToken(encodeTokenV3(t));
  assert.deepEqual(again, t);
});

test('V4 encode round trip', () => {
  const t = decodeToken(V4_SPEC_TOKEN);
  const again = decodeToken(encodeTokenV4(t));
  assert.deepEqual(again, t);
});

test('V3 encode of the spec JSON matches the spec string', () => {
  const t = decodeToken(V3_SPEC_TOKEN);
  assert.equal(encodeTokenV3(t), V3_SPEC_TOKEN);
});

test('V4 encode rejects multi-mint tokens', () => {
  assert.throws(() => encodeTokenV4({
    mints: [
      { mint: 'https://a.example', proofs: [{ amount: 1, id: '00' + '11'.repeat(7), secret: 's', C: '02' + '11'.repeat(32) }] },
      { mint: 'https://b.example', proofs: [{ amount: 1, id: '00' + '11'.repeat(7), secret: 's', C: '02' + '11'.repeat(32) }] },
    ],
    unit: 'sat',
  }), /single mint/);
});

test('keyset id kinds', () => {
  assert.equal(keysetIdKind('009a1f293253e41e'), 'short');
  assert.equal(keysetIdKind('01' + 'ab'.repeat(32)), 'full');
  assert.equal(keysetIdKind('abcd'), 'unknown');
});

test('bad tokens throw clear errors', () => {
  assert.throws(() => decodeToken(''), /must start/);
  assert.throws(() => decodeToken('cashuCabc'), /unknown version/);
  assert.throws(() => decodeToken('cashuA'), /empty payload/);
  assert.throws(() => decodeToken('cashuA!!!'), /base64url|valid/);
  assert.throws(() => decodeToken('cashuA' + Buffer.from('not json', 'utf8').toString('base64url')), /not valid/);
  assert.throws(() => decodeToken('cashuA' + Buffer.from('{}', 'utf8').toString('base64url')), /non-empty/);
  assert.throws(() => decodeToken('cashuB' + Buffer.from([0x01, 0x02], 'binary').toString('base64url')), /trailing|not valid/);
});

test('proof validation rejects bad amounts and ids', () => {
  const bad = {
    token: [{ mint: 'https://x.example', proofs: [{ amount: -1, id: '009a1f293253e41e', secret: 's', C: '02' + '11'.repeat(32) }] }],
  };
  assert.throws(() => decodeToken('cashuA' + Buffer.from(JSON.stringify(bad), 'utf8').toString('base64url')), /amount/);
  const badId = {
    token: [{ mint: 'https://x.example', proofs: [{ amount: 1, id: 'zzzz', secret: 's', C: '02' + '11'.repeat(32) }] }],
  };
  assert.throws(() => decodeToken('cashuA' + Buffer.from(JSON.stringify(badId), 'utf8').toString('base64url')), /hex/);
});
