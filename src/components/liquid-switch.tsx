import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Switch, View, type SwitchProps } from 'react-native';
import { useAppearance } from './appearance';
import { LiquidSurface } from './liquid-surface';
import { isLiquidGlass } from '../demo/mode';
import { colors } from '../theme';

export function LiquidSwitch({ style, ...props }: SwitchProps) {
  if (!isLiquidGlass) return <Switch {...props} style={style} />;
  return <MaterialSwitch {...props} style={style} />;
}

function MaterialSwitch({ value, disabled, style, ...props }: SwitchProps) {
  const { reduced, scheme } = useAppearance();
  const thumb = useRef(new Animated.Value(value ? 20 : 0)).current;
  useEffect(() => {
    if (reduced) {
      thumb.setValue(value ? 20 : 0);
      return;
    }
    const task = Animated.spring(thumb, {
      toValue: value ? 20 : 0, stiffness: 260, damping: 24, mass: 0.8, useNativeDriver: true,
    });
    task.start();
    return () => task.stop();
  }, [reduced, thumb, value]);
  return <View style={[local.box, style]}>
    <View pointerEvents="none" accessible={false} aria-hidden style={[local.rail, disabled && local.disabled, {
      backgroundColor: value ? scheme === 'dark' ? '#314945' : '#D9EEEA' : colors.search,
      borderColor: value ? scheme === 'dark' ? '#67958A' : '#829F96' : colors.border,
    }]}>
      <View style={local.seam} />
      <Animated.View style={[local.thumb, { transform: [{ translateX: thumb }] }]}>
        <LiquidSurface finish="bubble" roundness={13} />
      </Animated.View>
    </View>
    <Switch {...props} value={value} disabled={disabled} style={local.interaction}
      trackColor={{ false: 'transparent', true: 'transparent' }} thumbColor="transparent" />
  </View>;
}

const local = StyleSheet.create({
  box: { width: 52, minHeight: 48, justifyContent: 'center', flexShrink: 0 },
  rail: { height: 29, borderRadius: 15, borderWidth: StyleSheet.hairlineWidth, justifyContent: 'center' },
  seam: { ...StyleSheet.absoluteFill, borderRadius: 15, borderTopColor: '#68576F27', borderTopWidth: 1 },
  thumb: { position: 'absolute', left: 4, width: 24, height: 24, borderRadius: 12, boxShadow: '0px 1px 3px #26212D39' },
  interaction: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, opacity: 0.012 },
  disabled: { opacity: 0.44 },
});
