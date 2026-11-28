import { CallRecordsProvider } from '../features/calls/records';
import { ChatRecallsProvider } from '../features/chat/recalls';
import { TypographyProvider } from '../components/Typography';
import { MomentDraftProvider } from '../features/moments/draft';
import { ChatHistoryProvider } from '../features/chat/history';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { PenliaAppearance, useAppearance } from '../components/appearance';
import { LoadingSkeleton, Screen } from '../components/ui';

import { isLiquidGlass, isUiDemo } from '../demo/mode';
import { PetProvider } from '../features/pet/store';
import { ConversationPreferencesProvider } from '../features/chat/useConversationPreferences';
import { ChatBackgroundProvider } from '../features/chat/background/store';
import { SpaceProvider } from '../features/space/store';
import { FriendsProvider } from '../services/friends';
import { ImProvider } from '../services/im';
import { SessionProvider, useSession } from '../services/session';
import { colors, motion } from '../theme';

function AppNavigation() {
  const { session, loading } = useSession();
  const { reduced } = useAppearance();

  if (loading && !session) {
    return <Screen title="朋聊"><LoadingSkeleton label="正在恢复登录" /></Screen>;
  }

  return (
    <FriendsProvider key={session?.user.id ?? 'signed-out'}>
      <ConversationPreferencesProvider account={session?.user.id}>
      <ChatBackgroundProvider account={session?.user.id}>
        <ChatHistoryProvider account={session?.user.id}>
        <CallRecordsProvider account={session?.user.id}>
        <SpaceProvider>
          <MomentDraftProvider account={session?.user.id}>
          <PetProvider>
            <ChatRecallsProvider><ImProvider>
              <Stack screenOptions={{ headerShown: false, animation: reduced ? 'none' : 'default', animationDuration: motion.transition, contentStyle: { backgroundColor: colors.backdrop } }}>
                <Stack.Protected guard={!session}>
                  <Stack.Screen name="auth" />
                </Stack.Protected>
                <Stack.Protected guard={!!session}>
                  <Stack.Screen name="(tabs)" />
                  <Stack.Screen name="chat/[id]" />
                  <Stack.Screen name="chat-settings/[id]" />
                  <Stack.Screen name="chat-search/[id]" />
                  <Stack.Screen name="font-size" />
                  <Stack.Screen name="peer-call" options={{ gestureEnabled: false }} />
                  <Stack.Screen name="chat-background" />
                  <Stack.Screen name="privacy" />
                  <Stack.Screen name="profile" />
                  <Stack.Screen name="profile-field/[field]" />
                  <Stack.Screen name="groups" />
                  <Stack.Screen name="group/[id]" />
                  <Stack.Screen name="group-settings/[id]" />
                  <Stack.Screen name="friend-requests/index" />
                  <Stack.Screen name="friend-requests/[id]" />
                  <Stack.Screen name="friend-invite" />
                  <Stack.Screen name="my-qr" />
                  <Stack.Screen name="private-moment" />
                  <Stack.Screen name="person/[id]" />
                  <Stack.Screen name="playground" />
                  <Stack.Screen name="space" />
                </Stack.Protected>
                <Stack.Protected guard={!!session}>
                  <Stack.Screen name="social" />
                  <Stack.Screen name="life" />
                  <Stack.Screen name="world" />
                  <Stack.Screen name="gathering/[id]" />
                  <Stack.Screen name="collection/[id]" />
                  <Stack.Screen name="journal-entry/[id]" />
                  <Stack.Screen name="contributions" />
                  <Stack.Screen name="boundary" />
                  <Stack.Screen name="boundary/[id]" />
                  <Stack.Screen name="review/[id]" />
                </Stack.Protected>
                <Stack.Protected guard={!!session && isLiquidGlass}>
                  <Stack.Screen name="glass-preview" />
                </Stack.Protected>
                <Stack.Protected guard={!!session && isUiDemo}>
                  <Stack.Screen name="pet/[id]" />
                </Stack.Protected>
              </Stack>
            </ImProvider></ChatRecallsProvider>
          </PetProvider>
          </MomentDraftProvider>
        </SpaceProvider>
        </CallRecordsProvider>
        </ChatHistoryProvider>
      </ChatBackgroundProvider>
      </ConversationPreferencesProvider>
    </FriendsProvider>
  );
}

export default function RootLayout() {
  return (
    <SessionProvider>
      <TypographyProvider><PenliaAppearance><ThemedApp /></PenliaAppearance></TypographyProvider>
    </SessionProvider>
  );
}

function ThemedApp() {
  const { scheme } = useAppearance();
  return <><StatusBar style={scheme === 'dark' ? 'light' : 'dark'} /><AppNavigation /></>;
}
