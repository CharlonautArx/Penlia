import type { MessageLongPress } from '../chat/record-model';
import * as Location from 'expo-location';
import { GlassLayer } from '../../components/material';
import { useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button, Icon, Notice, Sheet } from '../../components/ui';
import { colors, styles } from '../../theme';
import { locationValue, type LocationValue } from './messages';

export function LocationComposer({ online, onClose, onConfirm, purpose = 'chat' }: {
  online: boolean; onClose: () => void; onConfirm: (value: LocationValue) => void; purpose?: 'chat' | 'map';
}) {
  const [point, setPoint] = useState<LocationValue>();
  const [name, setName] = useState('当前位置');
  const [address, setAddress] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  async function locate() {
    setBusy(true); setNotice(''); setPoint(undefined);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        setNotice('定位权限未开启。允许前台定位后，可以重新获取。');
        return;
      }
      const result = await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), 12_000); }),
      ]);
      const value = locationValue(result.coords.latitude, result.coords.longitude, '当前位置', '');
      if (!value) throw new Error('coordinates');
      setPoint(value);
    } catch { setNotice('无法获取位置。请检查定位服务、信号或网络后重试。'); }
    finally { clearTimeout(timer); setBusy(false); }
  }

  return <Sheet title={purpose==='map'?'填写地点':'发送位置'} onClose={onClose}>
    <Text style={styles.muted}>{purpose==='map'?'仅获取这一次位置。它将填写到地点表单，由你选择保存和分享范围。':'仅获取这一次位置。确认发送后，好友才能看到。'}</Text>
    {point ? <>
      <LocationFace value={{ ...point, name, address }} />
      <TextInput accessibilityLabel="地点名称" maxLength={48} value={name} onChangeText={setName} style={styles.input} />
      <TextInput accessibilityLabel="地点地址" placeholder="可填写街道或地标（选填）" placeholderTextColor={colors.quiet}
        maxLength={160} value={address} onChangeText={setAddress} style={styles.input} />
      <Button label={purpose==='map'?'填入地点表单':'确认发送位置'} variant="gradient" disabled={!online} onPress={() => {
        const value = locationValue(point.latitude, point.longitude, name, address);
        if (value) onConfirm(value);
      }} />
    </> : <Button label={busy ? '正在获取位置…' : '获取当前位置'} icon="locate-outline" variant="gradient" disabled={busy}
      onPress={() => void locate()} />}
    {!!notice && <Notice>{notice}</Notice>}
    {!online && <Notice>聊天连接已断开，恢复后可以继续发送。</Notice>}
  </Sheet>;
}

function LocationFace({ value }: { value: LocationValue }) {
  return <View style={local.card}>
    <View style={local.icon}><GlassLayer roundness={11} /><Icon name="location-outline" color={colors.accent} size={23} /></View>
    <View style={styles.grow}>
      <Text style={styles.strong}>{value.name || '当前位置'}</Text>
      {!!value.address && <Text numberOfLines={2} style={styles.muted}>{value.address}</Text>}
      <Text style={styles.small}>{value.latitude.toFixed(5)}, {value.longitude.toFixed(5)}</Text>
    </View>
  </View>;
}

export function LocationBubble({ value, onLongPress }: { value: LocationValue; onLongPress?: MessageLongPress }) {
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const coordinate = value.latitude + ',' + value.longitude;
  async function maps() {
    const query = encodeURIComponent(coordinate + '(' + value.name + ')');
    const url = Platform.OS === 'android' ? 'geo:' + coordinate + '?q=' + query
      : 'https://maps.apple.com/?ll=' + encodeURIComponent(coordinate) + '&q=' + encodeURIComponent(value.name);
    try { await Linking.openURL(url); } catch { setFailed(true); }
  }
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel={'查看位置：' + value.name} onLongPress={onLongPress} onPress={() => setOpen(true)}>
      <LocationFace value={value} />
    </Pressable>
    {open && <Sheet title="位置详情" onClose={() => setOpen(false)}>
      <LocationFace value={value} />
      <Text style={styles.small}>坐标为 WGS‑84。打开地图会将地点交给外部地图应用。</Text>
      <Button label="打开地图" variant="gradient" icon="open-outline" onPress={() => void maps()} />
      {failed && <Notice>当前无法打开地图，你仍可查看上方的经纬度。</Notice>}
    </Sheet>}
  </>;
}

const local = StyleSheet.create({
  card: { ...styles.row, minWidth: 203, padding: 8, gap: 9 },
  icon: { width: 39, height: 39, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
});
