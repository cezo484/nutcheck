# NutCheck

A Cashu token inspector. Paste a token and see what it contains: the mint, the unit, the total amount, the memo, and every proof with its keyset. It decodes both token formats from NUT-00: cashuA (V3, JSON) and cashuB (V4, CBOR).

It can also ask the token's mint whether it is up and whether it still knows the token's keysets. That check is read-only. It moves no funds.

Built for Nut November 2026, the Cashu community hackathon.

## Install

Node.js 20 or newer. No dependencies, nothing to install.

```
git clone <repo>
cd nutcheck
```

## Use it

Decode a token (offline, no network):

```
node src/cli.js decode cashuAeyJ0b2tlbiI6...
```

Decode it and check its mint:

```
node src/cli.js check cashuAeyJ0b2tlbiI6...
```

Long tokens can come from a file:

```
node src/cli.js decode --file token.txt
```

Print structured output instead of the text report:

```
node src/cli.js decode cashuAeyJ0b2tlbiI6... --json
```

Build a token from a JSON file (handy for testing):

```
node src/cli.js encode token.json
node src/cli.js encode token.json --v4
```

The JSON file looks like this:

```
{"mints":[{"mint":"https://example.com","proofs":[
  {"amount":1,"id":"009a1f293253e41e","secret":"...","C":"02..."}]}],
 "unit":"sat","memo":"optional"}
```

Show a mint's info and keysets:

```
node src/cli.js mint https://testnut.cashu.space
```

Run the scripted demo (decodes the two NUT-00 example tokens and checks the test mint):

```
npm run demo
```

## Web page

```
npm run web
```

Then open http://localhost:8080. The page decodes tokens in the browser. Nothing leaves your machine. The page does not do the mint check; use the command line tool for that.

## What the mint check means

The check fetches the mint's `/v1/info` and `/v1/keysets` and reports, for each keyset in the token, whether the mint knows it and whether it is active. A short keyset id (16 hex chars) is matched against the mint's full ids by prefix; if two full ids share the prefix, the result is marked ambiguous.

A decoded token is not a verified token. Only the mint can confirm a proof is unspent, and only at spend time. This tool does not claim a token is spendable.

## Tests

```
npm test
```

34 tests, all offline. The token tests use the example tokens from NUT-00. The mint tests run against a local stub server.

## Layout

```
src/
  base64.js   base64url helpers
  cbor.js     small CBOR decoder and encoder (no dependency)
  token.js    cashuA / cashuB parsing and encoding
  report.js   text and JSON reports
  mint.js     mint info, keysets, token checks
  cli.js      command line tool
  demo.js     scripted demo
  vectors.js  NUT-00 example tokens
test/         node:test suites
web/          browser page (imports the same code as the CLI)
serve.js      static server for the web page
```

## Limits

- No minting, melting, or swapping. NutCheck reads tokens; it never signs or spends anything. For a wallet, use one of the Cashu wallets listed on cashu.space.
- V4 tokens with unknown fields are accepted and the unknown fields are ignored, as the spec requires. DLEQ proofs inside V4 tokens are not verified.
- The mint check needs the mint to be reachable. Some mints block requests from some networks; an unreachable mint is reported, not treated as a failure of the token.
- Secrets are shortened in the text report. The JSON output shows full secrets, so do not share it.

## License

MIT. See LICENSE.
