import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { resolveKeyset, checkTokenAgainstMint, getMintInfo, getMintKeysets } from '../src/mint.js';

const INFO = {
  name: 'Stub mint',
  version: 'stub/1.0',
  description: 'A test mint',
  nuts: { 4: { methods: [], disabled: false }, 5: { methods: [], disabled: false } },
};

// Two keysets sharing the same 8-byte prefix, to test ambiguity.
const KEYSETS = [
  { id: '01' + 'aa'.repeat(32), unit: 'sat', active: true, input_fee_ppk: 0 },
  { id: '01' + 'aa'.repeat(31) + 'bb', unit: 'sat', active: false, input_fee_ppk: 100 },
  { id: '02' + 'cc'.repeat(32), unit: 'msat', active: true, input_fee_ppk: 50 },
];

function startStub() {
  const server = createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/v1/info') res.end(JSON.stringify(INFO));
    else if (req.url === '/v1/keysets') res.end(JSON.stringify({ keysets: KEYSETS }));
    else { res.statusCode = 404; res.end(JSON.stringify({ detail: 'not found', code: 404 })); }
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, url: `http://127.0.0.1:${server.address().port}` });
    });
  });
}

test('resolveKeyset matches full ids exactly', () => {
  const r = resolveKeyset(KEYSETS[0].id, KEYSETS);
  assert.equal(r.status, 'known');
  assert.equal(r.keyset.unit, 'sat');
});

test('resolveKeyset resolves a unique short id by prefix', () => {
  const short = KEYSETS[2].id.slice(0, 16);
  const r = resolveKeyset(short, KEYSETS);
  assert.equal(r.status, 'known');
  assert.equal(r.keyset.unit, 'msat');
});

test('resolveKeyset flags an ambiguous short id', () => {
  const short = KEYSETS[0].id.slice(0, 16);
  assert.equal(KEYSETS[1].id.slice(0, 16), short);
  const r = resolveKeyset(short, KEYSETS);
  assert.equal(r.status, 'ambiguous');
  assert.equal(r.keyset, null);
});

test('resolveKeyset reports unknown ids', () => {
  const r = resolveKeyset('09' + 'ff'.repeat(32), KEYSETS);
  assert.equal(r.status, 'unknown');
});

test('mint info and keysets come back from the stub', async () => {
  const { server, url } = await startStub();
  try {
    const info = await getMintInfo(url);
    assert.equal(info.name, 'Stub mint');
    assert.equal(info.version, 'stub/1.0');
    const keysets = await getMintKeysets(url);
    assert.equal(keysets.length, 3);
  } finally {
    server.close();
  }
});

test('checkTokenAgainstMint reports known, active and unknown keysets', async () => {
  const { server, url } = await startStub();
  try {
    const token = {
      version: 'A',
      mints: [{
        mint: url,
        proofs: [
          { amount: 1, id: KEYSETS[0].id, secret: 's1', C: '02' + '11'.repeat(32) },
          { amount: 2, id: KEYSETS[1].id, secret: 's2', C: '02' + '22'.repeat(32) },
          { amount: 4, id: '09' + 'ff'.repeat(32), secret: 's3', C: '02' + '33'.repeat(32) },
        ],
      }],
      unit: 'sat',
    };
    const checks = await checkTokenAgainstMint(token);
    assert.equal(checks.length, 1);
    assert.equal(checks[0].reachable, true);
    assert.equal(checks[0].name, 'Stub mint');
    const byId = Object.fromEntries(checks[0].keysets.map((k) => [k.id, k]));
    assert.equal(byId[KEYSETS[0].id].status, 'known');
    assert.equal(byId[KEYSETS[0].id].active, true);
    assert.equal(byId[KEYSETS[1].id].status, 'known');
    assert.equal(byId[KEYSETS[1].id].active, false);
    assert.equal(byId[KEYSETS[1].id].inputFeePpk, 100);
    assert.equal(byId['09' + 'ff'.repeat(32)].status, 'unknown');
  } finally {
    server.close();
  }
});

test('checkTokenAgainstMint reports an unreachable mint instead of throwing', async () => {
  const { server, url } = await startStub();
  await new Promise((resolve) => server.close(resolve));
  const token = {
    version: 'A',
    mints: [{ mint: url, proofs: [{ amount: 1, id: '00' + 'aa'.repeat(7), secret: 's', C: '02' + '11'.repeat(32) }] }],
    unit: 'sat',
  };
  const checks = await checkTokenAgainstMint(token);
  assert.equal(checks[0].reachable, false);
  assert.ok(checks[0].error);
});
