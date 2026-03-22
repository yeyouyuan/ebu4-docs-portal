const crypto = require('crypto');

/** @type {Map<string, { exp: number, [k: string]: unknown }>} */
const store = new Map();

function put(payload) {
  const id = crypto.randomBytes(16).toString('hex');
  const exp = Date.now() + 5 * 60 * 1000;
  store.set(id, Object.assign({}, payload, { exp }));
  return id;
}

function take(id) {
  const v = store.get(id);
  if (!v || Date.now() > v.exp) {
    store.delete(id);
    return null;
  }
  store.delete(id);
  return v;
}

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of store) {
    if (v.exp < now) store.delete(k);
  }
}, 60 * 1000).unref();

module.exports = { put, take };
