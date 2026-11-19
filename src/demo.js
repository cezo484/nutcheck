// Scripted demo: decodes the two NUT-00 example tokens, round-trips an
// encode, and checks the live test mint. Run with: npm run demo

import { decodeToken, encodeTokenV3, encodeTokenV4, tokenTotals } from './token.js';
import { buildReport } from './report.js';
import { getMintInfo, getMintKeysets, buildMintReport, checkTokenAgainstMint } from './mint.js';
import { V3_SPEC_TOKEN, V4_SPEC_TOKEN } from './vectors.js';

export async function runDemo() {
  console.log('=== 1. Decode the NUT-00 V3 example token ===\n');
  const v3 = decodeToken(V3_SPEC_TOKEN);
  console.log(buildReport(v3));

  console.log('\n=== 2. Decode the NUT-00 V4 example token ===\n');
  const v4 = decodeToken(V4_SPEC_TOKEN);
  console.log(buildReport(v4));

  console.log('\n=== 3. Encode round trip ===\n');
  const back3 = decodeToken(encodeTokenV3(v3));
  const back4 = decodeToken(encodeTokenV4(v4));
  console.log('V3 round trip total: ' + tokenTotals(back3).total + ' ' + back3.unit +
    ' (expected 10 sat)');
  console.log('V4 round trip total: ' + tokenTotals(back4).total + ' ' + back4.unit +
    ' (expected 4 sat)');

  console.log('\n=== 4. Live test mint: testnut.cashu.space ===\n');
  const mintUrl = 'https://testnut.cashu.space';
  const info = await getMintInfo(mintUrl);
  const keysets = await getMintKeysets(mintUrl);
  console.log(buildMintReport(mintUrl, info, keysets));

  console.log('\n=== 5. Mint check on a token pointing at the test mint ===\n');
  const satKeyset = keysets.find((k) => k.unit === 'sat');
  const demoToken = {
    version: 'A',
    mints: [{
      mint: mintUrl,
      proofs: [{
        amount: 1,
        id: satKeyset.id,
        secret: 'demo-secret-not-a-real-proof',
        C: '02' + '00'.repeat(32),
      }],
    }],
    unit: 'sat',
    memo: 'demo token, keyset check only',
  };
  const checks = await checkTokenAgainstMint(demoToken);
  for (const c of checks) {
    console.log('Mint: ' + c.mint + ' reachable: ' + c.reachable);
    for (const k of c.keysets) {
      console.log('  keyset ' + k.id.slice(0, 16) + '...: ' + k.status +
        ', ' + (k.active ? 'active' : 'inactive') + ', unit ' + k.unit);
    }
  }
  console.log('\nNote: the demo token in step 5 is not a real proof. The check');
  console.log('only confirms the mint is up and knows the keyset.');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runDemo().catch((err) => {
    console.error('Demo failed: ' + err.message);
    process.exitCode = 1;
  });
}
