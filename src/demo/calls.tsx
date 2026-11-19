import { Camera, CameraView } from 'expo-camera';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useReducer, useState } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';

import { Avatar, Button, Icon, Notice, Sheet } from '../components/ui';
import { transitionCall, type CallEvent, type CallKind } from '../features/calls/model';
import { colors, styles } from '../theme';
import { demoPortrait } from './visuals';

export function DemoCall({ kind, name, username, incoming, onClose }: {
  kind: CallKind; name: string; username: string; incoming: boolean; onClose: () => void;
}) {
  const [state, send] = useReducer(transitionCall, {
    id: 'local-demo', type: kind, phase: incoming ? 'incoming' : 'outgoing',
  });
  const [muted, setMuted] = useState(false);
  const [speaker, setSpeaker] = useState(kind === 'video');
  const [localCamera, setLocalCamera] = useState(false);
  const [facing, setFacing] = useState<'front' | 'back'>('front');
  const [foreground, setForeground] = useState(true);
  const [checking, setChecking] = useState(false);
  const [permissionText, setPermissionText] = useState('');
  const title = kind === 'voice' ? '语音通话' : '视频通话';
  function act(action: CallEvent['action']) { send({ id: state.id, action }); }

  useEffect(() => {
    const app = AppState.addEventListener('change', (status) => setForeground(status === 'active'));
    return () => app.remove();
  }, []);
  useEffect(() => {
    const action = state.phase === 'connecting' ? 'joined'
      : state.phase === 'incoming' || state.phase === 'outgoing' ? 'timeout' : undefined;
    if (!action) return;
    const timer = setTimeout(() => send({ id: state.id, action }), state.phase === 'connecting' ? 500 : 45_000);
    return () => clearTimeout(timer);
  }, [state]);

  async function checkPermissions() {
    setChecking(true); setPermissionText('');
    try {
      const mic = await Camera.requestMicrophonePermissionsAsync();
      if (!mic.granted) {
        setPermissionText('麦克风权限未开启。真实通话需授权后继续。');
        return;
      }
      if (kind === 'video') {
        const camera = await Camera.requestCameraPermissionsAsync();
        if (!camera.granted) {
          setPermissionText('摄像头权限未开启，演示画面保持关闭。');
          return;
        }
        setPermissionText('权限已允许。你可以单独开启本机摄像头预览。');
      } else setPermissionText('麦克风权限已允许。演示不会采集或传输声音。');
    } catch { setPermissionText('当前设备无法检查权限，请在 Android 或 iOS 设备上重试。'); }
    finally { setChecking(false); }
  }

  async function toggleCamera() {
    if (localCamera) { setLocalCamera(false); return; }
    try {
      if (!(await Camera.requestCameraPermissionsAsync()).granted) {
        setPermissionText('摄像头权限未开启，无法预览。');
        return;
      }
      setLocalCamera(true);
    } catch { setPermissionText('摄像头暂时不可用。'); }
  }

  const video = kind === 'video' && (state.phase === 'active' || state.phase === 'reconnecting');
  const phaseText = state.phase === 'outgoing' ? '等待对方接听'
    : state.phase === 'incoming' ? '对方邀请你通话'
      : state.phase === 'connecting' ? '正在连接…'
        : state.phase === 'active' ? '演示通话中'
          : state.phase === 'reconnecting' ? '网络变化，正在重新连接'
            : state.phase === 'failed' ? '连接中断'
              : state.reason === 'declined' ? '对方已拒绝' : state.reason === 'timeout' ? '无人接听' : '通话已结束';

  return <Sheet title={title + ' · 演示'} onClose={onClose}>
    <Notice>本机模拟通话信令。声音和画面只在获得批准接入 RTC 后才能传给好友。</Notice>
    <LinearGradient colors={['#F9DEE8', '#EFE9F5', '#E1F7F4']} style={[local.stage, video && local.video]}>
      <Avatar name={name} source={demoPortrait(username)} size={60} />
      <Text style={local.name}>{name}</Text>
      <Text accessibilityLiveRegion="polite" style={styles.muted}>{phaseText}</Text>
      {video && <Text style={styles.small}>远端画面示意</Text>}
      {video && localCamera && foreground && <View style={local.camera}>
        <CameraView active={foreground} style={local.fill} facing={facing} mute
          onMountError={() => { setLocalCamera(false); setPermissionText('本机摄像头暂时不可用。'); }} />
        <Text style={local.cameraLabel}>本机预览</Text>
      </View>}
    </LinearGradient>
    {(state.phase === 'outgoing' || state.phase === 'incoming') && <View style={local.controls}>
      <Button label={incoming ? '接听（演示）' : '模拟对方接听'} icon="call-outline" variant="gradient" onPress={() => act('accept')} />
      <Button label={incoming ? '拒绝' : '模拟对方拒绝'} variant="danger" onPress={() => act('decline')} />
    </View>}
    {state.phase === 'active' && <View style={local.controls}>
      <Button label={muted ? '取消静音' : '静音'} variant="soft" icon={muted ? 'mic-off-outline' : 'mic-outline'} onPress={() => setMuted(!muted)} />
      <Button label={speaker ? '切回听筒' : '切到扬声器'} variant="soft" icon="volume-medium-outline" onPress={() => setSpeaker(!speaker)} />
      {kind === 'video' && <>
        <Button label={localCamera ? '关闭摄像头' : '开启本机预览'} variant="soft" icon="videocam-outline" onPress={() => void toggleCamera()} />
        <Button label="切换前后摄像头" disabled={!localCamera} variant="soft" onPress={() => setFacing(facing === 'front' ? 'back' : 'front')} />
      </>}
      <Button label="模拟网络切换" variant="quiet" onPress={() => act('interrupt')} />
    </View>}
    {state.phase === 'reconnecting' && <View style={local.controls}>
      <Icon name="cellular-outline" />
      <Button label="模拟网络恢复" variant="soft" onPress={() => act('recover')} />
      <Button label="模拟连接中断" variant="quiet" onPress={() => act('fail')} />
    </View>}
    {state.phase !== 'ended' && state.phase !== 'failed' ? <>
      <Button label={checking ? '正在检查…' : '检查设备权限'} variant="quiet" disabled={checking} onPress={() => void checkPermissions()} />
      {!!permissionText && <Notice>{permissionText}</Notice>}
      <Button label="挂断" icon="call-outline" variant="danger" onPress={() => { setLocalCamera(false); act('end'); }} />
    </> : <Button label="完成" variant="gradient" onPress={onClose} />}
  </Sheet>;
}

const local = StyleSheet.create({
  stage: { borderRadius: 16, alignItems: 'center', gap: 7, paddingVertical: 23 },
  video: { minHeight: 240, justifyContent: 'center' },
  name: { fontSize: 21, fontWeight: '800', color: colors.ink },
  controls: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  camera: { position: 'absolute', bottom: 8, right: 8, width: 77, height: 104, borderRadius: 10, overflow: 'hidden', backgroundColor: colors.ink },
  fill: { width: '100%', height: '100%' },
  cameraLabel: { position: 'absolute', bottom: 3, left: 4, color: '#FFFFFF', fontSize: 10 },
});
