/**
 * 密码哈希（scrypt），与存储格式 saltHex:hashHex 兼容。
 */
const crypto = require('crypto');

const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

function hashPassword(plain) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(plain), salt, 64, SCRYPT_PARAMS);
  return salt.toString('hex') + ':' + hash.toString('hex');
}

function verifyPassword(plain, stored) {
  if (!stored || typeof stored !== 'string') return false;
  const i = stored.indexOf(':');
  if (i === -1) return false;
  const saltHex = stored.slice(0, i);
  const hashHex = stored.slice(i + 1);
  try {
    const salt = Buffer.from(saltHex, 'hex');
    const expected = Buffer.from(hashHex, 'hex');
    const hash = crypto.scryptSync(String(plain), salt, expected.length, SCRYPT_PARAMS);
    return crypto.timingSafeEqual(hash, expected);
  } catch (_) {
    return false;
  }
}

module.exports = { hashPassword, verifyPassword };
