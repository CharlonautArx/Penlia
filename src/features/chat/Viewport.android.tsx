import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { KeyboardInsets } from '../../components/keyboard-insets';
import { useAppearance } from '../../components/appearance';
import { WallpaperImage, WallpaperVisible } from './background/WallpaperImage';
import { useChatBackgrounds } from './background/store';
import { colors } from '../../theme';
import { chatLayout } from './ui';

export { KeyboardInsets };

export function ChatViewport({ children, floatingChrome, peer }: { children: ReactNode; floatingChrome?: boolean; peer?: string }) {
  const { bottom } = useSafeAreaInsets();
  const { scheme } = useAppearance();
  const picture = useChatBackgrounds().resolve(peer);
  return <SafeAreaView style={[local.safe, floatingChrome && local.floating, scheme === 'light' && local.white]} edges={['top', 'left', 'right']}>
    <View style={[chatLayout.page, scheme === 'dark' && local.floating]}>
      {picture && <WallpaperImage picture={picture} style={StyleSheet.absoluteFill} />}
      <WallpaperVisible.Provider value={!!picture}>
        <KeyboardInsets bottom={bottom}>{children}</KeyboardInsets>
      </WallpaperVisible.Provider>
    </View>
  </SafeAreaView>;
}

const local = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.panel },
  floating: { backgroundColor: colors.backdrop },
  white: { backgroundColor: '#FFFFFF' },
});
