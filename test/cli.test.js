import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFileSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { V3_SPEC_TOKEN, V4_SPEC_TOKEN } from '../src/vectors.js';

const execFileAsync = promisify(execFile);
const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'cli.js');

async function runCli(args) {
  return execFileAsync('node', [CLI, ...args], { timeout: 15000 });
}

test('decode prints the V3 report', async () => {
  const { stdout } = await runCli(['decode', V3_SPEC_TOKEN]);
  assert.match(stdout, /Cashu token \(V3, cashuA\)/);
  assert.match(stdout, /Mint: https:\/\/8333\.space:3338/);
  assert.match(stdout, /Total: 10 sat/);
  assert.match(stdout, /Proofs: 2/);
  assert.match(stdout, /Memo: Thank you\./);
});

test('decode prints the V4 report', async () => {
  const { stdout } = await runCli(['decode', V4_SPEC_TOKEN]);
  assert.match(stdout, /Cashu token \(V4, cashuB\)/);
  assert.match(stdout, /Mint: http:\/\/localhost:3338/);
  assert.match(stdout, /Total: 4 sat/);
  assert.match(stdout, /Proofs: 3/);
});

test('decode --json prints structured output', async () => {
  const { stdout } = await runCli(['decode', V3_SPEC_TOKEN, '--json']);
  const data = JSON.parse(stdout);
  assert.equal(data.total, 10);
  assert.equal(data.proofCount, 2);
  assert.equal(data.memo, 'Thank you.');
  assert.equal(data.proofs[0].amount, 2);
});

test('decode reads a token from --file', async () => {
  const path = join(dirname(fileURLToPath(import.meta.url)), 'tmp-token.txt');
  writeFileSync(path, V3_SPEC_TOKEN + '\n');
  try {
    const { stdout } = await runCli(['decode', '--file', path]);
    assert.match(stdout, /Total: 10 sat/);
  } finally {
    unlinkSync(path);
  }
});

test('encode builds a V3 token from a JSON file', async () => {
  const path = join(dirname(fileURLToPath(import.meta.url)), 'tmp-token.json');
  const token = {
    mints: [{
      mint: 'https://example.com',
      proofs: [{ amount: 5, id: '009a1f293253e41e', secret: 'abc', C: '02' + '11'.repeat(32) }],
    }],
    unit: 'sat',
    memo: 'test',
  };
  writeFileSync(path, JSON.stringify(token));
  try {
    const { stdout } = await runCli(['encode', path]);
    assert.ok(stdout.trim().startsWith('cashuA'));
    const { stdout: decoded } = await runCli(['decode', stdout.trim()]);
    assert.match(decoded, /Total: 5 sat/);
    assert.match(decoded, /Memo: test/);
  } finally {
    unlinkSync(path);
  }
});

test('encode --v4 builds a V4 token', async () => {
  const path = join(dirname(fileURLToPath(import.meta.url)), 'tmp-token.json');
  const token = {
    mints: [{
      mint: 'https://example.com',
      proofs: [{ amount: 3, id: '009a1f293253e41e', secret: 'abc', C: '02' + '11'.repeat(32) }],
    }],
    unit: 'sat',
  };
  writeFileSync(path, JSON.stringify(token));
  try {
    const { stdout } = await runCli(['encode', path, '--v4']);
    assert.ok(stdout.trim().startsWith('cashuB'));
    const { stdout: decoded } = await runCli(['decode', stdout.trim()]);
    assert.match(decoded, /Total: 3 sat/);
  } finally {
    unlinkSync(path);
  }
});

test('a bad token exits non-zero with an error', async () => {
  await assert.rejects(runCli(['decode', 'nonsense']), /must start/);
});

test('help prints usage', async () => {
  const { stdout } = await runCli(['help']);
  assert.match(stdout, /NutCheck: inspect Cashu tokens/);
  assert.match(stdout, /decode <token>/);
});
