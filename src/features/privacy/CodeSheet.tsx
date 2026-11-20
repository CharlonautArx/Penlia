import { Camera, CameraView } from 'expo-camera';
import QRCode from 'qrcode-generator';
import { useMemo, useRef, useState } from 'react';
import { Text, View } from 'react-native';

import { Button, Notice, SearchField, Sheet } from '../../components/ui';
import { styles } from '../../theme';

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
  function choose(raw: string) {
    const prefix = 'penlia:' + mode + ':';
    const value = raw.trim();
    if (!value.startsWith(prefix) || !/^[A-Za-z0-9_-]{32}$/.test(value.slice(prefix.length))) {
      setError('这不是当前可用的朋聊二维码。');
      return;
    }
    if (consumed.current) return;
    consumed.current = true;
    setCamera(false);
    onResult(value);
  }
  async function start() {
    setError('');
    try {
      const permission = await Camera.requestCameraPermissionsAsync();
      if (!permission.granted) {
        setError('相机权限未开启，你可以粘贴识别码。');
        return;
      }
      setCamera(true);
    } catch {
      setError('相机暂不可用，你可以粘贴识别码。');
    }
  }
  return (
    <Sheet title="识别朋聊二维码" onClose={onClose}>
      {camera ? (
        <View style={{ height: 220, overflow: 'hidden', borderRadius: 14 }}>
          <CameraView
            style={{ flex: 1 }}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={({ data }) => choose(data)}
            onMountError={() => {
              setCamera(false);
              setError('相机暂不可用。');
            }}
          />
        </View>
      ) : (
        <Button label="开启相机扫码" icon="scan-outline" variant="gradient" onPress={() => void start()} />
      )}
      <Text style={styles.muted}>也可以从好友收到的消息里复制识别码。</Text>
      <SearchField
        label="朋聊识别码"
        placeholder="粘贴识别码"
        value={code}
        onChangeText={setCode}
        autoCapitalize="none"
        autoCorrect={false}
      />
      {!!error && <Notice>{error}</Notice>}
      <Button label="查找识别码" disabled={!code.trim()} onPress={() => choose(code)} />
    </Sheet>
  );
}
