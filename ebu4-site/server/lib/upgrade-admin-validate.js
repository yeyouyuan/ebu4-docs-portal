function isValidHttpUrl(raw) {
  if (!raw) return false;
  try {
    const url = new URL(String(raw));
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch (_) {
    return false;
  }
}

function validateUpgradeConfig(siteSettings) {
  const upgrade =
    siteSettings && siteSettings.upgrade && typeof siteSettings.upgrade === 'object'
      ? siteSettings.upgrade
      : {};
  const detail = [];
  if (upgrade.enabled !== true) {
    return { ok: true, detail, upgrade };
  }
  if (!String(upgrade.baseUrl || '').trim()) {
    detail.push({ field: 'upgrade.baseUrl', message: '已启用远程升级时必须填写 baseUrl' });
  } else if (!isValidHttpUrl(upgrade.baseUrl)) {
    detail.push({ field: 'upgrade.baseUrl', message: 'upgrade.baseUrl 必须是合法的 http(s) 地址' });
  }
  const manifestPath = String(upgrade.manifestPath || '').trim();
  if (!manifestPath) {
    detail.push({ field: 'upgrade.manifestPath', message: '已启用远程升级时必须填写 manifestPath' });
  } else if (!manifestPath.startsWith('/')) {
    detail.push({ field: 'upgrade.manifestPath', message: 'manifestPath 必须以 / 开头' });
  }
  const channel = String(upgrade.checkChannels || 'both').trim();
  if (!['docs', 'system', 'both'].includes(channel)) {
    detail.push({ field: 'upgrade.checkChannels', message: 'checkChannels 仅支持 docs、system、both' });
  }
  return {
    ok: detail.length === 0,
    detail,
    upgrade,
  };
}

function validateUpgradeApplyRequest(body) {
  const payload = body && typeof body === 'object' ? body : {};
  const detail = [];
  const channel = payload.channel === 'system' ? 'system' : payload.channel === 'docs' || payload.channel == null ? 'docs' : '';
  if (!channel) {
    detail.push({ field: 'channel', message: 'channel 仅支持 docs 或 system' });
  }
  const artifactIndex = payload.artifactIndex != null ? parseInt(payload.artifactIndex, 10) : 0;
  if (!Number.isFinite(artifactIndex) || artifactIndex < 0) {
    detail.push({ field: 'artifactIndex', message: 'artifactIndex 必须是非负整数' });
  }
  return {
    ok: detail.length === 0,
    detail,
    channel: channel || 'docs',
    artifactIndex,
  };
}

function validateBuildArtifactsRequest(body, normalizeSystemPackageScopes) {
  const payload = body && typeof body === 'object' ? body : {};
  const detail = [];
  const docs = payload.docs !== false;
  const system = payload.system !== false;
  if (!docs && !system) {
    detail.push({ field: 'docs', message: 'docs 和 system 不能同时关闭' });
  }
  let systemScopes;
  if (Array.isArray(payload.systemScopes)) {
    try {
      systemScopes = normalizeSystemPackageScopes(payload.systemScopes);
    } catch (e) {
      detail.push({ field: 'systemScopes', message: String(e.message || e) });
    }
  }
  return {
    ok: detail.length === 0,
    detail,
    docs,
    system,
    systemScopes,
  };
}

module.exports = {
  validateUpgradeConfig,
  validateUpgradeApplyRequest,
  validateBuildArtifactsRequest,
};
