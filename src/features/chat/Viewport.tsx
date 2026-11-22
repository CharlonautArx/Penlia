import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors } from '../../theme';
import { chatLayout } from './ui';

export function KeyboardInsets({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function ChatViewport({ children, floatingChrome }: { children: ReactNode; floatingChrome?: boolean }) {
  return <SafeAreaView style={[local.safe, floatingChrome && local.floating]}>
    <KeyboardAvoidingView style={chatLayout.page} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {children}
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

const local = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.panel },
  floating: { backgroundColor: colors.backdrop },
});
