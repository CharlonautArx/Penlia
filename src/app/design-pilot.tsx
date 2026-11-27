import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '../components/ui';
import { useDesignPilot } from '../features/design-pilot/context';
import { isDesignPilot, isVariant, pilotColors, scenes, variantNames, variants, type PilotVariant } from '../features/design-pilot/model';

const description: Record<PilotVariant, string> = {
  original: '使用这次试点之前的界面。',
  A: '用朋友的面孔与生活照片组织页面。',
  B: '紧凑的行距与清晰的时间轴，适合快速扫读。',
  C: '大标题、分组列表与半透明控件。',
  D: '用中文衬线标题、暖纸色与留白安排阅读节奏。',
};

export default function DesignPilotScreen() {
  const { variant, dark, select, ready } = useDesignPilot();
  const { variant: requested, screen } = useLocalSearchParams<{ variant?: string; screen?: string }>();
  const handled = useRef('');
  const choice = pilotColors('original', dark);
  useEffect(() => {
    if (!isDesignPilot || !ready || !isVariant(requested)) return;
    const scene = scenes.find((item) => item.key === screen);
    const key = requested + '/' + screen;
    if (!scene || handled.current === key) return;
    if (variant !== requested) { select(requested); return; }
    handled.current = key;
    router.replace(scene.route);
  }, [requested, screen, variant, select, ready]);
  if (!isDesignPilot) return null;
  const back = () => router.canGoBack() ? router.back() : router.replace('/');
  const tone = pilotColors(variant, dark);
  return <SafeAreaView style={[s.root, { backgroundColor: choice.surface }]}>
    <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
      <Pressable accessibilityRole="button" accessibilityLabel="返回" onPress={back}
        style={({ pressed }) => [s.back, pressed && s.pressed]}><Icon name="chevron-back" size={24} color={choice.text} /></Pressable>
      <Text accessibilityRole="header" style={[s.title, { color: choice.text }]}>切换设计方案</Text>
      <View accessibilityRole="radiogroup" style={s.choices}>
        {variants.map((item) => {
          const selected = variant === item;
          const colors = pilotColors(item, dark);
          return <Pressable key={item} accessibilityRole="radio" accessibilityState={{ checked: selected }}
            accessibilityLabel={variantNames[item]} onPress={() => select(item)}
            style={({ pressed }) => [s.item, { borderBottomColor: choice.line }, pressed && s.pressed]}>
            <View style={[s.sample, { backgroundColor: colors.tint, borderRadius: item === 'B' ? 6 : item === 'C' ? 17 : 11 }]}>
              <Text allowFontScaling={false} style={[s.letter, { color: colors.accent }, item === 'D' && { fontFamily: 'PenliaReading' }]}>{item === 'original' ? '朋' : item}</Text>
            </View>
            <Text style={[s.name, { color: choice.text, fontWeight: selected ? '600' : '400' }]}>{variantNames[item]}</Text>
            <Icon name={selected ? 'radio-button-on' : 'radio-button-off'} color={selected ? choice.accent : choice.muted} size={20} />
          </Pressable>;
        })}
      </View>
      <Text accessibilityLiveRegion="polite" style={[s.note, { color: choice.muted }]}>{description[variant]}</Text>
      <Text accessibilityRole="header" style={[s.subtitle, { color: choice.text }]}>体验页面</Text>
      <View style={[s.routes, { backgroundColor: tone.background, borderColor: tone.line }]}>
        {scenes.map((scene) => <Pressable key={scene.key} accessibilityRole="button" accessibilityLabel={scene.name} onPress={() => router.push(scene.route)}
          style={({ pressed }) => [s.route, pressed && s.pressed]}>
          <Icon name={scene.icon} color={tone.accent} size={20} />
          <Text style={[s.name, { color: tone.text }]}>{scene.name}</Text>
          <Icon name="chevron-forward" color={tone.muted} size={17} />
        </Pressable>)}
      </View>
    </ScrollView>
  </SafeAreaView>;
}

const s = StyleSheet.create({
  root: { flex: 1 }, body: { paddingHorizontal: 22, paddingBottom: 30, alignSelf: 'center', width: '100%', maxWidth: 620 },
  back: { minWidth: 48, minHeight: 48, alignSelf: 'flex-start', justifyContent: 'center', marginLeft: -6 },
  title: { fontSize: 32, lineHeight: 44, fontWeight: '600', marginVertical: 8 },
  choices: { marginTop: 4 }, item: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 58, paddingVertical: 7, borderBottomWidth: StyleSheet.hairlineWidth },
  sample: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  letter: { fontSize: 22, fontWeight: '400', includeFontPadding: Platform.OS !== 'android' },
  name: { flex: 1, minWidth: 0, fontSize: 16, lineHeight: 24 },
  note: { fontSize: 14, lineHeight: 22, marginTop: 12 },
  subtitle: { fontSize: 21, lineHeight: 29, marginTop: 22, marginBottom: 10, fontWeight: '600' },
  routes: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14 },
  route: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 50, paddingVertical: 6 }, pressed: { opacity: 0.65 },
});
