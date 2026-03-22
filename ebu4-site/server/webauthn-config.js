function webauthnEnabled() {
  const d = process.env.WEBAUTHN_DISABLED;
  return d !== '1' && d !== 'true';
}

/**
 * @param {import('express').Request} req
 */
function getWebAuthnConfig(req) {
  const host = req.get('host') || 'localhost';
  const hostname = host.split(':')[0];
  const rpID = String(process.env.WEBAUTHN_RP_ID || hostname).trim() || hostname;
  const rpName = String(process.env.WEBAUTHN_RP_NAME || 'EBU4').trim() || 'EBU4';
  let origin = process.env.WEBAUTHN_ORIGIN && String(process.env.WEBAUTHN_ORIGIN).trim();
  if (!origin) {
    const xf = req.headers['x-forwarded-proto'];
    const proto =
      (typeof xf === 'string' && xf.split(',')[0].trim()) || (req.secure ? 'https' : 'http');
    origin = `${proto}://${host}`;
  }
  origin = origin.replace(/\/$/, '');
  return { rpID, rpName, origin };
}

module.exports = { webauthnEnabled, getWebAuthnConfig };
