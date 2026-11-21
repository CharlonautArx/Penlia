import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { type, weight } from '../src/typography.ts';

const palettes = JSON.parse(readFileSync(new URL('../src/palette.json', import.meta.url)));
function luminance(hex) {
  const channels = hex.slice(1).match(/../g).map((value) => Number.parseInt(value, 16) / 255);
  const weights = [0.2126, 0.7152, 0.0722];
  return channels.reduce((total, value, index) => total
    + weights[index] * (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4), 0);
}
function contrast(a, b) {
  const left = luminance(a);
  const right = luminance(b);
  return (Math.max(left, right) + 0.05) / (Math.min(left, right) + 0.05);
}
test('light and dark semantic tokens support the same native and web keys', () => {
  assert.deepEqual(Object.keys(palettes.light).sort(), Object.keys(palettes.dark).sort());
  for (const palette of Object.values(palettes)) {
    assert.ok(Object.values(palette).every((value) => /^#[0-9A-F]{6}$/.test(value)));
  }
});
test('body, secondary labels, buttons and message colors meet normal-text AA contrast in both modes', () => {
  const pairs = [
    ['text','backdrop'], ['text','panel'], ['text','lavender'], ['text','search'],
    ['muted','panel'], ['muted','backdrop'], ['muted','ice'], ['quiet','panel'], ['quiet','search'],
    ['accent','panel'], ['accent','pink'], ['danger','pink'], ['moon','lavender'], ['#FFFFFF','action'],
  ];
  for (const [mode, palette] of Object.entries(palettes)) {
    for (const [foreground, surface] of pairs) {
      const ratio = contrast(palette[foreground] ?? foreground, palette[surface]);
      assert.ok(ratio >= 4.5, mode + ' ' + foreground + '/' + surface + ' = ' + ratio.toFixed(2));
    }
  }
});

test('system typography separates regular body text, medium labels, and the game score', () => {
  for (const role of ['body', 'support', 'caption', 'time']) {
    assert.equal(type[role].fontWeight, weight.regular, role);
  }
  for (const role of ['title', 'heading', 'emphasis', 'control', 'tag']) {
    assert.equal(type[role].fontWeight, weight.medium, role);
  }
  assert.ok(type.title.fontSize > type.heading.fontSize);
  assert.ok(type.heading.fontSize > type.body.fontSize);
  assert.deepEqual(Object.keys(type).filter((role) => Number(type[role].fontWeight) >= 700), ['score']);
  for (const [role, style] of Object.entries(type)) {
    assert.ok(style.lineHeight > style.fontSize, role);
    assert.equal(style.fontFamily, undefined, role);
  }
});
