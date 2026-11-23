import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAppearance } from '../../components/appearance';
import { WallpaperImage, WallpaperVisible } from './background/WallpaperImage';
import { useChatBackgrounds } from './background/store';
import { colors } from '../../theme';
import { chatLayout } from './ui';

export function KeyboardInsets({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function ChatViewport({ children, floatingChrome, peer }: { children: ReactNode; floatingChrome?: boolean; peer?: string }) {
  const { scheme } = useAppearance();
  const picture = useChatBackgrounds().resolve(peer);
  return <SafeAreaView style={[local.safe, floatingChrome && local.floating, scheme === 'light' && local.white]}>
    <View style={[chatLayout.page, scheme === 'dark' && local.floating]}>
      {picture && <WallpaperImage picture={picture} style={StyleSheet.absoluteFill} />}
      <WallpaperVisible.Provider value={!!picture}>
        <KeyboardAvoidingView style={local.frame} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {children}
        </KeyboardAvoidingView>
      </WallpaperVisible.Provider>
    </View>
  </SafeAreaView>;
}

const local = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.panel },
  white: { backgroundColor: '#FFFFFF' },
  frame: { flex: 1 },
  floating: { backgroundColor: colors.backdrop },
});
