// Human-readable report for a decoded token.

import { tokenTotals } from './token.js';

function shortSecret(secret) {
  if (secret.length <= 16) return secret;
  return secret.slice(0, 8) + '...' + secret.slice(-4);
}

export function buildReport(token) {
  const { total, proofCount, keysets } = tokenTotals(token);
  const lines = [];
  lines.push('Cashu token (V' + (token.version === 'A' ? '3' : '4') + ', cashu' + token.version + ')');
  lines.push('Mint: ' + token.mints.map((m) => m.mint).join(', '));
  lines.push('Unit: ' + token.unit);
  lines.push('Total: ' + total + ' ' + token.unit);
  lines.push('Proofs: ' + proofCount);
  if (token.memo) lines.push('Memo: ' + token.memo);
  lines.push('');
  lines.push('Keysets:');
  for (const [id, info] of Object.entries(keysets)) {
    lines.push('  ' + id + ' (' + info.kind + ', ' + info.count + ' proof' +
      (info.count === 1 ? '' : 's') + ', ' + info.total + ' ' + token.unit + ')');
  }
  lines.push('');
  lines.push('Proofs:');
  let n = 0;
  for (const m of token.mints) {
    for (const p of m.proofs) {
      n += 1;
      lines.push('  ' + n + '. ' + p.amount + ' ' + token.unit +
        '  keyset ' + p.id + '  secret ' + shortSecret(p.secret));
    }
  }
  return lines.join('\n');
}

export function buildJsonReport(token) {
  const { total, proofCount, keysets } = tokenTotals(token);
  return {
    version: token.version,
    mints: token.mints.map((m) => m.mint),
    unit: token.unit,
    memo: token.memo,
    total,
    proofCount,
    keysets: Object.entries(keysets).map(([id, info]) => ({ id, ...info })),
    proofs: token.mints.flatMap((m) => m.proofs.map((p) => ({
      mint: m.mint,
      amount: p.amount,
      id: p.id,
      secret: p.secret,
      C: p.C,
    }))),
  };
}
