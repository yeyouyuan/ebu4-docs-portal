'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { buildSeoSitemapRelPaths, relPathsToAbsoluteUrls } = require('../lib/seo-sitemap');

test('buildSeoSitemapRelPaths: dedupes auto and manual paths', async () => {
  const paths = await buildSeoSitemapRelPaths({
    seo: {
      sitemapAuto: true,
      sitemapPaths: ['/docs', '/docs', 'index'],
      includeExtraPagesInSitemap: false,
    },
    siteDatabase: {
      listMainDocuments: () => [{ slug: 'default' }, { slug: 'internal' }],
      getDefaultMainDocSlug: () => 'default',
    },
    extraPagesRepo: null,
    extraPagesStore: null,
  });
  assert.deepEqual(paths, ['/', '/index', '/docs', '/docs?doc=internal']);
});

test('relPathsToAbsoluteUrls: joins origin and relative paths', () => {
  const urls = relPathsToAbsoluteUrls('https://docs.example.com/', ['/docs', 'index']);
  assert.deepEqual(urls, ['https://docs.example.com/docs', 'https://docs.example.com/index']);
});
