export const isUiDemo = process.env.EXPO_PUBLIC_PENLIA_UI_DEMO === '1';
export const isLiquidGlass = isUiDemo && process.env.EXPO_PUBLIC_PENLIA_LIQUID_GLASS === '1';
