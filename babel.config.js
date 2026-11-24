module.exports = function (api) {
  api.cache(true);
  return {
    presets: [require.resolve('expo/internal/babel-preset')],
    plugins: [require.resolve('./tooling/app-typography.cjs')],
  };
};
