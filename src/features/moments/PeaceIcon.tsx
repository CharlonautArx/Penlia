import { Text } from 'react-native';

import { colors } from '../../theme';

export function PeaceIcon({ active }: { active?: boolean }) {
  return <Text accessible={false} aria-hidden allowFontScaling={false}
    style={{ color: active ? colors.danger : colors.muted, fontSize: 22, lineHeight: 28 }}>{'\u270C\uFE0E'}</Text>;
}
