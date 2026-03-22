/**
 * 浏览器 WebAuthn 响应 → @simplewebauthn/server 所需 JSON
 */
(function (global) {
  /** Base64URL → Uint8Array（供 navigator.credentials.get/create） */
  function b64urlToBuf(s) {
    var t = String(s || '')
      .replace(/-/g, '+')
      .replace(/_/g, '/');
    while (t.length % 4) t += '=';
    var bin = atob(t);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function prepareRequestOptions(options) {
    if (!options || typeof options !== 'object') return options;
    var o = JSON.parse(JSON.stringify(options));
    o.challenge = b64urlToBuf(o.challenge);
    if (o.allowCredentials && o.allowCredentials.length) {
      o.allowCredentials = o.allowCredentials.map(function (c) {
        return {
          type: c.type || 'public-key',
          id: b64urlToBuf(c.id),
          transports: c.transports,
        };
      });
    }
    return o;
  }

  function prepareCreateOptions(options) {
    if (!options || typeof options !== 'object') return options;
    var o = JSON.parse(JSON.stringify(options));
    o.challenge = b64urlToBuf(o.challenge);
    if (o.user && o.user.id) o.user.id = b64urlToBuf(o.user.id);
    if (o.excludeCredentials && o.excludeCredentials.length) {
      o.excludeCredentials = o.excludeCredentials.map(function (c) {
        return {
          type: c.type || 'public-key',
          id: b64urlToBuf(c.id),
          transports: c.transports,
        };
      });
    }
    return o;
  }

  function bufToB64url(buf) {
    var bytes = buf instanceof ArrayBuffer ? new Uint8Array(buf) : buf;
    if (!(bytes instanceof Uint8Array)) return '';
    var s = '';
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function registrationToJSON(cred) {
    if (!(cred instanceof PublicKeyCredential)) return null;
    var r = cred.response;
    if (!(r instanceof AuthenticatorAttestationResponse)) return null;
    var transports = typeof r.getTransports === 'function' ? r.getTransports() : [];
    return {
      id: cred.id,
      rawId: bufToB64url(cred.rawId),
      response: {
        clientDataJSON: bufToB64url(r.clientDataJSON),
        attestationObject: bufToB64url(r.attestationObject),
        transports: transports,
      },
      type: cred.type,
      clientExtensionResults: cred.getClientExtensionResults(),
    };
  }

  function authenticationToJSON(cred) {
    if (!(cred instanceof PublicKeyCredential)) return null;
    var r = cred.response;
    if (!(r instanceof AuthenticatorAssertionResponse)) return null;
    var uh = r.userHandle;
    return {
      id: cred.id,
      rawId: bufToB64url(cred.rawId),
      response: {
        clientDataJSON: bufToB64url(r.clientDataJSON),
        authenticatorData: bufToB64url(r.authenticatorData),
        signature: bufToB64url(r.signature),
        userHandle: uh && uh.byteLength ? bufToB64url(uh) : undefined,
      },
      type: cred.type,
      clientExtensionResults: cred.getClientExtensionResults(),
    };
  }

  global.webauthnClient = {
    bufToB64url: bufToB64url,
    b64urlToBuf: b64urlToBuf,
    prepareRequestOptions: prepareRequestOptions,
    prepareCreateOptions: prepareCreateOptions,
    registrationToJSON: registrationToJSON,
    authenticationToJSON: authenticationToJSON,
    supported: function () {
      return !!(navigator.credentials && window.PublicKeyCredential);
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
