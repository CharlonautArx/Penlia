import { router } from 'expo-router';
import { Image, Pressable, StyleSheet, View } from 'react-native';

import { isUiDemo } from '../../demo/mode';
import { demoPetArt } from '../../demo/visuals';
import { colors } from '../../theme';
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
    <PetMark size={29} />
  </Pressable>;
}

function PetMark({ size }: { size: number }) {
  const art = demoPetArt();
  return <View style={[local.frame, { width: size, height: size, borderRadius: size * 0.33 }]}>
    {art && <Image source={art} accessible={false} style={local.art} />}
  </View>;
}

const local = StyleSheet.create({
  button: { width: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center', borderRadius: 12, backgroundColor: colors.pink },
  pressed: { opacity: 0.72 },
  frame: { overflow: 'hidden', backgroundColor: colors.pink, justifyContent: 'center', alignItems: 'center' },
  art: { width: '145%', height: '145%', resizeMode: 'cover' },
});
