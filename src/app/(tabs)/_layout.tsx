import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router/js-tabs';
import { Platform, StyleSheet, View } from 'react-native';

import { Glint } from '../../components/Glint';
import type { IconName } from '../../components/ui';
import { colors, space, type } from '../../theme';
import { useAppearance } from '../../components/appearance';

const tabs: { name: string; title: string; icon?: IconName; activeIcon?: IconName }[] = [
  { name: 'index', title: '聊天', icon: 'chatbubbles-outline', activeIcon: 'chatbubbles' },
  { name: 'friends', title: '好友', icon: 'people-outline', activeIcon: 'people' },
  { name: 'play', title: '玩乐' },
  { name: 'moments', title: '动态', icon: 'planet-outline', activeIcon: 'planet' },
  { name: 'me', title: '我的', icon: 'person-circle-outline', activeIcon: 'person-circle' },
];

export default function TabLayout() {
  const { reduced } = useAppearance();
  return (
    <Tabs
      backBehavior="initialRoute"
      screenOptions={{
        headerShown: false,
        animation: reduced || Platform.OS === 'web' ? 'none' : 'fade',
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
        tabBarHideOnKeyboard: true,
        tabBarLabelStyle: [local.label, Platform.OS === 'web' && local.webLabel],
        tabBarStyle: [local.bar, Platform.OS === 'web' && local.webBar],
      }}
    >
      {tabs.map(({ name, title, icon, activeIcon }) => (
        <Tabs.Screen
          key={name}
          name={name}
          options={{
            title,
            tabBarAllowFontScaling: true,
            tabBarAccessibilityLabel: title,
            tabBarIcon: ({ focused }) => (
              <View style={local.icon}>
                {focused && <View style={local.selected} />}
                {icon ? <Ionicons accessible={false} name={focused ? activeIcon : icon} color={focused ? colors.accent : colors.muted} size={21} />
                  : <Glint active={focused} />}
              </View>
            ),
          }}
        />
      ))}
    </Tabs>
  );
}

const local = StyleSheet.create({
  label: { ...type.caption, fontWeight: '600' },
  webLabel: { lineHeight: 18, flexShrink: 0 },
  bar: { backgroundColor: colors.panel, borderTopColor: colors.border },
  webBar: { minHeight: 60, paddingBottom: space.xxs },
  icon: { width: 43, height: 29, alignItems: 'center', justifyContent: 'center', borderRadius: 16 },
  selected: { ...StyleSheet.absoluteFill, borderRadius: 14, backgroundColor: colors.pink },
});
