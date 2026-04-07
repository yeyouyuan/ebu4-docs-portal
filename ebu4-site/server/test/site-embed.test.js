'use strict';
const assert = require('assert');
const test = require('node:test');
const { injectBeforeBodyClose } = require('../lib/site-embed');

test('injectBeforeBodyClose: before </body>', () => {
  const html = '<html><body><p>x</p></body></html>';
  const out = injectBeforeBodyClose(html, '<script src="a"></script>');
  assert.ok(out.includes('<script src="a"></script>'));
  assert.ok(out.indexOf('<script') < out.toLowerCase().lastIndexOf('</body>'));
});

test('injectBeforeBodyClose: marker slot', () => {
  const html = '<body><!-- EBU4_EMBED_AI_SLOT --></body>';
  const out = injectBeforeBodyClose(html, '<x/>');
  assert.ok(out.includes('<x/>'));
});
