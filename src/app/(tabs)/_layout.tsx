import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router/js-tabs';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Glint } from '../../components/Glint';
import { GlassLayer, UnreadMark } from '../../components/material';
import type { IconName } from '../../components/ui';
import { ConversationUnread } from '../../features/chat/unread';
import { colors, radius, space, type } from '../../theme';
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
  const [unread, setUnread] = useState(0);
  const { fontScale } = useWindowDimensions();
  const { bottom } = useSafeAreaInsets();
  // Give the scaled label its own space above the system navigation inset.
  const scaledAndroidBar = Platform.OS === 'android' && fontScale > 1
    ? { height: 49 + bottom + Math.ceil(type.tag.lineHeight * (fontScale - 1)) + space.xxs }
    : undefined;
  return <ConversationUnread.Provider value={setUnread}>
    <Tabs
      backBehavior="initialRoute"
      screenOptions={{
        headerShown: false,
        animation: reduced || Platform.OS === 'web' ? 'none' : 'fade',
        tabBarActiveTintColor: colors.ink,
        tabBarInactiveTintColor: colors.muted,
        tabBarHideOnKeyboard: true,
        tabBarLabelStyle: [local.label, Platform.OS === 'web' && local.webLabel],
        tabBarStyle: [local.bar, Platform.OS === 'web' && local.webBar, scaledAndroidBar],
        tabBarBackground: () => <GlassLayer tone="chrome" roundness={0} />,
        tabBarButton: Platform.OS === 'android' ? ({
          children, onPress, onLongPress, accessibilityLabel, accessibilityState, testID, style,
        }) => <Pressable accessibilityRole="tab" accessibilityLabel={accessibilityLabel}
          accessibilityState={accessibilityState} testID={testID} onPress={onPress} onLongPress={onLongPress}
          style={({ pressed }) => [style, pressed && local.pressed]}>{children}</Pressable> : undefined,
      }}
    >
      {tabs.map(({ name, title, icon, activeIcon }) => (
        <Tabs.Screen
          key={name}
          name={name}
          options={{
            title,
            tabBarAllowFontScaling: true,
            tabBarAccessibilityLabel: name === 'index' && unread > 0 ? title + '，' + unread + ' 条未读消息' : title,
            tabBarIcon: ({ focused }) => <TabIcon focused={focused} icon={icon} activeIcon={activeIcon}
              unread={name === 'index' ? unread : 0} />,
          }}
        />
      ))}
    </Tabs>
  </ConversationUnread.Provider>;
}

function TabIcon({ focused, icon, activeIcon, unread }: {
  focused: boolean; icon?: IconName; activeIcon?: IconName; unread: number;
}) {
  return <View style={local.icon}>
    {focused && <GlassLayer tone="control" roundness={radius.pill} />}
    {icon ? <Ionicons accessible={false} name={focused ? activeIcon : icon} color={focused ? colors.ink : colors.muted} size={21} />
      : <Glint active={focused} />}
    <UnreadMark count={unread} dot style={local.unread} />
  </View>;
}

const local = StyleSheet.create({
  label: { ...type.tag },
  webLabel: { lineHeight: 18, flexShrink: 0 },
  bar: { backgroundColor: colors.panel, borderTopColor: colors.border },
  webBar: { minHeight: 60, paddingBottom: space.xxs },
  icon: { width: 43, height: 29, alignItems: 'center', justifyContent: 'center', borderRadius: 16 },
  unread: { position: 'absolute', top: 2, right: 5 },
  pressed: { opacity: 0.8 },
});
