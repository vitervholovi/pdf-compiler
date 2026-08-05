/**
 * Minimal ZIP read/write for OOXML (xlsx) preprocess.
 * Supports stored (0) and deflated (8) entries.
 */
import { inflateRawSync, deflateRawSync } from 'zlib';

function u16(buf, off) {
  return buf.readUInt16LE(off);
}

function u32(buf, off) {
  return buf.readUInt32LE(off);
}

function findEocd(buf) {
  // EOCD is at least 22 bytes; comment max 65535
  const min = Math.max(0, buf.length - 65557);
  for (let i = buf.length - 22; i >= min; i--) {
    if (u32(buf, i) === 0x06054b50) return i;
  }
  throw new Error('ZIP EOCD not found');
}

/**
 * @param {Buffer} buf
 * @returns {Map<string, Buffer>}
 */
export function readZip(buf) {
  const eocd = findEocd(buf);
  const count = u16(buf, eocd + 10);
  const centralSize = u32(buf, eocd + 12);
  const centralOffset = u32(buf, eocd + 16);
  const entries = new Map();
  let off = centralOffset;

  for (let n = 0; n < count; n++) {
    if (u32(buf, off) !== 0x02014b50) throw new Error('Invalid ZIP central header');
    const method = u16(buf, off + 10);
    const compSize = u32(buf, off + 20);
    const nameLen = u16(buf, off + 28);
    const extraLen = u16(buf, off + 30);
    const commentLen = u16(buf, off + 32);
    const localOff = u32(buf, off + 42);
    const name = buf.subarray(off + 46, off + 46 + nameLen).toString('utf8');
    off += 46 + nameLen + extraLen + commentLen;

    if (name.endsWith('/')) continue;

    if (u32(buf, localOff) !== 0x04034b50) throw new Error(`Invalid local header for ${name}`);
    const localNameLen = u16(buf, localOff + 26);
    const localExtraLen = u16(buf, localOff + 28);
    const dataStart = localOff + 30 + localNameLen + localExtraLen;
    // Prefer local sizes when data descriptor flag set — use central sizes
    const compressed = buf.subarray(dataStart, dataStart + compSize);
    let data;
    if (method === 0) data = Buffer.from(compressed);
    else if (method === 8) data = inflateRawSync(compressed);
    else throw new Error(`Unsupported ZIP method ${method} for ${name}`);
    entries.set(name, data);
  }

  // silence unused
  void centralSize;
  return entries;
}

/**
 * @param {Map<string, Buffer>|Record<string, Buffer>} entries
 * @returns {Buffer}
 */
export function writeZip(entries) {
  const files = entries instanceof Map ? [...entries.entries()] : Object.entries(entries);
  const locals = [];
  const central = [];
  let offset = 0;

  for (const [name, data] of files) {
    const nameBuf = Buffer.from(name, 'utf8');
    const raw = Buffer.isBuffer(data) ? data : Buffer.from(data);
    const compressed = deflateRawSync(raw);
    const useStore = compressed.length >= raw.length;
    const payload = useStore ? raw : compressed;
    const method = useStore ? 0 : 8;
    const crc = crc32(raw);

    const local = Buffer.alloc(30 + nameBuf.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(payload.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    nameBuf.copy(local, 30);

    const cen = Buffer.alloc(46 + nameBuf.length);
    cen.writeUInt32LE(0x02014b50, 0);
    cen.writeUInt16LE(20, 4);
    cen.writeUInt16LE(20, 6);
    cen.writeUInt16LE(0, 8);
    cen.writeUInt16LE(method, 10);
    cen.writeUInt16LE(0, 12);
    cen.writeUInt16LE(0, 14);
    cen.writeUInt32LE(crc, 16);
    cen.writeUInt32LE(payload.length, 20);
    cen.writeUInt32LE(raw.length, 24);
    cen.writeUInt16LE(nameBuf.length, 28);
    cen.writeUInt16LE(0, 30);
    cen.writeUInt16LE(0, 32);
    cen.writeUInt16LE(0, 34);
    cen.writeUInt16LE(0, 36);
    cen.writeUInt32LE(0, 38);
    cen.writeUInt32LE(offset, 42);
    nameBuf.copy(cen, 46);

    locals.push(local, payload);
    central.push(cen);
    offset += local.length + payload.length;
  }

  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...locals, centralBuf, end]);
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
