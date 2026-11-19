// NutCheck command line tool.
//   decode <token>        show what a Cashu token contains (offline)
//   check <token>         decode it and ask its mint about the keysets
//   encode <file.json>    build a token from a JSON file (--v4 for V4)
//   mint <url>            show a mint's info and keysets
//   demo                  run the scripted demo
// Tokens can come from a file with --file <path> instead of the argument.

import { readFileSync } from 'node:fs';
import { decodeToken, encodeTokenV3, encodeTokenV4 } from './token.js';
import { buildReport, buildJsonReport } from './report.js';
import { checkTokenAgainstMint, getMintInfo, getMintKeysets, buildMintReport } from './mint.js';

const HELP = `NutCheck: inspect Cashu tokens.

Usage:
  nutcheck decode <token> [--json] [--file <path>]
  nutcheck check <token> [--json] [--file <path>]
  nutcheck encode <file.json> [--v4]
  nutcheck mint <url>
  nutcheck demo
  nutcheck help

decode reads a cashuA or cashuB token and prints its mint, unit, total
amount, memo and proofs. It never touches the network.

check does the same, then asks the token's mint for its info and keysets
and reports whether the token's keysets are known and active there.

encode builds a token from a JSON file shaped like this:
  {"mints":[{"mint":"https://example.com","proofs":[
    {"amount":1,"id":"00ab...","secret":"...","C":"02..."}]}],
   "unit":"sat","memo":"optional"}
Use --v4 to emit a cashuB token (single mint only).

mint prints a mint's name, version, supported NUTs and keysets.

A decoded token is not a verified token. Only the mint can confirm a
proof is unspent, and only at spend time.
`;

function fail(msg) {
  process.stderr.write('Error: ' + msg + '\n');
  process.exitCode = 1;
}

function readTokenArg(args) {
  const fileIdx = args.indexOf('--file');
  if (fileIdx !== -1) {
    const path = args[fileIdx + 1];
    if (!path) throw new Error('--file needs a path');
    return readFileSync(path, 'utf8').trim();
  }
  const token = args.find((a) => !a.startsWith('--'));
  if (!token) throw new Error('a token is required');
  return token;
}

function asJson(obj) {
  process.stdout.write(JSON.stringify(obj, null, 2) + '\n');
}

async function cmdDecode(args) {
  const token = decodeToken(readTokenArg(args));
  if (args.includes('--json')) asJson(buildJsonReport(token));
  else process.stdout.write(buildReport(token) + '\n');
}

async function cmdCheck(args) {
  const token = decodeToken(readTokenArg(args));
  const checks = await checkTokenAgainstMint(token);
  if (args.includes('--json')) {
    asJson({ ...buildJsonReport(token), mintChecks: checks });
    return;
  }
  process.stdout.write(buildReport(token) + '\n\n');
  for (const c of checks) {
    process.stdout.write('Mint check: ' + c.mint + '\n');
    if (!c.reachable) {
      process.stdout.write('  unreachable: ' + (c.error || 'unknown error') + '\n');
      continue;
    }
    if (c.name) process.stdout.write('  name: ' + c.name + '\n');
    if (c.version) process.stdout.write('  version: ' + c.version + '\n');
    for (const k of c.keysets) {
      let line = '  keyset ' + k.id + ': ' + k.status;
      if (k.status === 'known') {
        line += ', ' + (k.active ? 'active' : 'inactive');
        if (k.unit) line += ', unit ' + k.unit;
        if (k.inputFeePpk != null) line += ', fee ' + k.inputFeePpk + ' ppk';
      }
      process.stdout.write(line + '\n');
    }
  }
}

async function cmdEncode(args) {
  const path = args.find((a) => !a.startsWith('--'));
  if (!path) throw new Error('encode needs a JSON file path');
  const token = JSON.parse(readFileSync(path, 'utf8'));
  const out = args.includes('--v4') ? encodeTokenV4(token) : encodeTokenV3(token);
  process.stdout.write(out + '\n');
}

async function cmdMint(args) {
  const url = args.find((a) => !a.startsWith('--'));
  if (!url) throw new Error('mint needs a URL');
  const info = await getMintInfo(url);
  const keysets = await getMintKeysets(url);
  process.stdout.write(buildMintReport(url, info, keysets) + '\n');
}

export async function main(argv) {
  const [cmd, ...args] = argv;
  try {
    if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') {
      process.stdout.write(HELP);
      return;
    }
    if (cmd === 'decode') await cmdDecode(args);
    else if (cmd === 'check') await cmdCheck(args);
    else if (cmd === 'encode') await cmdEncode(args);
    else if (cmd === 'mint') await cmdMint(args);
    else if (cmd === 'demo') {
      const { runDemo } = await import('./demo.js');
      await runDemo();
    } else {
      fail('unknown command "' + cmd + '". Run "nutcheck help".');
    }
  } catch (err) {
    fail(err.message);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2));
}
