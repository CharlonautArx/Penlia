import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { Tabs } from 'expo-router/js-tabs';
import { Platform, StyleSheet, View } from 'react-native';

import { Glint } from '../../components/Glint';
import type { IconName } from '../../components/ui';
import { brandGradient, colors } from '../../theme';

const tabs: { name: string; title: string; icon?: IconName; activeIcon?: IconName }[] = [
  { name: 'index', title: '聊天', icon: 'chatbubbles-outline', activeIcon: 'chatbubbles' },
  { name: 'friends', title: '好友', icon: 'people-outline', activeIcon: 'people' },
  { name: 'play', title: '玩乐' },
  { name: 'moments', title: '动态', icon: 'planet-outline', activeIcon: 'planet' },
  { name: 'me', title: '我的', icon: 'person-circle-outline', activeIcon: 'person-circle' },
];

export default function TabLayout() {
  return (
    <Tabs
      backBehavior="initialRoute"
      screenOptions={{
        headerShown: false,
        animation: Platform.OS === 'web' ? 'none' : 'fade',
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
            tabBarAccessibilityLabel: title,
            tabBarIcon: ({ focused }) => (
              <View style={local.icon}>
                {focused && <LinearGradient colors={brandGradient} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }}
                  style={local.selected} />}
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
  label: { fontSize: 12, fontWeight: '600' },
  webLabel: { lineHeight: 18, flexShrink: 0 },
  bar: { backgroundColor: colors.panel, borderTopColor: colors.border },
  webBar: { height: 60, paddingBottom: 4 },
  icon: { width: 39, height: 27, alignItems: 'center', justifyContent: 'center', borderRadius: 16 },
  selected: { ...StyleSheet.absoluteFill, borderRadius: 10, opacity: 0.37 },
});
