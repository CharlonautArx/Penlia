import { Camera, CameraView } from 'expo-camera';
import QRCode from 'qrcode-generator';
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { AppState, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BlurTargetView, BlurView } from 'expo-blur';

import { Icon, IconButton } from '../../components/ui';
import { radius, space, touch, type } from '../../theme';

export function QRImage({ value }: { value: string }) {
  const { size, rows } = useMemo(() => {
    const qr = QRCode(0, 'M');
    qr.addData(value);
    qr.make();
    const size = qr.getModuleCount();
    const rows = Array.from({ length: size }, (_, y) => {
      const runs: [number, number][] = [];
      for (let x = 0; x < size; x++) {
        if (qr.isDark(y, x)) {
          const run = runs.at(-1);
          if (run && run[0] + run[1] === x) run[1]++;
          else runs.push([x, 1]);
        }
      }
      return runs;
    });
    return { size, rows };
  }, [value]);
  const pixel = Math.floor(228 / (size + 8));
  return (
    <View
      accessible
      accessibilityLabel="朋聊二维码"
      style={{ width: (size + 8) * pixel, alignSelf: 'center', padding: 4 * pixel, backgroundColor: '#FFFFFF' }}
    >
      {rows.map((row, y) => (
        <View key={y} style={{ height: pixel, width: size * pixel }}>
          {row.map(([left, width]) => (
            <View
              key={left}
              style={{
                position: 'absolute',
                left: left * pixel,
                width: width * pixel,
                height: pixel,
                backgroundColor: '#111827',
              }}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

export function ScanCode({
  mode,
  onClose,
  onResult,
}: {
  mode: 'add' | 'group';
  onClose: () => void;
  onResult: (code: string) => void;
}) {
  const [camera, setCamera] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const consumed = useRef(false);
  const [active, setActive] = useState(AppState.currentState !== 'background');
  const [editing, setEditing] = useState(false);
  const target = useRef<ComponentRef<typeof View>>(null);
  const mounted = useRef(false);
  const lastCode = useRef('');
  const start = useCallback(async () => {
    try {
      const permission = await Camera.requestCameraPermissionsAsync();
      if (!mounted.current) return;
      setCamera(permission.granted);
      setError(permission.granted ? '' : '相机权限未开启，可以输入识别码。');
    } catch {
      if (mounted.current) setError('相机暂不可用，可以输入识别码。');
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    void start();
    const subscription = AppState.addEventListener('change', (state) => setActive(state === 'active'));
    return () => { mounted.current = false; subscription.remove(); };
  }, [start]);

  function choose(raw: string) {
    if (consumed.current) return;
    const prefix = 'penlia:' + mode + ':';
    const value = raw.trim();
    if (!value.startsWith(prefix) || !/^[A-Za-z0-9_-]{32}$/.test(value.slice(prefix.length))) {
      setError('这不是当前可用的朋聊二维码。');
      return;
    }
    consumed.current = true;
    setCamera(false);
    onResult(value);
  }
  return <Modal visible presentationStyle="fullScreen" animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
    <View style={local.screen}>
      <BlurTargetView style={StyleSheet.absoluteFill} ref={target}>
        {camera && active && <CameraView style={StyleSheet.absoluteFill} facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={editing ? undefined : ({ data }) => {
            if (lastCode.current !== data) { lastCode.current = data; choose(data); }
          }} onMountError={() => { setCamera(false); setError('相机暂不可用，可以输入识别码。'); }} />}
      </BlurTargetView>
      <SafeAreaView style={local.screenControls}>
        <KeyboardAvoidingView style={local.screenControls} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={local.close}><IconButton label="关闭识别" icon="close" color="#FFFFFF" onPress={onClose} /></View>
          <View style={local.center} pointerEvents="none">{!editing && <View style={local.frame} />}</View>
          <View style={local.footer}>
            {!!error && <Text accessibilityLiveRegion="polite" style={local.notice}>{error}</Text>}
            {!camera && <Pressable accessibilityRole="button" onPress={() => void start()} style={local.retry}><Text style={local.white}>开启相机扫码</Text></Pressable>}
            <View style={local.field}>
              <BlurView pointerEvents="none" blurTarget={target} blurMethod="dimezisBlurViewSdk31Plus" intensity={25} tint="light" style={StyleSheet.absoluteFill} />
              <View pointerEvents="none" style={local.glass} />
              <Icon name="scan-outline" size={19} color="#40434A" />
              <TextInput accessibilityLabel="输入识别码" placeholder="输入识别码" value={code} onChangeText={setCode}
                onFocus={() => setEditing(true)} onBlur={() => setEditing(false)} maxLength={128}
                autoCorrect={false} autoCapitalize="none" returnKeyType="search" placeholderTextColor="#60636A"
                onSubmitEditing={() => choose(code)} style={local.input} />
              <IconButton label="查找识别码" icon="arrow-forward" color="#26282E" disabled={!code.trim()} onPress={() => choose(code)} />
            </View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  </Modal>;
}
const local = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#08090A' },
  screenControls: { flex: 1 },
  close: { alignSelf: 'flex-start', margin: space.sm, borderRadius: radius.pill, backgroundColor: '#00000068' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  frame: { width: '60%', maxWidth: 270, aspectRatio: 1, maxHeight: '85%', borderRadius: radius.surface, borderWidth: 1.5, borderColor: '#FFFFFFC8' },
  footer: { margin: space.md, gap: space.xs },
  notice: { ...type.support, color: '#FFFFFF', backgroundColor: '#111111BD', padding: space.sm, borderRadius: radius.control },
  retry: { alignSelf: 'center', justifyContent: 'center', minHeight: touch, paddingHorizontal: space.md, backgroundColor: '#222222BE', borderRadius: radius.pill },
  white: { ...type.control, color: '#FFFFFF' },
  field: { minHeight: touch, flexDirection: 'row', alignItems: 'center', gap: space.xs, paddingLeft: space.md,
    overflow: 'hidden', borderRadius: radius.pill, borderColor: '#FFFFFFED', borderWidth: 1, backgroundColor: '#FFFFFFCE', boxShadow: '0px 3px 12px #00000030' },
  glass: { ...StyleSheet.absoluteFill, backgroundColor: '#FFFFFFDE' },
  input: { ...type.body, flex: 1, minWidth: 0, minHeight: touch, color: '#24262A' },
});
