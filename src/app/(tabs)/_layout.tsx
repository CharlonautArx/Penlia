import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router/js-tabs';
import { Platform, StyleSheet, View } from 'react-native';

import type { IconName } from '../../components/ui';
import { colors } from '../../theme';

const tabs: { name: string; title: string; icon: IconName; activeIcon: IconName }[] = [
  { name: 'index', title: '聊天', icon: 'chatbubbles-outline', activeIcon: 'chatbubbles' },
  { name: 'friends', title: '好友', icon: 'people-outline', activeIcon: 'people' },
  { name: 'moments', title: '动态', icon: 'leaf-outline', activeIcon: 'leaf' },
  { name: 'play', title: '玩乐', icon: 'game-controller-outline', activeIcon: 'game-controller' },
  { name: 'me', title: '我的', icon: 'person-circle-outline', activeIcon: 'person-circle' },
];

export default function TabLayout() {
  return (
    <Tabs
      backBehavior="initialRoute"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.deep,
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
            tabBarIcon: ({ focused }) => (
              <View style={[local.icon, focused && local.selected]}>
                <Ionicons name={focused ? activeIcon : icon} color={focused ? colors.deep : colors.muted} size={21} />
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
  selected: { backgroundColor: colors.sage },
});
