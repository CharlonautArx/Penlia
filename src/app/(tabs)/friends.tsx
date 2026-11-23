import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useRef, useState, type ComponentRef } from 'react';
import { type ScrollView, StyleSheet, Text, View } from 'react-native';

import { GlassLayer } from '../../components/material';
import { Avatar, Button, Empty, Icon, IconButton, ListRow, LoadingSkeleton, Notice, Screen, SearchField, Segments, Sheet, Tag } from '../../components/ui';
import { AlphabetRail, ContactRow, directoryModes, type DirectoryMode, GroupList } from '../../features/friends/DirectoryList';
import { emptyDirectory, sortFriends } from '../../features/friends/directory';
import { useDirectory } from '../../features/friends/store';
import { isUiDemo } from '../../demo/mode';
import { QRImage, ScanCode } from '../../features/privacy/CodeSheet';
import { demoPortrait } from '../../demo/visuals';
import { errorMessage, type User } from '../../services/api';
import { formatHandle } from '../../services/handle';
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
  const directory = useDirectory();
  const [mode, setMode] = useState<DirectoryMode>('all');
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const directoryY = useRef(0);
  const offsets = useRef<Record<string, number>>({});
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
        : await request<{person:User|null}>('/people?username=' + encodeURIComponent(formatHandle(username)));
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
  const contacts = useMemo(() => sortFriends(
    relationships?.filter((item) => item.status === 'accepted') ?? [], directory.value ?? emptyDirectory,
  ), [relationships, directory.value]);
  const key = formatHandle(filter).toLowerCase();
  const shown = contacts.filter((friend) => !key || [friend.displayName, friend.name, formatHandle(friend.username)]
    .some((name) => name.toLowerCase().includes(key)));
  const sections = new Map<string, typeof shown>();
  for (const contact of shown) {
    const entries = sections.get(contact.letter);
    if (entries) entries.push(contact);
    else sections.set(contact.letter, [contact]);
  }

  function scrollToLetter(letter: string) {
    const y = offsets.current[letter];
    if (y !== undefined) scroll.current?.scrollTo({ y: y === 0 ? 0 : directoryY.current + y, animated: false });
  }

  async function reload() {
    setRefreshing(true);
    try { await refresh(); } finally { setRefreshing(false); }
  }

  function openSheet(next: typeof sheet) {
    setError('');
    setSheet(next);
  }

  return (
    <Screen solid inset={false} refreshing={refreshing} onRefresh={() => void reload()} scrollRef={scroll}
      overlay={mode === 'all' && <AlphabetRail letters={[...sections.keys()]} onSelect={scrollToLetter} />}>
      <View style={local.control}>
        <View style={local.searchRow}>
          <IconButton label="添加好友" icon="add" onPress={() => openSheet('add')} />
          <View style={styles.grow}>
            <SearchField variant="neutral" label="搜索好友" placeholder="搜索好友的备注、昵称或朋聊号"
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
      <View style={local.mode}><Segments options={directoryModes} label="好友浏览方式" value={mode} onChange={setMode} /></View>
      {!!directory.error && <Notice action="重试" onAction={directory.retry}>{directory.error}</Notice>}
      {(!relationships && !listError || directory.loading) && <LoadingSkeleton label="正在加载好友" />}
      {relationships && !directory.loading && (mode === 'groups' ? <GroupList contacts={shown} searching={!!key} /> :
        <View onLayout={({ nativeEvent }) => { directoryY.current = nativeEvent.layout.y; }}>
          {!shown.length && <Empty icon="people-outline">{key ? '找不到匹配的好友。' : '添加一位好友，随时聊聊。'}</Empty>}
          {[...sections].map(([letter, entries]) => <View key={letter}
            onLayout={({ nativeEvent }) => { offsets.current[letter] = nativeEvent.layout.y; }}>
            <Text accessibilityRole="header" style={local.letterHeading}>{letter}</Text>
            {entries.map((friend) => <ContactRow key={friend.userId} friend={friend} indexed />)}
          </View>)}
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
          {result && <ListRow title={result.name} detail={formatHandle(result.username)}
            left={<Avatar name={result.name} source={demoPortrait(result.username)} />} trailing={foundRelationship
              ? <Text style={styles.small}>{foundRelationship.status === 'accepted' ? '已是好友' : '已有好友申请'}</Text>
              : <Button label="发送申请" variant="soft" disabled={busy} onPress={() => change('/friends', { userId: result.id, note })} />} />}
        </> : <>
          {incoming.map((friend) => <ListRow key={friend.id} title={friend.name} detail={formatHandle(friend.username) + (friend.verificationMessage ? ' · ' + friend.verificationMessage : '')}
            left={<Avatar name={friend.name} source={demoPortrait(friend.username)} size={36} />}
            trailing={<View style={local.requestActions}>
              <Button label="拒绝" variant="quiet" disabled={busy} onPress={() => change('/friends/decline', { id: friend.id })} />
              <Button label="接受" variant="soft" disabled={busy} onPress={() => change('/friends/accept', { id: friend.id })} />
            </View>} />)}
          {outgoing.map((friend) => <ListRow key={friend.id} title={friend.name} detail={formatHandle(friend.username) + (friend.verificationMessage ? ' · ' + friend.verificationMessage : '')}
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
  mode: { paddingHorizontal: space.md, paddingTop: space.sm, paddingBottom: space.xs },
  letterHeading: { ...type.caption, color: colors.muted, paddingHorizontal: space.md, paddingVertical: 5 },
  requestsIcon: { width: 44, height: 44, borderRadius: radius.control, alignItems: 'center', justifyContent: 'center' },
  requestActions: { flexDirection: 'row' },
});
