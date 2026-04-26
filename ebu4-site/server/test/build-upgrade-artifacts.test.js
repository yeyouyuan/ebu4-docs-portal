const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('node:assert/strict');
const test = require('node:test');

const {
  listSystemPackageScopes,
  normalizeSystemPackageScopes,
  validateSystemPackageTree,
} = require('../lib/build-upgrade-artifacts');

function ensureFile(root, rel) {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, '// test\n', 'utf-8');
}

test('normalizeSystemPackageScopes: explicit empty keeps only shared core', () => {
  const all = normalizeSystemPackageScopes(undefined);
  const none = normalizeSystemPackageScopes([]);
  assert.ok(all.length > 0);
  assert.deepEqual(none, []);
});

test('listSystemPackageScopes: contains blogfetch scope', () => {
  const ids = listSystemPackageScopes().map((item) => item.id);
  assert.ok(ids.includes('blogfetch'));
});

test('validateSystemPackageTree: strict mode rejects unexpected files', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ebu4-upgrade-test-'));
  try {
    const bootstrap = validateSystemPackageTree(tmpRoot, ['blogfetch']);
    for (const rel of bootstrap.expectedEntries) {
      ensureFile(tmpRoot, rel);
    }
    ensureFile(tmpRoot, path.join('server', 'lib', 'should-not-be-here.js'));

    const checked = validateSystemPackageTree(tmpRoot, ['blogfetch']);
    assert.equal(checked.missingEntries.length, 0);
    assert.ok(checked.unexpectedEntries.includes('server/lib/should-not-be-here.js'));
    assert.equal(checked.ok, false);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});
