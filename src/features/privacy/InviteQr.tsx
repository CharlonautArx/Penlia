import { File, Paths } from 'expo-file-system';
import { Asset, requestPermissionsAsync } from 'expo-media-library';
import { isAvailableAsync, shareAsync } from 'expo-sharing';
import QRCode from 'qrcode-generator';
import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import { Platform, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';

const exportSize = 512;

export type QrOutput = { export: (action: 'save' | 'share') => Promise<void> };

export const InviteQr = forwardRef<QrOutput, { code: string }>(({ code }, ref) => {
  const svg = useRef<Svg>(null);
  const { qr, size, path } = useMemo(() => {
    const qr = QRCode(0, 'M');
    qr.addData(code);
    qr.make();
    const size = qr.getModuleCount();
    const cells = [];
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      if (qr.isDark(y, x)) cells.push('M' + (x + 4) + ' ' + (y + 4) + 'h1v1h-1z');
    }
    return { qr, size, path: cells.join('') };
  }, [code]);

  useImperativeHandle(ref, () => ({
    async export(action) {
      if (Platform.OS === 'web') {
        const canvas = document.createElement('canvas');
        const pixel = Math.floor(exportSize / (size + 8));
        canvas.width = canvas.height = (size + 8) * pixel;
        const graphics = canvas.getContext('2d');
        if (!graphics) throw new Error('暂时无法生成二维码图片。');
        graphics.fillStyle = '#FFFFFF';
        graphics.fillRect(0, 0, canvas.width, canvas.height);
        graphics.fillStyle = '#17141D';
        for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
          if (qr.isDark(y, x)) graphics.fillRect((x + 4) * pixel, (y + 4) * pixel, pixel, pixel);
        }
        const png = await new Promise<Blob>((resolve, reject) => canvas.toBlob((data) => data ? resolve(data) : reject(new Error('暂时无法生成图片。'))));
        const file = new globalThis.File([png], 'Penlia-QR.png', { type: 'image/png' });
        if (action === 'share') {
          if (!navigator.canShare?.({ files: [file] })) throw new Error('此浏览器无法分享图片，请先下载二维码。');
          await navigator.share({ files: [file], title: '朋聊好友二维码' });
          return;
        }
        const link = document.createElement('a');
        link.href = URL.createObjectURL(file);
        link.download = file.name;
        link.click();
        setTimeout(() => URL.revokeObjectURL(link.href), 1000);
        return;
      }
      if (action === 'save' && (Platform.OS === 'ios' || (Platform.OS === 'android' && Number(Platform.Version) < 29))) {
        const permission = await requestPermissionsAsync(true);
        if (!permission.granted) throw new Error('请允许朋聊将图片保存到相册。');
      }
      if (!svg.current) throw new Error('二维码还未生成，请重试。');
      const image = await new Promise<string>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('生成二维码图片超时，请重试。')), 4000);
        svg.current?.toDataURL((data) => {
          clearTimeout(timeout);
          if (data) resolve(data);
          else reject(new Error('暂时无法生成二维码图片。'));
        }, { width: exportSize, height: exportSize });
      });
      const file = new File(Paths.cache, action === 'share' ? 'Penlia-QR-share.png' : 'Penlia-QR-' + Date.now() + '.png');
      file.create({ overwrite: action === 'share' });
      try {
        file.write(image, { encoding: 'base64' });
        if (action === 'save') await Asset.create(file.uri);
        else {
          if (!await isAvailableAsync()) throw new Error('此设备暂时无法分享图片。');
          await shareAsync(file.uri, { mimeType: 'image/png', UTI: 'public.png', dialogTitle: '分享朋聊二维码' });
        }
      } finally {
        if (action === 'save' && file.exists) file.delete();
      }
    },
  }), [qr, size]);
  return <View accessible accessibilityLabel="朋聊好友二维码" style={{ alignSelf: 'center', width: '100%', maxWidth: 240, aspectRatio: 1, backgroundColor: '#FFFFFF' }}>
    <Svg ref={svg} width="100%" height="100%" viewBox={`0 0 ${size + 8} ${size + 8}`}>
      <Rect width={size + 8} height={size + 8} fill="white" />
      <Path d={path} fill="#17141D" />
    </Svg>
  </View>;
});
