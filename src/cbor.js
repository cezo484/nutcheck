// Minimal CBOR decoder and encoder, enough for Cashu V4 tokens (NUT-00).
// Supports major types 0 to 7, definite and indefinite lengths, tags.
// Integers stay as numbers when safe, otherwise decoding throws.

const BREAK = 0x1f;

function readLength(buf, offset, info) {
  if (info < 24) return { value: info, offset };
  if (info === 24) {
    if (offset >= buf.length) throw new Error('cbor: truncated length');
    return { value: buf[offset], offset: offset + 1 };
  }
  if (info === 25) {
    if (offset + 2 > buf.length) throw new Error('cbor: truncated length');
    return { value: buf.readUInt16BE(offset), offset: offset + 2 };
  }
  if (info === 26) {
    if (offset + 4 > buf.length) throw new Error('cbor: truncated length');
    return { value: buf.readUInt32BE(offset), offset: offset + 4 };
  }
  if (info === 27) {
    if (offset + 8 > buf.length) throw new Error('cbor: truncated length');
    const big = buf.readBigUInt64BE(offset);
    if (big > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error('cbor: integer too large');
    }
    return { value: Number(big), offset: offset + 8 };
  }
  throw new Error('cbor: bad additional info ' + info);
}

function decodeOne(buf, offset) {
  if (offset >= buf.length) throw new Error('cbor: unexpected end of input');
  const head = buf[offset];
  offset += 1;
  const major = head >> 5;
  const info = head & 0x1f;

  if (major === 7) {
    if (info === 20) return { value: false, offset };
    if (info === 21) return { value: true, offset };
    if (info === 22) return { value: null, offset };
    if (info === 23) return { value: undefined, offset };
    if (info === 25) {
      if (offset + 2 > buf.length) throw new Error('cbor: truncated float');
      const bits = buf.readUInt16BE(offset);
      const sign = (bits >> 15) & 1 ? -1 : 1;
      const exp = (bits >> 10) & 0x1f;
      const frac = bits & 0x3ff;
      let value;
      if (exp === 0) value = sign * frac * Math.pow(2, -24);
      else if (exp === 31) value = frac === 0 ? sign * Infinity : NaN;
      else value = sign * (1 + frac / 1024) * Math.pow(2, exp - 15);
      return { value, offset: offset + 2 };
    }
    if (info === 26) {
      if (offset + 4 > buf.length) throw new Error('cbor: truncated float');
      return { value: buf.readFloatBE(offset), offset: offset + 4 };
    }
    if (info === 27) {
      if (offset + 8 > buf.length) throw new Error('cbor: truncated float');
      return { value: buf.readDoubleBE(offset), offset: offset + 8 };
    }
    throw new Error('cbor: unsupported simple value ' + info);
  }

  if (major === 6) {
    // Tag: ignore the tag number, decode the tagged item.
    const len = readLength(buf, offset, info);
    return decodeOne(buf, len.offset);
  }

  if (info === BREAK) {
    if (major === 2 || major === 3) {
      // Indefinite-length byte/text string: concatenated chunks.
      const chunks = [];
      let cur = offset;
      while (true) {
        if (cur >= buf.length) throw new Error('cbor: unterminated string');
        if (buf[cur] === 0xff) return {
          value: major === 2 ? Buffer.concat(chunks) : chunks.map((c) => c.toString('utf8')).join(''),
          offset: cur + 1,
        };
        const item = decodeOne(buf, cur);
        if (major === 2 && !Buffer.isBuffer(item.value)) throw new Error('cbor: bad chunk in byte string');
        if (major === 3 && typeof item.value !== 'string') throw new Error('cbor: bad chunk in text string');
        chunks.push(major === 2 ? item.value : Buffer.from(item.value, 'utf8'));
        cur = item.offset;
      }
    }
    if (major === 4 || major === 5) {
      const arr = [];
      const map = {};
      let cur = offset;
      while (true) {
        if (cur >= buf.length) throw new Error('cbor: unterminated collection');
        if (buf[cur] === 0xff) return { value: major === 4 ? arr : map, offset: cur + 1 };
        const key = decodeOne(buf, cur);
        if (major === 4) {
          arr.push(key.value);
          cur = key.offset;
        } else {
          const val = decodeOne(buf, key.offset);
          map[String(key.value)] = val.value;
          cur = val.offset;
        }
      }
    }
    throw new Error('cbor: indefinite length not allowed here');
  }

  const len = readLength(buf, offset, info);
  offset = len.offset;

  if (major === 0) return { value: len.value, offset };
  if (major === 1) return { value: -1 - len.value, offset };
  if (major === 2) {
    if (offset + len.value > buf.length) throw new Error('cbor: truncated byte string');
    return { value: buf.subarray(offset, offset + len.value), offset: offset + len.value };
  }
  if (major === 3) {
    if (offset + len.value > buf.length) throw new Error('cbor: truncated text string');
    return { value: buf.subarray(offset, offset + len.value).toString('utf8'), offset: offset + len.value };
  }
  if (major === 4) {
    const arr = [];
    let cur = offset;
    for (let i = 0; i < len.value; i++) {
      const item = decodeOne(buf, cur);
      arr.push(item.value);
      cur = item.offset;
    }
    return { value: arr, offset: cur };
  }
  if (major === 5) {
    const map = {};
    let cur = offset;
    for (let i = 0; i < len.value; i++) {
      const key = decodeOne(buf, cur);
      const val = decodeOne(buf, key.offset);
      map[String(key.value)] = val.value;
      cur = val.offset;
    }
    return { value: map, offset: cur };
  }
  throw new Error('cbor: unknown major type ' + major);
}

export function cborDecode(buf) {
  const bytes = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  const result = decodeOne(bytes, 0);
  if (result.offset !== bytes.length) {
    throw new Error('cbor: trailing bytes after token');
  }
  return result.value;
}

function encodeHead(major, value) {
  const mt = major << 5;
  if (value < 24) return Buffer.from([mt | value]);
  if (value < 256) return Buffer.from([mt | 24, value]);
  if (value < 65536) {
    const b = Buffer.alloc(3);
    b[0] = mt | 25;
    b.writeUInt16BE(value, 1);
    return b;
  }
  if (value < 4294967296) {
    const b = Buffer.alloc(5);
    b[0] = mt | 26;
    b.writeUInt32BE(value, 1);
    return b;
  }
  const b = Buffer.alloc(9);
  b[0] = mt | 27;
  b.writeBigUInt64BE(BigInt(value), 1);
  return b;
}

export function cborEncode(value) {
  if (typeof value === 'number') {
    if (!Number.isInteger(value)) throw new Error('cbor: only integers can be encoded');
    if (value >= 0) return encodeHead(0, value);
    return encodeHead(1, -1 - value);
  }
  if (typeof value === 'string') {
    const bytes = Buffer.from(value, 'utf8');
    return Buffer.concat([encodeHead(3, bytes.length), bytes]);
  }
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    const bytes = Buffer.from(value);
    return Buffer.concat([encodeHead(2, bytes.length), bytes]);
  }
  if (Array.isArray(value)) {
    return Buffer.concat([encodeHead(4, value.length), ...value.map(cborEncode)]);
  }
  if (value !== null && typeof value === 'object') {
    const keys = Object.keys(value);
    const parts = [encodeHead(5, keys.length)];
    for (const key of keys) {
      parts.push(cborEncode(key));
      parts.push(cborEncode(value[key]));
    }
    return Buffer.concat(parts);
  }
  if (value === false) return Buffer.from([0xf4]);
  if (value === true) return Buffer.from([0xf5]);
  if (value === null) return Buffer.from([0xf6]);
  throw new Error('cbor: cannot encode value of type ' + typeof value);
}
