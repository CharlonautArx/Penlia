import { randomUUID } from 'expo-crypto';
import { recordCallEnd, type CallRecord } from '../features/calls/record';
import { useCallRecords } from '../features/calls/records';
import { Camera, CameraView } from 'expo-camera';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Notice, Sheet } from '../components/ui';
import { CallAction, CallStage } from '../features/calls/CallStage';
import { callDevice } from '../features/calls/device';
import { transitionCall, type CallEvent, type CallKind, type CallState } from '../features/calls/model';
import { useChatBackgrounds } from '../features/chat/background/store';
import { space, type } from '../theme';
import { demoPortrait } from './visuals';

export function DemoCall({ kind, name, username, incoming, account, peerId, onClose }: {
  kind: CallKind; name: string; username: string; incoming: boolean; account: string; peerId: string; onClose: () => void;
}) {
  const [state, setCall] = useState<CallState>(() => ({
    id: randomUUID(), type: kind, phase: incoming ? 'incoming' : 'outgoing',
  }));
  const current = useRef(state);
  const connectedAt = useRef<number | undefined>(undefined);
  const pendingRecord = useRef<CallRecord | undefined>(undefined);
  const writing = useRef<Promise<boolean> | undefined>(undefined);
  const records = useCallRecords();
  const store = useRef(records);
  store.current = records;
  const [muted, setMuted] = useState(false);
  const [speaker, setSpeaker] = useState(kind === 'video');
  const [camera, setCamera] = useState(false);
  const [facing, setFacing] = useState<'front' | 'back'>('front');
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const [pip, setPip] = useState(false);
  const [details, setDetails] = useState(false);
  const [notice, setNotice] = useState('');
  const [checking, setChecking] = useState(false);
  const mounted = useRef(true);
  const pendingCamera = useRef(false);
  const pendingRoute = useRef(false);
  const latestSpeaker = useRef(speaker);
  latestSpeaker.current = speaker;
  const background = useChatBackgrounds().resolve(undefined, true);
  const video = kind === 'video';
  const ringing = state.phase === 'incoming' || state.phase === 'outgoing';
  const live = state.phase === 'active' || state.phase === 'reconnecting';
  const terminal = state.phase === 'ended' || state.phase === 'failed';
  const act = useCallback((action: CallEvent['action']) => {
    const before = current.current;
    const after = transitionCall(before, { id: before.id, action });
    const now = Date.now();
    if (after !== before) {
      if (after.phase === 'active' && connectedAt.current === undefined) connectedAt.current = performance.now();
      const record = recordCallEnd(before, after, action, { caller: incoming ? peerId : account,
        recipient: incoming ? account : peerId, endedAt: now,
        elapsedMs: connectedAt.current === undefined ? undefined : performance.now() - connectedAt.current,
        simulated: true });
      if (record) pendingRecord.current = record;
      current.current = after;
      setCall(after);
    }
    const record = pendingRecord.current;
    if (!record) return Promise.resolve(true);
    if (writing.current) return writing.current;
    writing.current = (async () => {
      try {
        if (!store.current.save) throw new Error('No local store');
        await store.current.save(record);
        pendingRecord.current = undefined;
        return true;
      } catch {
        if (mounted.current) setNotice('通话记录保存失败，点击完成重试。');
        return false;
      }
    })().finally(() => { writing.current = undefined; });
    return writing.current;
  }, [account, incoming, peerId]);

  useEffect(() => {
    mounted.current = true;
    const app = AppState.addEventListener('change', (status) => setForeground(status === 'active'));
    const picture = callDevice?.addListener('onPipChanged', ({ active }) => { setPip(active); if (active) setDetails(false); });
    return () => { mounted.current = false; app.remove(); picture?.remove(); };
  }, []);
  useEffect(() => {
    if (!live || !video || details || checking || !callDevice) return;
    void callDevice.configurePip(true).catch(() => {});
    return () => { void callDevice?.configurePip(false).catch(() => {}); };
  }, [live, video, details, checking]);
  const visible = foreground || pip;
  useEffect(() => {
    if (!live || !visible || !callDevice) return;
    let active = true;
    void callDevice.routeSpeaker(latestSpeaker.current).then((ok) => {
      if (active && !ok) setNotice('所选音频输出不可用，沿用设备当前输出。');
    }).catch(() => { if (active) setNotice('无法切换音频输出。'); });
    return () => { active = false; void callDevice?.releaseAudio().catch(() => {}); };
  }, [live, visible]);
  useEffect(() => {
    const action = state.phase === 'connecting' ? 'joined' : ringing ? 'timeout' : undefined;
    if (!action) return;
    const timer = setTimeout(() => void act(action), ringing ? 45_000 : 500);
    return () => clearTimeout(timer);
  }, [act, state.phase, ringing]);

  async function toggleCamera() {
    if (pendingCamera.current) return;
    if (camera) { setCamera(false); return; }
    pendingCamera.current = true;
    setChecking(true);
    try {
      const permission = await Camera.requestCameraPermissionsAsync();
      if (!mounted.current) return;
      setCamera(permission.granted);
      setNotice(permission.granted ? '' : '摄像头权限未开启，可在设备设置中允许。');
    } catch { if (mounted.current) setNotice('本机摄像头暂时不可用。'); }
    finally { pendingCamera.current = false; if (mounted.current) setChecking(false); }
  }

  async function toggleSpeaker() {
    if (pendingRoute.current) return;
    pendingRoute.current = true;
    try {
      const next = !speaker;
      if (live && callDevice && !await callDevice.routeSpeaker(next)) {
        if (mounted.current) setNotice('此设备不支持所选音频输出。');
        return;
      }
      if (mounted.current) setSpeaker(next);
    } catch { if (mounted.current) setNotice('暂时无法切换音频输出。'); }
    finally { pendingRoute.current = false; }
  }

  async function checkPermissions() {
    setChecking(true);
    try {
      const microphone = await Camera.requestMicrophonePermissionsAsync();
      const lens = video && await Camera.requestCameraPermissionsAsync();
      if (mounted.current) setNotice(!microphone.granted ? '麦克风权限未开启。'
        : video && lens && !lens.granted ? '摄像头权限未开启。' : '设备权限已允许。模拟模式不会采集或发送语音。');
    } catch { if (mounted.current) setNotice('当前设备无法检查通话权限。'); }
    finally { if (mounted.current) setChecking(false); }
  }

  const status = state.phase === 'outgoing' ? '等待对方接听' : state.phase === 'incoming' ? '对方邀请你通话'
    : state.phase === 'connecting' ? '正在连接…' : state.phase === 'reconnecting' ? '网络变化，正在重新连接'
    : state.phase === 'failed' ? '连接中断' : state.phase === 'ended' ? state.reason === 'declined' ? '对方已拒绝'
      : state.reason === 'timeout' ? '无人接听' : '通话已结束' : video ? '模拟通话中 · 暂无远端画面' : '模拟通话中';
  const controls = <>
    <CallAction action={{ label: muted ? '取消静音' : '静音', selected: muted, disabled: terminal,
      icon: muted ? 'mic-off-outline' : 'mic-outline', onPress: () => setMuted(!muted) }} />
    <CallAction action={{ label: terminal ? '完成' : '挂断', icon: terminal ? 'close-outline' : 'call',
      onPress: () => { void act(incoming && ringing ? 'decline' : 'end').then((saved) => { if (saved && mounted.current) onClose(); }); } }} />
    <CallAction action={{ label: speaker ? '切回听筒' : '切到扬声器', selected: speaker, disabled: terminal,
      icon: speaker ? 'volume-high-outline' : 'ear-outline', onPress: () => void toggleSpeaker() }} />
  </>;
  return <>
    <CallStage simulated name={name} avatar={demoPortrait(username)} video={video} compact={pip}
      background={video ? undefined : background} status={status} controls={controls}
      tools={video && !terminal && <>
        <CallAction small action={{ label: '切换前后摄像头', icon: 'camera-reverse-outline', disabled: !camera,
          onPress: () => setFacing((current) => current === 'front' ? 'back' : 'front') }} />
        <CallAction small action={{ label: camera ? '关闭摄像头' : '开启本机预览', icon: camera ? 'videocam-outline' : 'videocam-off-outline',
          selected: camera, disabled: checking, onPress: () => void toggleCamera() }} />
      </>}
      preview={video && !terminal && camera && (foreground || pip) && <CameraView style={StyleSheet.absoluteFill}
        facing={facing} mirror={facing === 'front'} mute onMountError={() => {
          setCamera(false); setNotice('本机摄像头暂时不可用。');
        }} />}
      extra={<View style={ui.options}>
        {!!notice && <Text accessibilityLiveRegion="polite" style={ui.notice}>{notice}</Text>}
        <View style={ui.row}>
          {ringing && <Pressable accessibilityRole="button" onPress={() => act('accept')} style={ui.utility}>
            <Text style={ui.utilityText}>{incoming ? '模拟接听' : '模拟对方接听'}</Text></Pressable>}
          {!terminal && <Pressable accessibilityRole="button" onPress={() => setDetails(true)} style={ui.utility}>
            <Text style={ui.utilityText}>模拟选项</Text></Pressable>}
        </View>
      </View>} />
    {details && <Sheet title="模拟选项" onClose={() => setDetails(false)}>
      <Notice>本机模拟通话信令。摄像头仅供本地预览，声音和画面不会传给好友。</Notice>
      {ringing && <Button label={incoming ? '模拟拒绝' : '模拟对方拒绝'} variant="soft" onPress={() => { act('decline'); setDetails(false); }} />}
      {state.phase === 'active' && <Button label="模拟网络切换" variant="soft"
        onPress={() => { act('interrupt'); setDetails(false); }} />}
      {state.phase === 'reconnecting' && <>
        <Button label="模拟网络恢复" onPress={() => { act('recover'); setDetails(false); }} />
        <Button label="模拟连接中断" variant="danger" onPress={() => { act('fail'); setDetails(false); }} />
      </>}
      <Button label="检查设备权限" variant="quiet" disabled={checking}
        onPress={() => { setDetails(false); void checkPermissions(); }} />
    </Sheet>}
  </>;
}

const ui = StyleSheet.create({
  options: { minHeight: 48, justifyContent: 'flex-end', alignItems: 'center', gap: space.xxs },
  row: { flexDirection: 'row', justifyContent: 'center', gap: space.xs },
  utility: { minHeight: 44, paddingHorizontal: space.sm, justifyContent: 'center' },
  utilityText: { ...type.control, color: '#D1D1D1' },
  notice: { ...type.support, color: '#FFFFFF', textAlign: 'center' },
});
