import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { GlassLayer } from '../../components/material';
import { Avatar, Button, Empty, Icon, IconButton, ListRow, LoadingSkeleton, Notice, Screen, SearchField, Section, Sheet, Tag } from '../../components/ui';
import { isUiDemo } from '../../demo/mode';
import { QRImage, ScanCode } from '../../features/privacy/CodeSheet';
import { demoPortrait } from '../../demo/visuals';
import { errorMessage, type User } from '../../services/api';
import { useFriends } from '../../services/friends';
import { useSession } from '../../services/session';
import { colors, radius, space, styles, type } from '../../theme';

export default function FriendsScreen() {
  const { request } = useSession();
  const { relationships, refresh, error: listError } = useFriends();
  const [lookup,setLookup]=useState<'handle'|'phone'>('handle');
  const [codeSheet,setCodeSheet]=useState<'mine'|'scan'>();
  const [ownCode,setOwnCode]=useState<{code:string;expiresAt:string}>();
  const [note,setNote]=useState('');
  const [username, setUsername] = useState('');
  const [filter, setFilter] = useState('');
  const [sheet, setSheet] = useState<'add' | 'requests'>();
  const [refreshing, setRefreshing] = useState(false);
  const [result, setResult] = useState<User | null>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const foundRelationship = relationships?.find((item) => item.userId === result?.id);

  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  function search() {
    setResult(undefined);
    void run(async () => {
      const { person } = lookup === 'phone'
        ? await request<{person:User|null}>('/people/phone',{method:'POST',body:{phone:username.trim()}})
        : await request<{person:User|null}>('/people?username=' + encodeURIComponent(username.trim()));
      setResult(person);
    });
  }

  function change(path: string, body: Record<string, string>) {
    void run(async () => {
      await request(path, { method: 'POST', body });
      await refresh();
    });
  }

  const incoming = relationships?.filter((item) => item.status === 'pending' && !item.outgoing) ?? [];
  const outgoing = relationships?.filter((item) => item.status === 'pending' && item.outgoing) ?? [];
  const friends = relationships?.filter((item) => item.status === 'accepted') ?? [];

  const key = filter.trim().toLowerCase().replace(/^@/, '');
  const shown = friends.filter((friend) => !key || friend.name.toLowerCase().includes(key) || friend.username.toLowerCase().includes(key));

  async function reload() {
    setRefreshing(true);
    try { await refresh(); } finally { setRefreshing(false); }
  }

  function openSheet(next: typeof sheet) {
    setError('');
    setSheet(next);
  }

  return (
    <Screen solid inset={false} refreshing={refreshing} onRefresh={() => void reload()}>
      <View style={local.control}>
        <View style={local.searchRow}>
          <IconButton label="添加好友" icon="add" onPress={() => openSheet('add')} />
          <View style={styles.grow}>
            <SearchField variant="neutral" label="搜索好友" placeholder="搜索好友的昵称或朋聊号"
              value={filter} onChangeText={setFilter} />
          </View>
        </View>
        {!!listError && <Notice action="重试" onAction={() => void reload()}>{listError}</Notice>}
      </View>
      <ListRow title="新的朋友" style={local.managementRow} detail={incoming.length ? '有好友申请待处理' : '查看好友申请'}
        left={<View style={local.requestsIcon}><GlassLayer /><Icon name="people-outline" /></View>}
        trailing={<View style={styles.row}>
          {incoming.length > 0 && <Tag>{String(incoming.length)}</Tag>}
          <Icon name="chevron-forward" size={16} color={colors.quiet} />
        </View>} onPress={() => openSheet('requests')} />
      <ListRow title="群聊" style={local.managementRow} trailing={<Icon name="chevron-forward" size={16} color={colors.quiet} />}
        onPress={() => router.push('/groups')} />
      <View style={local.section}><Section title="我的好友" detail={relationships ? friends.length + ' 位' : undefined} /></View>
      {!relationships && !listError && <LoadingSkeleton label="正在加载好友" />}
      {relationships && !shown.length && <Empty icon="people-outline">{key ? '找不到匹配的好友。' : '添加一位好友，随时聊聊。'}</Empty>}
      {shown.map((friend) => <View key={friend.id} style={local.contact}>
        <View style={styles.grow}><ListRow title={friend.name} detail={'@' + friend.username + (friend.bio ? ' · ' + friend.bio : '')}
          left={<Avatar name={friend.name} source={demoPortrait(friend.username)} size={44} />}
          trailing={<View />} onPress={() => router.push({ pathname: '/person/[id]', params: { id: friend.userId } })} /></View>
        <IconButton label={`和${friend.name}聊天`} icon="chatbubble-outline"
          onPress={() => router.push({ pathname: '/chat/[id]', params: { id: friend.userId } })} />
      </View>)}
      {sheet && <Sheet title={sheet === 'add' ? '添加好友' : '新的朋友'} onClose={() => setSheet(undefined)}>
        {!!error && <Notice>{error}</Notice>}
        {sheet === 'add' ? <>
          {!isUiDemo && <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>
            <Button label="按朋聊号" variant={lookup==='handle'?'primary':'soft'} onPress={()=>{setLookup('handle');setUsername('');setResult(undefined);}} />
            <Button label="按手机号" variant={lookup==='phone'?'primary':'soft'} onPress={()=>{setLookup('phone');setUsername('');setResult(undefined);}} />
            <Button label="扫码添加" icon="scan-outline" variant="soft" onPress={()=>{setSheet(undefined);setCodeSheet('scan');}} />
            <Button label="我的二维码" icon="qr-code-outline" variant="soft" onPress={()=>{setSheet(undefined);setCodeSheet('mine');void run(async()=>{
              setOwnCode(await request('/friends/code',{method:'POST'}));
            });}} />
          </View>}
          <SearchField label={lookup==='phone'?'好友手机号':'好友账号'} placeholder={lookup==='phone'?'输入完整手机号':'输入完整朋聊号'} value={username}
            autoCapitalize="none" autoCorrect={false} editable={!busy} maxLength={24}
            onChangeText={(value) => { setUsername(value); setResult(undefined); }}
            onSubmitEditing={() => { if (!busy && username.trim()) search(); }} returnKeyType="search" />
          <Button label={busy ? '查找中…' : '查找'} disabled={busy || !username.trim()} onPress={search} />
          {result === null && <Empty>找不到可添加的账号。</Empty>}
          {result && !foundRelationship && !isUiDemo && <SearchField label="好友申请验证消息" placeholder="选填・说说你是谁" value={note} maxLength={100} onChangeText={setNote}/> }
          {result && <ListRow title={result.name} detail={'@' + result.username}
            left={<Avatar name={result.name} source={demoPortrait(result.username)} />} trailing={foundRelationship
              ? <Text style={styles.small}>{foundRelationship.status === 'accepted' ? '已是好友' : '已有好友申请'}</Text>
              : <Button label="发送申请" variant="soft" disabled={busy} onPress={() => change('/friends', { userId: result.id, note })} />} />}
        </> : <>
          {incoming.map((friend) => <ListRow key={friend.id} title={friend.name} detail={'@' + friend.username + (friend.verificationMessage ? ' · ' + friend.verificationMessage : '')}
            left={<Avatar name={friend.name} source={demoPortrait(friend.username)} size={36} />}
            trailing={<View style={local.requestActions}>
              <Button label="拒绝" variant="quiet" disabled={busy} onPress={() => change('/friends/decline', { id: friend.id })} />
              <Button label="接受" variant="soft" disabled={busy} onPress={() => change('/friends/accept', { id: friend.id })} />
            </View>} />)}
          {outgoing.map((friend) => <ListRow key={friend.id} title={friend.name} detail={'@' + friend.username + (friend.verificationMessage ? ' · ' + friend.verificationMessage : '')}
            left={<Avatar name={friend.name} source={demoPortrait(friend.username)} size={36} />}
            trailing={<Text style={styles.small}>等待接受</Text>} />)}
          {!incoming.length && !outgoing.length && <Empty icon="people-outline">目前没有待处理的好友申请。</Empty>}
        </>}
      </Sheet>}
      {codeSheet==='mine' && <Sheet title="我的好友二维码" onClose={()=>setCodeSheet(undefined)}>
        {!!error && <Notice>{error}</Notice>}
        {ownCode?<><QRImage value={ownCode.code}/><Text selectable style={styles.small}>{ownCode.code}</Text>
          <Text style={styles.muted}>有效至 {new Date(ownCode.expiresAt).toLocaleString('zh-CN')}。生成新码会使旧码失效。</Text></>
          : !error&&<Empty busy>正在生成二维码…</Empty>}
      </Sheet>}
      {codeSheet==='scan' && <ScanCode mode="add" onClose={()=>setCodeSheet(undefined)} onResult={(code)=>{
        setCodeSheet(undefined);setSheet('add');setResult(undefined);
        void run(async()=>{const {person}=await request<{person:User|null}>('/people/code',{method:'POST',body:{code}});setResult(person);});
      }}/>}
    </Screen>
  );
}

const local = StyleSheet.create({
  control: { paddingLeft: space.xs, paddingRight: space.md, paddingTop: space.sm, paddingBottom: space.sm, gap: space.xs },
  searchRow: { ...styles.row, gap: space.xxs },
  managementRow: { minHeight: 60 },
  section: { paddingHorizontal: space.md, paddingTop: space.md, paddingBottom: space.xxs },
  requestsIcon: { width: 44, height: 44, borderRadius: radius.control, alignItems: 'center', justifyContent: 'center' },
  contact: { ...styles.row, gap: 0, paddingRight: 6 },
  requestActions: { flexDirection: 'row' },
});
