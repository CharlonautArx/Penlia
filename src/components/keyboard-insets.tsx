import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

export function KeyboardInsets({ children }: { children: ReactNode; bottom?: number; style?: StyleProp<ViewStyle> }) {
  return <>{children}</>;
}
