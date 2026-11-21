import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { isUiDemo } from '../demo/mode';
import { PetProvider } from '../features/pet/store';
import { SpaceProvider } from '../features/space/store';
import { FriendsProvider } from '../services/friends';
import { ImProvider } from '../services/im';
import { SessionProvider, useSession } from '../services/session';
import { colors } from '../theme';

function AppNavigation() {
  const { session } = useSession();

  return (
    <FriendsProvider key={session?.user.id ?? 'signed-out'}>
      <SpaceProvider>
        <PetProvider>
          <ImProvider>
            <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.backdrop } }}>
              <Stack.Protected guard={!session}>
                <Stack.Screen name="auth" />
              </Stack.Protected>
              <Stack.Protected guard={!!session}>
                <Stack.Screen name="(tabs)" />
                <Stack.Screen name="chat/[id]" />
                <Stack.Screen name="privacy" />
                <Stack.Screen name="groups" />
                <Stack.Screen name="group/[id]" />
                <Stack.Screen name="private-moment" />
                <Stack.Screen name="person/[id]" />
                <Stack.Screen name="playground" />
                <Stack.Screen name="space" />
              </Stack.Protected>
              <Stack.Protected guard={!!session && !isUiDemo}>
                <Stack.Screen name="social" />
                <Stack.Screen name="life" />
                <Stack.Screen name="world" />
                <Stack.Screen name="gathering/[id]" />
                <Stack.Screen name="collection/[id]" />
                <Stack.Screen name="journal-entry/[id]" />
                <Stack.Screen name="contributions" />
                <Stack.Screen name="boundary" />
                <Stack.Screen name="review/[id]" />
              </Stack.Protected>
              <Stack.Protected guard={!!session && isUiDemo}>
                <Stack.Screen name="pet/[id]" />
              </Stack.Protected>
            </Stack>
          </ImProvider>
        </PetProvider>
      </SpaceProvider>
    </FriendsProvider>
  );
}

export default function RootLayout() {
  return (
    <SessionProvider>
      <StatusBar style="auto" />
      <AppNavigation />
    </SessionProvider>
  );
}
