'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { normalizeSeoConfig } = require('../lib/seo-config-normalize');

test('normalizeSeoConfig: trims canonical base and verification values', () => {
  const seo = normalizeSeoConfig({
    canonicalBase: ' https://docs.example.com/ ',
    verification: {
      googleFileToken: 'googleabc123.html',
      baiduFileName: '/baidu_verify_code.txt',
    },
  });
  assert.equal(seo.canonicalBase, 'https://docs.example.com');
  assert.equal(seo.verification.googleFileToken, 'googleabc123.html');
  assert.equal(seo.verification.baiduFileName, 'baidu_verify_code.txt');
});

test('normalizeSeoConfig: keeps sitemap paths and page defaults', () => {
  const seo = normalizeSeoConfig({
    sitemapPaths: [' /docs ', '/index'],
    docs: { title: 'Docs' },
  });
  assert.deepEqual(seo.sitemapPaths, ['/docs', '/index']);
  assert.equal(seo.docs.title, 'Docs');
  assert.equal(seo.docs.twitterCard, 'summary_large_image');
});
