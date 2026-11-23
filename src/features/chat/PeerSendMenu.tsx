import Feather from '@expo/vector-icons/Feather';
import { useEffect, useRef, useState } from 'react';
import { Animated, BackHandler, Easing, Keyboard, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAppearance } from '../../components/appearance';
import { Icon } from '../../components/ui';
import { colors, radius, space, styles, touch, type } from '../../theme';

export type PeerSendOptions = { silent: boolean; noReply: boolean };

export function PeerSendMenu({ open, bottom, options, disabled, sending, onToggle, onSend, onClose }: {
  open: boolean; bottom: number; options: PeerSendOptions; disabled: boolean; sending: boolean;
  onToggle: (option: keyof PeerSendOptions) => void; onSend: () => void; onClose: () => void;
}) {
  const { reduced, scheme } = useAppearance();
  const dark = scheme === 'dark';
  const [present, setPresent] = useState(false);
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (open) setPresent(true);
    const animation = Animated.timing(progress, {
      toValue: open ? 1 : 0, duration: reduced ? 0 : 200,
      easing: Easing.out(Easing.cubic), useNativeDriver: Platform.OS !== 'web',
    });
    animation.start(({ finished }) => { if (finished && !open) setPresent(false); });
    return () => animation.stop();
  }, [open, progress, reduced]);

  useEffect(() => {
    if (!open) return;
    if (Platform.OS === 'web') {
      const handleEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
      window.addEventListener('keydown', handleEscape);
      return () => window.removeEventListener('keydown', handleEscape);
    }
    const back = BackHandler.addEventListener('hardwareBackPress', () => { onClose(); return true; });
    // Android may give the first back action to the active IME.
    const keyboard = Keyboard.addListener('keyboardDidHide', onClose);
    return () => { back.remove(); keyboard.remove(); };
  }, [onClose, open]);

  if (!open && !present) return null;

  return <View pointerEvents={open ? 'box-none' : 'none'} aria-hidden={!open} style={local.overlay}>
    <Pressable accessible={false} importantForAccessibility="no" onPress={onClose} style={StyleSheet.absoluteFill} />
    <View pointerEvents="box-none" style={[local.anchor, { bottom: bottom + space.xs }]}>
      <Animated.View style={[local.menu, dark && local.menuDark, { opacity: progress,
        transform: [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) }] }]}
        accessibilityViewIsModal onAccessibilityEscape={onClose}>
        <ScrollView bounces={false} keyboardShouldPersistTaps="always" style={local.rows}>
          <Pressable accessibilityRole="checkbox" accessibilityLabel="安静发送" aria-checked={options.silent}
            disabled={sending} onPress={() => onToggle('silent')} style={({ pressed }) => [local.row, pressed && local.pressed]}>
            <View style={local.iconFrame}>
              <Icon name={options.silent ? 'moon' : 'moon-outline'} size={18} color={options.silent ? '#315A9D' : colors.quiet} />
            </View>
            <Text style={local.option}>安静发送</Text>
            <Check checked={options.silent} />
          </Pressable>
          <Pressable accessibilityRole="checkbox" accessibilityLabel="只是分享" aria-checked={options.noReply}
            disabled={sending} onPress={() => onToggle('noReply')} style={({ pressed }) => [local.row, local.divider, pressed && local.pressed]}>
            <View style={[local.iconFrame, options.noReply && local.featherSelected]}>
              <Feather name="feather" size={16} color={options.noReply ? '#FFFFFF' : colors.quiet} />
            </View>
            <Text style={local.option}>只是分享</Text>
            <Check checked={options.noReply} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="确认发送" aria-busy={sending}
            disabled={disabled} onPress={onSend} style={({ pressed }) => [local.row, local.divider, pressed && local.pressed, disabled && local.disabled]}>
            <Text style={local.confirm}>{sending ? '发送中…' : '发送'}</Text>
          </Pressable>
        </ScrollView>
      </Animated.View>
    </View>
  </View>;
}

function Check({ checked }: { checked: boolean }) {
  return <View style={local.check}>
    {checked && <Icon name="checkmark" size={17} color={colors.ink} />}
  </View>;
}

const local = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFill, zIndex: 10 },
  anchor: { position: 'absolute', top: space.xs, left: space.sm, right: space.sm, alignItems: 'flex-end', justifyContent: 'flex-end' },
  menu: { width: 216, maxWidth: '100%', maxHeight: '100%',
    borderRadius: radius.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: '#FFFFFF',
    backgroundColor: '#FFFFFFF7', boxShadow: '0px 4px 18px #2021241C, 0px 0px 0px 0.5px #20212412', transformOrigin: 'right bottom' },
  menuDark: { backgroundColor: '#28292EF7', borderColor: '#FFFFFF25', boxShadow: '0px 4px 18px #00000050' },
  rows: { flexGrow: 0 },
  row: { ...styles.row, minHeight: touch, paddingVertical: space.xs, paddingHorizontal: space.sm, gap: space.xs, borderRadius: radius.surface },
  divider: { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth, borderRadius: 0 },
  iconFrame: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  featherSelected: { backgroundColor: '#45474E' },
  option: { ...type.control, ...styles.grow, color: colors.ink },
  check: { width: 18, alignItems: 'center' },
  confirm: { ...type.emphasis, ...styles.grow, color: colors.ink, textAlign: 'center' },
  pressed: { opacity: 0.68 },
  disabled: { opacity: 0.55 },
});
