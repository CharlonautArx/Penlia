// Leave fontFamily unset so Android can use its system sans-serif and CJK fallback.
export const weight = { regular: '400', medium: '500', semibold: '600' } as const;

export const type = {
  display: { fontSize: 32, lineHeight: 39, fontWeight: weight.medium },
  title: { fontSize: 24, lineHeight: 32, fontWeight: weight.medium },
  hero: { fontSize: 22, lineHeight: 30, fontWeight: weight.medium },
  article: { fontSize: 26, lineHeight: 35, fontWeight: weight.medium },
  heading: { fontSize: 18, lineHeight: 26, fontWeight: weight.medium },
  emphasis: { fontSize: 16, lineHeight: 24, fontWeight: weight.medium },
  body: { fontSize: 16, lineHeight: 24, fontWeight: weight.regular },
  support: { fontSize: 14, lineHeight: 21, fontWeight: weight.regular },
  control: { fontSize: 14, lineHeight: 21, fontWeight: weight.medium },
  caption: { fontSize: 12, lineHeight: 18, fontWeight: weight.regular },
  tag: { fontSize: 12, lineHeight: 18, fontWeight: weight.medium },
  time: { fontSize: 12, lineHeight: 18, fontWeight: weight.regular, fontVariant: ['tabular-nums'] as 'tabular-nums'[] },
  metric: { fontSize: 24, lineHeight: 32, fontWeight: weight.medium, fontVariant: ['tabular-nums'] as 'tabular-nums'[] },
  // Large game score, kept easy to pick out during fast rounds.
  score: { fontSize: 37, lineHeight: 45, fontWeight: '700', fontVariant: ['tabular-nums'] as 'tabular-nums'[] },
} as const;
