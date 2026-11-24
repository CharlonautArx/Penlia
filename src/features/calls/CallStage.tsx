import { BlurTargetView, BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import type { ComponentRef, ReactNode, RefObject } from 'react';
import { createContext, useContext, useMemo, useRef, useState } from 'react';
import { PanResponder, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { Avatar, Icon, type IconName } from '../../components/ui';
import { WallpaperImage } from '../chat/background/WallpaperImage';
import type { LocalPicture } from '../chat/background/model';
import { space, type } from '../../theme';
import type { ImageSourcePropType } from 'react-native';

const CallBackdrop = createContext<RefObject<ComponentRef<typeof View> | null> | undefined>(undefined);

type Action = { label: string; icon: IconName; onPress: () => void; selected?: boolean; disabled?: boolean };
export function CallAction({ action, small = false }: { action: Action; small?: boolean }) {
  const backdrop = useContext(CallBackdrop);
  return <Pressable accessibilityRole="button" accessibilityLabel={action.label}
    accessibilityState={{ selected: action.selected, disabled: action.disabled }} disabled={action.disabled}
    onPress={action.onPress} style={({ pressed }) => [ui.action, small && ui.small, action.selected && ui.selected,
      action.disabled && ui.disabled, pressed && ui.pressed]}>
    {backdrop && (Platform.OS !== 'android' || Number(Platform.Version) >= 31) &&
      <BlurView pointerEvents="none" intensity={16} tint="default" blurTarget={backdrop}
        blurMethod="dimezisBlurViewSdk31Plus" style={StyleSheet.absoluteFill} />}
    <LinearGradient pointerEvents="none" colors={['#FFFFFF28', '#FFFFFF06', '#FFFFFF14']}
      start={{ x: 0.1, y: 0 }} end={{ x: 0.8, y: 1 }} style={StyleSheet.absoluteFill} />
    <Icon name={action.icon} size={small ? 20 : 27} color="#FFFFFF" />
  </Pressable>;
}

function Preview({ children, compact }: { children: ReactNode; compact: boolean }) {
  const [area, setArea] = useState({ width: 0, height: 0 });
  const [anchor, setAnchor] = useState({ x: 1, y: 0 });
  const width = Math.min(compact ? 45 : 98, area.width * 0.3, area.height * 0.42);
  const height = width * 4 / 3;
  const xRange = Math.max(0, area.width - width);
  const yRange = Math.max(0, area.height - height);
  const values = useRef({ anchor, xRange, yRange });
  values.current = { anchor, xRange, yRange };
  const gesture = useMemo(() => {
    let start = { x: 0, y: 0 };
    return PanResponder.create({
      onStartShouldSetPanResponderCapture: () => true,
      onPanResponderGrant: () => { start = values.current.anchor; },
      onPanResponderMove: (_, { dx, dy }) => {
        const { xRange, yRange } = values.current;
        const clamp = (v: number) => Math.max(0, Math.min(1, v));
        setAnchor({ x: clamp(start.x + dx / (xRange || 1)), y: clamp(start.y + dy / (yRange || 1)) });
      },
    });
  }, []);
  return <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { margin: compact ? 3 : 12 }]}
    onLayout={({ nativeEvent: { layout } }) => setArea({ width: layout.width, height: layout.height })}>
    {width > 0 && <View collapsable={false} style={[ui.preview, { width, height, left: anchor.x * xRange, top: anchor.y * yRange }]}
      accessible accessibilityLabel="本机预览" accessibilityHint="可拖动位置" {...gesture.panHandlers}>
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>{children}</View>
    </View>}
  </View>;
}

export function CallStage({ name, avatar, background, status, remoteVideo, preview, tools, controls, extra, compact, video, simulated = false }: {
  name: string; avatar?: ImageSourcePropType; background?: LocalPicture; status: string; remoteVideo?: ReactNode;
  preview?: ReactNode; tools?: ReactNode; controls: ReactNode; extra?: ReactNode; compact: boolean; video: boolean; simulated?: boolean;
}) {
  const backdrop = useRef<ComponentRef<typeof View>>(null);
  const hasImage = Boolean(background || remoteVideo);
  return <CallBackdrop.Provider value={hasImage && !compact ? backdrop : undefined}><View style={ui.black}>
    <StatusBar style="light" hidden={compact} />
    {hasImage && <BlurTargetView ref={backdrop} style={StyleSheet.absoluteFill}>
      {background && <><WallpaperImage picture={background} style={StyleSheet.absoluteFill} /><View style={ui.shade} /></>}
      {remoteVideo && <View style={StyleSheet.absoluteFill}>{remoteVideo}</View>}
    </BlurTargetView>}
    <SafeAreaView style={ui.safe} edges={compact ? [] : ['top', 'bottom', 'left', 'right']}>
      {!compact && <View style={ui.top}><Text style={ui.muted}>{simulated ? '本机模拟 · ' : ''}{video ? '视频通话' : '语音通话'}</Text>
        <View style={ui.tools}>{tools}</View></View>}
      <View style={ui.stage}>
        {!remoteVideo && <View style={ui.person}>
          <Avatar name={name} source={avatar} size={compact ? 30 : 76} />
          <Text style={[ui.name, compact && ui.miniName]} numberOfLines={2}>{name}</Text>
          <Text accessibilityLiveRegion="polite" style={[ui.status, compact && ui.miniStatus]}>{status}</Text>
        </View>}
        {remoteVideo && <Text style={ui.status}>{status}</Text>}
        {preview && <Preview compact={compact}>{preview}</Preview>}
      </View>
      {!compact && <View style={ui.footer}>{extra}<View style={ui.controls}>{controls}</View></View>}
    </SafeAreaView>
  </View></CallBackdrop.Provider>;
}

const ui = StyleSheet.create({
  black: { flex: 1, backgroundColor: '#000000' },
  safe: { flex: 1 },
  shade: { ...StyleSheet.absoluteFill, backgroundColor: '#00000070' },
  top: { paddingHorizontal: space.md, minHeight: 52, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  tools: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  muted: { ...type.caption, color: '#C4C4C4' },
  stage: { flex: 1, minHeight: 0, alignItems: 'center', justifyContent: 'center' },
  person: { alignItems: 'center', gap: space.xs, paddingHorizontal: space.md },
  name: { ...type.title, color: '#FFFFFF', textAlign: 'center' },
  status: { ...type.support, color: '#DADADA', textAlign: 'center' },
  miniName: { fontSize: 12, lineHeight: 15 }, miniStatus: { fontSize: 10, lineHeight: 12 },
  preview: { position: 'absolute', backgroundColor: '#292929', overflow: 'hidden', borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth, borderColor: '#FFFFFF66' },
  footer: { paddingHorizontal: space.md, paddingBottom: space.xl, gap: space.sm },
  controls: { flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'center', paddingVertical: space.xs },
  action: { alignItems: 'center', justifyContent: 'center', width: 70, height: 70, borderRadius: 35, overflow: 'hidden',
    backgroundColor: '#FFFFFF09', borderWidth: 1, borderColor: '#FFFFFF54', borderTopColor: '#FFFFFF9C' },
  small: { width: 46, height: 46, borderRadius: 23 }, selected: { backgroundColor: '#FFFFFF36', borderColor: '#FFFFFFB8' },
  disabled: { opacity: 0.45 }, pressed: { opacity: 0.7 },
});
