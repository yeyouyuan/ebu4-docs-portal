'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const { Duplex } = require('node:stream');

class MockSocket extends Duplex {
  constructor() {
    super();
    this.remoteAddress = '127.0.0.1';
    this.encrypted = false;
    this.writable = true;
    this.readable = true;
  }

  _read() {}

  _write(_chunk, _encoding, callback) {
    callback();
  }

  setTimeout() {}

  destroy() {
    this.destroyed = true;
  }

  cork() {}

  uncork() {}
}

async function requestApp(app, options) {
  return new Promise((resolve, reject) => {
    const opts = options || {};
    const body = opts.body == null ? '' : String(opts.body);
    const socket = new MockSocket();
    const req = new http.IncomingMessage(socket);
    req.method = opts.method || 'GET';
    req.url = opts.path || '/';
    req.originalUrl = req.url;
    req.headers = {};
    Object.keys(opts.headers || {}).forEach((key) => {
      req.headers[String(key).toLowerCase()] = opts.headers[key];
    });
    if (!req.headers.host) req.headers.host = 'localhost';
    if (body && !req.headers['content-length']) {
      req.headers['content-length'] = String(Buffer.byteLength(body));
    }
    const res = new http.ServerResponse(req);
    const chunks = [];
    let settled = false;
    function settle() {
      if (settled) return;
      settled = true;
      resolve({
        status: res.statusCode,
        headers: res.getHeaders(),
        text: Buffer.concat(chunks).toString('utf-8'),
      });
    }
    res.write = function write(chunk, encoding, callback) {
      if (chunk) chunks.push(Buffer.from(chunk));
      if (typeof callback === 'function') callback();
      return true;
    };
    res.end = function end(chunk, encoding, callback) {
      if (chunk) chunks.push(Buffer.from(chunk, encoding));
      this.finished = true;
      if (typeof callback === 'function') callback();
      process.nextTick(() => {
        this.emit('finish');
        this.emit('close');
      });
      settle();
      return this;
    };
    res.on('finish', settle);
    res.on('close', settle);
    res.on('error', reject);

    try {
      app.handle(req, res, reject);
      if (body) req.push(body);
      req.push(null);
    } catch (e) {
      reject(e);
    }
  });
}

function extractCookie(setCookie) {
  const value = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  return String(value || '').split(';')[0];
}

async function httpJson(app, path, options) {
  const result = await requestApp(
    app,
    Object.assign({}, options || {}, {
      path,
    })
  );
  let data = null;
  try {
    data = result.text ? JSON.parse(result.text) : null;
  } catch (_) {
    data = { raw: result.text };
  }
  return { res: result, data };
}

async function login(app, username, password) {
  const { res, data } = await httpJson(app, '/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  assert.equal(res.status, 200);
  return {
    cookie: extractCookie(res.headers['set-cookie']),
    data,
  };
}

module.exports = {
  httpJson,
  login,
};
