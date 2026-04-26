function normalizeMessage(message, fallback) {
  const text = message != null ? String(message).trim() : '';
  if (text) return text;
  return fallback || '请求失败';
}

function buildErrorPayload(message, options) {
  const opts = options && typeof options === 'object' ? options : {};
  const payload = {
    error: normalizeMessage(message, opts.fallbackMessage),
    message: normalizeMessage(message, opts.fallbackMessage),
  };
  if (opts.detail !== undefined) payload.detail = opts.detail;
  if (opts.requestId) payload.requestId = opts.requestId;
  if (opts.extra && typeof opts.extra === 'object') {
    Object.assign(payload, opts.extra);
  }
  return payload;
}

function sendError(res, status, message, options) {
  return res.status(status).json(buildErrorPayload(message, options));
}

function sendAdminError(req, res, status, message, options) {
  const opts = Object.assign({}, options || {}, {
    requestId: req && req.requestId ? req.requestId : undefined,
  });
  return sendError(res, status, message, opts);
}

module.exports = {
  buildErrorPayload,
  sendError,
  sendAdminError,
};
