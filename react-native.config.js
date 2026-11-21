// The Android SDK loads its JNI bridge when React Native registers the package.
module.exports = {
  dependencies: process.env.EXPO_PUBLIC_PENLIA_UI_DEMO === '1'
    ? { 'react-native-chat-sdk': { platforms: { android: null } } }
    : {},
};
