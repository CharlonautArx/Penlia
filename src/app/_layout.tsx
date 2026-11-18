import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { DemoProvider } from '../demo-store';
import { colors } from '../theme';

export default function RootLayout() {
  return (
    <DemoProvider>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.backdrop } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="chat/[id]" />
      </Stack>
    </DemoProvider>
  );
}
