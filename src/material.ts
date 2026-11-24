import palette from './palette.json' with { type: 'json' };

export const brandGradient = ['#FF768D', '#EAC8D5', '#AEFFF8'] as const;

export const glass = {
  light: {
    base: palette.light.panel,
    edge: '#51465520',
    shine: '#FFFFFF8C',
    opacity: { chrome: '0D', soft: '18', control: '32', feature: '62' },
  },
  dark: {
    base: '#202129',
    edge: '#E3EFEB2B',
    shine: '#FFFFFF20',
    opacity: { chrome: '10', soft: '17', control: '29', feature: '42' },
  },
} as const;

export type GlassTone = keyof typeof glass.light.opacity;

// Use literal RGBA stops so the same surface works with native LinearGradient and on the web.
export function glassStops(scheme: keyof typeof glass, tone: GlassTone): readonly [string, string, string] {
  const alpha = glass[scheme].opacity[tone];
  return [brandGradient[0] + alpha, brandGradient[1] + alpha, brandGradient[2] + alpha];
}

export const unread = {
  stops: ['#FF86BA', '#FF52A2', '#FF3D94'],
  edge: '#E82E82',
  gleam: '#FFFFFF9C',
  ink: '#241124',
} as const;
