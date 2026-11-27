import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const expo = require('../app.config.js');
const base = require('../app.json').expo;
const pilot = 'EXPO_PUBLIC_PENLIA_DESIGN_PILOT';
const demo = 'EXPO_PUBLIC_PENLIA_UI_DEMO';
const profile = 'EAS_BUILD_PROFILE';
const api = 'EXPO_PUBLIC_API_URL';
const im = 'EXPO_PUBLIC_EASEMOB_APP_KEY';
const { validatePublicConfig } = require('../tooling/public-config.cjs');

test('the design preview is usable only as an offline demo and has its own package and URL scheme', () => {
  const fields = [pilot, demo, profile, api, im];
  const saved = fields.map((field) => process.env[field]);
  try {
    for (const field of fields) delete process.env[field];
    assert.equal(expo({ config: base }).android.package, 'app.penlia.mobile');
    process.env[demo] = '1';
    assert.equal(expo({ config: base }).android.package, 'app.penlia.mobile.preview');
    process.env[pilot] = '1';
    process.env[profile] = 'ui-demo';
    const result = expo({ config: base });
    assert.equal(result.android.package, 'app.penlia.mobile.designpilot');
    assert.equal(result.scheme, 'penliapilot');
    assert.equal(result.android.allowBackup, false);
  } finally {
    fields.forEach((field, i) => {
      if (saved[i] === undefined) delete process.env[field];
      else process.env[field] = saved[i];
    });
  }
  for (const invalid of [
    {}, { [demo]: '0' }, { [demo]: '1', [profile]: 'production' },
    { [demo]: '1', [api]: 'https://example.invalid' }, { [demo]: '1', [im]: 'org#app' },
  ]) assert.throws(() => validatePublicConfig({ [pilot]: '1', ...invalid }), /isolated, offline/);
});
