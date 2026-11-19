// Read-only mint lookups (NUT-06 info, NUT-02 keysets). No funds move here.
// The check answers two questions: is the mint reachable, and does it still
// know the keysets this token uses. Only the mint can confirm a proof is
// unspent, at spend time; this tool does not claim otherwise.

import { tokenTotals } from './token.js';

const TIMEOUT_MS = 10000;

export function normalizeMintUrl(url) {
  return String(url).trim().replace(/\/+$/, '');
}

export async function fetchJson(url, timeoutMs = TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error('HTTP ' + res.status + ' from ' + url);
    return await res.json();
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('timeout after ' + timeoutMs + 'ms for ' + url);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function getMintInfo(mintUrl) {
  const base = normalizeMintUrl(mintUrl);
  return fetchJson(base + '/v1/info');
}

export async function getMintKeysets(mintUrl) {
  const base = normalizeMintUrl(mintUrl);
  const data = await fetchJson(base + '/v1/keysets');
  if (!data || !Array.isArray(data.keysets)) throw new Error('mint returned no keysets array');
  return data.keysets;
}

// Resolve a token keyset id against the mint's keysets. A short id (16 hex
// chars) matches a full id by prefix. More than one match is ambiguous.
export function resolveKeyset(id, mintKeysets) {
  const exact = mintKeysets.find((k) => k.id.toLowerCase() === id.toLowerCase());
  if (exact) return { status: 'known', keyset: exact };
  if (id.length === 16) {
    const matches = mintKeysets.filter((k) => k.id.toLowerCase().startsWith(id.toLowerCase()));
    if (matches.length === 1) return { status: 'known', keyset: matches[0] };
    if (matches.length > 1) return { status: 'ambiguous', keyset: null };
  }
  return { status: 'unknown', keyset: null };
}

export async function checkTokenAgainstMint(token) {
  const results = [];
  for (const entry of token.mints) {
    const base = normalizeMintUrl(entry.mint);
    const result = { mint: base, reachable: false, name: null, version: null, keysets: [], error: null };
    try {
      const info = await getMintInfo(base);
      const keysets = await getMintKeysets(base);
      result.reachable = true;
      result.name = info.name || null;
      result.version = info.version || null;
      const { keysets: used } = tokenTotals({ mints: [entry], unit: token.unit });
      for (const id of Object.keys(used)) {
        const resolved = resolveKeyset(id, keysets);
        result.keysets.push({
          id,
          status: resolved.status,
          active: resolved.keyset ? resolved.keyset.active : null,
          unit: resolved.keyset ? resolved.keyset.unit : null,
          inputFeePpk: resolved.keyset ? (resolved.keyset.input_fee_ppk ?? null) : null,
        });
      }
    } catch (err) {
      result.error = err.message;
    }
    results.push(result);
  }
  return results;
}

export function buildMintReport(mintUrl, info, keysets) {
  const lines = [];
  lines.push('Mint: ' + normalizeMintUrl(mintUrl));
  if (info.name) lines.push('Name: ' + info.name);
  if (info.version) lines.push('Version: ' + info.version);
  if (info.description) lines.push('About: ' + info.description);
  const nuts = info.nuts ? Object.keys(info.nuts).sort((a, b) => Number(a) - Number(b)) : [];
  if (nuts.length > 0) lines.push('Supported NUTs: ' + nuts.join(', '));
  lines.push('');
  lines.push('Keysets (' + keysets.length + '):');
  for (const k of keysets) {
    lines.push('  ' + k.id + '  unit ' + k.unit +
      '  ' + (k.active ? 'active' : 'inactive') +
      (k.input_fee_ppk != null ? '  fee ' + k.input_fee_ppk + ' ppk' : ''));
  }
  return lines.join('\n');
}
