import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { isUiDemo } from '../../demo/mode';
import { colors, touch } from '../../theme';
import { OrbFace } from './Orb';
import { usePets } from './store';

export function PetSignal({ peer }: { peer: string }) {
  const state = usePets();
  return isUiDemo && !!state.value?.[peer]?.name ? <PetMark size={17} /> : null;
}

export function PetShortcut({ peer }: { peer: string }) {
  if (!isUiDemo) return null;
  return <Pressable accessibilityRole="button" accessibilityLabel="共同小宠物"
    onPress={() => router.push({ pathname: '/pet/[id]', params: { id: peer } })}
    style={({ pressed }) => [local.button, pressed && local.pressed]}>
    <OrbFace size={25} />
  </Pressable>;
}

function PetMark({ size }: { size: number }) {
  return <View style={[local.frame, { width: size, height: size, borderRadius: size * 0.33 }]}>
    <OrbFace size={size * 0.86} />
  </View>;
}

const local = StyleSheet.create({
  button: { width: touch, minHeight: touch, justifyContent: 'center', alignItems: 'center' },
  pressed: { opacity: 0.72 },
  frame: { overflow: 'hidden', backgroundColor: colors.tint, justifyContent: 'center', alignItems: 'center' },
});
