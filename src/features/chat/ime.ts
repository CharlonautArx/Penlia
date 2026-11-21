export function remainingImeInset(
  keyboardHeight: number, safeBottom: number, restingHeight: number, viewportHeight: number,
) {
  if (keyboardHeight <= 0) return safeBottom;
  const nativeResize = Math.max(0, restingHeight - viewportHeight);
  // React Native reports IME height without the Android system navigation inset.
  return Math.max(0, keyboardHeight + safeBottom - nativeResize);
}
