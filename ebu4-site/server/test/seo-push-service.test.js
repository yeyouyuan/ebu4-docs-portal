'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { buildPushContext } = require('../lib/seo-push-service');

test('buildPushContext: rejects localhost canonical base', async () => {
  await assert.rejects(
    () =>
      buildPushContext({
        req: { protocol: 'http', get: () => 'localhost:3000' },
        seo: { canonicalBase: 'http://localhost:3000', sitemapAuto: true, sitemapPaths: [] },
        siteDatabase: { listMainDocuments: () => [], getDefaultMainDocSlug: () => 'default' },
        extraPagesRepo: null,
        extraPagesStore: null,
      }),
    /localhost/
  );
});

test('buildPushContext: builds public sitemap URL list', async () => {
  const context = await buildPushContext({
    req: { protocol: 'https', get: () => 'docs.example.com' },
    seo: { canonicalBase: 'https://docs.example.com', sitemapAuto: true, sitemapPaths: [], includeExtraPagesInSitemap: false },
    siteDatabase: { listMainDocuments: () => [], getDefaultMainDocSlug: () => 'default' },
    extraPagesRepo: null,
    extraPagesStore: null,
  });
  assert.equal(context.origin, 'https://docs.example.com');
  assert.equal(context.sitemapUrl, 'https://docs.example.com/sitemap.xml');
  assert.ok(context.urls.includes('https://docs.example.com/docs'));
});
