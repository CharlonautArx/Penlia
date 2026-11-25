import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { useFocusEffect } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, Switch, Text, View } from 'react-native';

import { Avatar, Button, Empty, Notice, Screen, Section, Sheet } from '../components/ui';
import { isUiDemo } from '../demo/mode';
import { demoPortrait } from '../demo/visuals';
import type { FriendCode, PublicIntro } from '../features/friends/invitations';
import { InviteQr, type QrOutput } from '../features/privacy/InviteQr';
import { back, Field, formatTime } from '../features/social/ui';
import { useLocalPhotoUri } from '../features/space/media';
import { errorMessage, type User } from '../services/api';
import { useAccountPhoto, useSession } from '../services/session';
import { colors, radius, space, styles } from '../theme';

async function readCode(key: string) {
  return Platform.OS === 'web' ? window.localStorage.getItem(key) : SecureStore.getItemAsync(key);
}
async function writeCode(key: string, code?: string) {
  if (Platform.OS === 'web') {
    if (code) window.localStorage.setItem(key, code);
    else window.localStorage.removeItem(key);
  } else if (code) await SecureStore.setItemAsync(key, code);
  else await SecureStore.deleteItemAsync(key);
}
async function sharingAvatar(uri: string) {
  const context = ImageManipulator.manipulate(uri);
  try {
    context.resize({ width: 144 });
    const resized = await context.renderAsync();
    try {
      const photo = await resized.saveAsync({ compress: 0.65, format: SaveFormat.JPEG, base64: true });
      if (!photo.base64 || photo.base64.length > 32768) throw new Error('头像暂时无法用于公开资料，请更换头像后重试。');
      return photo.base64;
    } finally { resized.release(); }
  } finally { context.release(); }
}

export default function MyQrScreen() {
  const { session } = useSession();
  return session ? <MyQr key={session.user.id} user={session.user} /> : null;
}

function MyQr({ user }: { user: User }) {
  const { request, demoAvatarKey } = useSession();
  const photo = useLocalPhotoUri(useAccountPhoto(user.id));
  const key = 'penlia-invite-code.' + user.id;
  const qr = useRef<QrOutput>(null);
  const [active, setActive] = useState<FriendCode>();
  const [days, setDays] = useState('1');
  const [intro, setIntro] = useState<PublicIntro>();
  const [editIntro, setEditIntro] = useState(false);
  const [askedToRevoke, setAskedToRevoke] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const lock = useRef(false);
  const duration = /^\d{1,2}$/.test(days) ? Number(days) : 0;
  const validDays = duration >= 1 && duration <= 30;

  useFocusEffect(useCallback(() => {
    let current = true;
    void (async () => {
      try {
        const code = await readCode(key);
        if (code) {
          const status = await request<{ expiresAt: string | null }>('/friends/code/status', { method: 'POST', body: { code } });
          if (!current) return;
          setActive(status.expiresAt ? { code, expiresAt: status.expiresAt } : undefined);
          if (!status.expiresAt) await writeCode(key);
        }
      } catch (failure) { if (current) setError(errorMessage(failure)); }
      finally { if (current) setLoading(false); }
    })();
    return () => { current = false; };
  }, [key, request]));

  useEffect(() => {
    if (!active) return;
    const until = Date.parse(active.expiresAt) - Date.now();
    const timeout = setTimeout(() => setActive((value) => value?.code === active.code ? undefined : value), Math.max(0, Math.min(until, 2147483647)));
    // 30-day invites can exceed the native timer's maximum interval.
    if (until > 2147483647) clearTimeout(timeout);
    return () => clearTimeout(timeout);
  }, [active]);

  async function run(action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try { await action(); }
    catch (failure) { setError(errorMessage(failure)); }
    finally { lock.current = false; setBusy(false); }
  }
  function generate() {
    if (!validDays) return;
    void run(async () => {
      const next = await request<FriendCode>('/friends/code', { method: 'POST', body: { days: duration } });
      setActive(next);
      await writeCode(key, next.code);
    });
  }
  function output(action: 'save' | 'share') {
    void run(async () => {
      if (!active || !qr.current) return;
      const status = await request<{ expiresAt: string | null }>('/friends/code/status', {
        method: 'POST', body: { code: active.code },
      });
      if (!status.expiresAt) {
        setActive(undefined);
        await writeCode(key);
        throw new Error('二维码已失效，请重新生成。');
      }
      await qr.current.export(action);
      if (action === 'save') setNotice(Platform.OS === 'web' ? '二维码图片已下载。' : '二维码已保存到相册。');
    });
  }

  return <Screen title="我的二维码" back={back}>
    <View style={local.card}>
      <Avatar userId={user.id} name={user.name} size={56} source={demoPortrait(demoAvatarKey ?? user.username)} />
      <Text style={styles.strong}>{user.name}</Text>
      {loading ? <Empty busy>正在校验二维码…</Empty> : active ? <>
        <InviteQr key={active.code} ref={qr} code={active.code} />
        <Text style={[styles.small, local.center]}>有效至 {formatTime(active.expiresAt)}</Text>
      </> : <Empty icon="qr-code-outline">暂无有效的好友二维码。</Empty>}
    </View>
    {!editIntro && !askedToRevoke && !!error && <Notice>{error}</Notice>}
    {!!notice && <Notice>{notice}</Notice>}
    {!!active && <View style={local.actions}>
      <View style={styles.grow}><Button label={Platform.OS === 'web' ? '下载二维码' : '保存至相册'} icon="download-outline" variant="soft"
        disabled={busy || loading} onPress={() => output('save')} /></View>
      <View style={styles.grow}><Button label="分享二维码" icon="share-outline" variant="soft"
        disabled={busy || loading} onPress={() => output('share')} /></View>
    </View>}
    <Field title="有效期（1–30 天）" value={days} maxLength={2} keyboardType="number-pad" onChangeText={setDays} />
    {!!days && !validDays && <Text style={styles.muted}>请输入 1 至 30 之间的整数。</Text>}
    <Button label={active ? '重新生成二维码' : '生成二维码'} variant="gradient" disabled={busy || loading || !validDays} onPress={generate} />
    {!!active && <Button label="使当前二维码失效" variant="danger" disabled={busy} onPress={() => setAskedToRevoke(true)} />}
    <Button label="管理公开资料" icon="person-outline" variant="quiet" disabled={busy} onPress={() => void run(async () => {
      setIntro(await request<PublicIntro>('/me/public-intro'));
      setEditIntro(true);
    })} />
    <Text style={styles.muted}>{isUiDemo ? '预览版在本机校验识别码。' : '扫码后仍需发送好友申请，并由你主动接受。'}</Text>
    {editIntro && intro && <Sheet title="公开资料" avoidKeyboard onClose={() => { if (!busy) setEditIntro(false); }}>
      <View style={styles.row}>
        <Text style={[styles.strong, styles.grow]}>公开头像、签名和地区</Text>
        <Switch accessibilityLabel="公开头像、签名和地区" value={intro.enabled} disabled={busy}
          onValueChange={(enabled) => setIntro({ ...intro, enabled })} />
      </View>
      <Text style={styles.small}>签名来自你的个人资料。头像使用保存时的头像。非好友仅在好友申请或有效二维码中查看你授权公开的资料。</Text>
      <Field title="地区（选填）" value={intro.region} onChangeText={(region) => setIntro({ ...intro, region })} maxLength={30} editable={!busy && intro.enabled} />
      {!!error && <Notice>{error}</Notice>}
      <Button label="保存公开资料" variant="gradient" disabled={busy} onPress={() => void run(async () => {
        const avatar = intro.enabled && photo ? await sharingAvatar(photo) : null;
        await request('/me/public-intro', { method: 'PATCH', body: { ...intro, avatar } });
        setEditIntro(false);
      })} />
    </Sheet>}
    {askedToRevoke && <Sheet title="使二维码失效" onClose={() => { if (!busy) setAskedToRevoke(false); }}>
      <Text style={styles.body}>已保存或分享的这个二维码会立即失效。此前已经发送的好友申请仍可处理。</Text>
      {!!error && <Notice>{error}</Notice>}
      <Button label="确认失效" variant="danger" disabled={busy} onPress={() => void run(async () => {
        await request('/friends/code', { method: 'DELETE' });
        setActive(undefined);
        setAskedToRevoke(false);
        await writeCode(key);
      })} />
    </Sheet>}
  </Screen>;
}

const local = StyleSheet.create({
  card: { backgroundColor: colors.panel, borderRadius: radius.surface, gap: space.sm, alignItems: 'center', padding: space.md },
  center: { textAlign: 'center' },
  actions: { flexDirection: 'row', gap: space.xs },
});
