import { File, Paths } from 'expo-file-system';
import { Asset, requestPermissionsAsync } from 'expo-media-library';
import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import { useRef, useState } from 'react';
import { Platform, Share, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop, Text as Label } from 'react-native-svg';
import { isUiDemo } from '../../demo/mode';
import { styles } from '../../theme';
import { Button, Notice, Sheet } from './ui';

export function ShareInvitation({ id, title, close }: { id: string; title: string; close: () => void }) {
  const svg = useRef<Svg>(null);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  const lines =
    Array.from(title)
      .join('')
      .match(/.{1,13}/gu) ?? [];
  const link =
    !isUiDemo && Platform.OS !== 'web'
      ? Linking.createURL('/gathering/' + id, { queryParams: { together: '1' } })
      : '';
  async function act(job: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    setMessage('');
    try {
      await job();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '暂时无法分享，请重试。');
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    if (Platform.OS === 'web') {
      const node = document.querySelector('[data-testid="together-invite-export"] svg');
      if (!node) throw new Error('邀请卡尚未生成。');
      const url = URL.createObjectURL(
        new Blob([new XMLSerializer().serializeToString(node)], { type: 'image/svg+xml' }),
      );
      try {
        const image = new window.Image();
        image.src = url;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = 600;
        canvas.height = 760;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('当前浏览器无法导出图片。');
        context.drawImage(image, 0, 0, 600, 760);
        const a = document.createElement('a');
        a.href = canvas.toDataURL('image/png');
        a.download = '朋聊邀请.png';
        a.click();
      } finally {
        URL.revokeObjectURL(url);
      }
    } else {
      if (
        (Platform.OS === 'ios' || Number(Platform.Version) < 29) &&
        !(await requestPermissionsAsync(true)).granted
      )
        throw new Error('请允许朋聊保存这张邀请卡。');
      const data = await new Promise<string>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('导出超时，请重试。')), 8000);
        svg.current?.toDataURL(
          (result) => {
            clearTimeout(timeout);
            resolve(result);
          },
          { width: 600, height: 760 },
        );
      });
      const file = new File(Paths.cache, 'invitation-' + Date.now() + '.png');
      try {
        file.create();
        file.write(data, { encoding: 'base64' });
        await Asset.create(file.uri);
      } finally {
        if (file.exists) file.delete();
      }
    }
    setMessage('邀请卡已导出。');
  }
  return (
    <Sheet title="分享预览" onClose={close}>
      <View
        testID="together-invite-export"
        style={{ width: '100%', maxWidth: 300, aspectRatio: 300 / 380, alignSelf: 'center' }}
      >
        <Svg ref={svg} width="100%" height="100%" viewBox="0 0 300 380">
          <Defs>
            <LinearGradient id="card" x1="0%" y1="0%" x2="100%" y2="100%">
              <Stop offset="0" stopColor="#E5D6BC" />
              <Stop offset=".48" stopColor="#879D8F" />
              <Stop offset="1" stopColor="#263D45" />
            </LinearGradient>
          </Defs>
          <Rect width="300" height="380" rx="22" fill="url(#card)" />
          <Label x="23" y="42" fontSize="15" fill="#172B2C">
            朋聊 · 一起
          </Label>
          {lines.map((line, i) => (
            <Label key={i} x="23" y={344 - (lines.length - 1 - i) * 26} fill="#FFFFFF" fontSize="19">
              {line}
            </Label>
          ))}
        </Svg>
      </View>
      <Text style={styles.muted}>外发内容仅含活动名称。请检查标题中有无私人信息。</Text>
      <Button label="导出邀请卡" disabled={busy} onPress={() => void act(save)} />
      {!!link && (
        <Button
          label="复制应用内邀请链接"
          disabled={busy}
          onPress={() =>
            void act(async () => {
              await Clipboard.setStringAsync(link);
              setMessage('链接已复制，仅受邀账号可查看。');
            })
          }
        />
      )}
      <Button
        label="分享活动名称"
        disabled={busy}
        variant="soft"
        onPress={() =>
          void act(async () => {
            if (Platform.OS === 'web' && !navigator.share) {
              await Clipboard.setStringAsync(title);
              setMessage('活动名称已复制。');
            } else await Share.share({ message: title });
          })
        }
      />
      {!!message && <Notice>{message}</Notice>}
    </Sheet>
  );
}
