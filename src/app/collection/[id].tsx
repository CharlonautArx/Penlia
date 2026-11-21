import { randomUUID } from 'expo-crypto';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { Button, Empty, ListRow, Notice, Screen, Section, Sheet } from '../../components/ui';
import { scopes, type Audience } from '../../features/moments/Feed';
import { MomentMediaTile, type Media } from '../../features/moments/media';
import {
  back,
  categories,
  Choices,
  Field,
  InviteChoices,
  useRecord,
  type Category,
} from '../../features/social/ui';
import { useSession } from '../../services/session';
import { RelatedRelays } from '../../features/world/related';
import { styles } from '../../theme';

type CollectionKind = 'journal' | 'collaboration';
export type CollectionInfo = {
  id: string;
  ownerId: string;
  kind: CollectionKind;
  title: string;
  canWrite: boolean;
  momentId: string | null;
};
type Detail = {
  collection: CollectionInfo;
  entries: { id: string; title: string; eventDate: string; category: Category; author: string }[];
  members: { id: string; name: string; state: string }[];
  next: string | null;
};

export default function CollectionScreen() {
  const { id, kind, from, title, album } = useLocalSearchParams<{
    id: string;
    kind?: CollectionKind;
    from?: string;
    title?: string;
    album?: string;
  }>();
  return id === 'new' ? <Create kind={kind ?? 'journal'} from={from} title={title} /> : <Details id={id} showAlbum={album === '1'} />;
}

function Create({ kind, from, title }: { kind: CollectionKind; from?: string; title?: string }) {
  const { request, run, busy, error } = useRecord('/p1/collections');
  const [clientId] = useState(randomUUID);
  const [name, setName] = useState(title ?? '');
  const [ids, setIds] = useState<string[]>([]);
  const [group, setGroup] = useState('');
  return (
    <Screen title={kind === 'collaboration' ? '发起共创动态' : '新建共同日记'} back={back}>
      <Field title="名称" value={name} onChangeText={setName} maxLength={80} />
      <Text style={styles.muted}>
        {from
          ? '会邀请确认参加这次约局的好友，好友同意后才加入。'
          : '参与者需主动接受邀请。你可以稍后继续邀请好友。'}
      </Text>
      {!from && <InviteChoices ids={ids} setIds={setIds} groupId={group} setGroupId={setGroup} />}
      {!!error && <Notice>{error}</Notice>}
      <Button
        label="创建"
        variant="gradient"
        disabled={busy || !name.trim()}
        onPress={() =>
          void run(async () => {
            const result = await request<{ id: string }>('/p1/collections', {
              method: 'POST',
              body: {
                clientId,
                kind,
                title: name,
                gatheringId: from,
                memberIds: ids,
                groupId: group || undefined,
              },
            });
            router.replace({ pathname: '/collection/[id]', params: { id: result.id } });
          }, false)
        }
      />
    </Screen>
  );
}

function Details({ id, showAlbum }: { id: string; showAlbum: boolean }) {
  const base = '/p1/collections/' + id;
  const [category, setCategory] = useState<Category>();
  const [from, setFrom] = useState('');
  const [until, setUntil] = useState('');
  const [filter, setFilter] = useState('');
  const [more, setMore] = useState<Detail['entries']>([]);
  const [cursor, setCursor] = useState<string | null>();
  const { data, error, busy, run, request, load } = useRecord<Detail>(base + filter);
  const { session } = useSession();
  const [panel, setPanel] = useState<'entry' | 'invite' | 'publish' | 'album' | 'leave' | 'filter' | undefined>(showAlbum ? 'album' : undefined);
  const [ids, setIds] = useState<string[]>([]);
  const [group, setGroup] = useState('');
  const [scope, setScope] = useState<Audience>('private');
  const [title, setTitle] = useState('');
  const [day, setDay] = useState(new Date().toLocaleDateString('sv-SE'));
  const [entryCategory, setEntryCategory] = useState<Category>('other');
  const [clientId, setClientId] = useState(randomUUID);
  const coll = data?.collection;
  const owner = coll?.ownerId === session?.user.id;
  const send = (action: string, body: Record<string, unknown>) =>
    request(base + '/' + action, { method: 'POST', body });
  if (!coll)
    return (
      <Screen title="共同记录" back={back}>
        {error ? (
          <Notice action="重试" onAction={() => void load()}>
            {error}
          </Notice>
        ) : (
          <Empty busy>正在读取共同记录…</Empty>
        )}
      </Screen>
    );
  function open(value: typeof panel) {
    setIds([]);
    setGroup('');
    setPanel(value);
  }
  const next = cursor === undefined ? data.next : cursor;
  return (
    <Screen
      title={coll.kind === 'journal' ? '共同日记' : '共创动态'}
      back={back}
      refreshing={busy}
      onRefresh={() => {
        setMore([]);
        setCursor(undefined);
        void load();
      }}
    >
      <View style={styles.card}>
        <Section title={coll.title} />
        <Text style={styles.muted}>
          {coll.kind === 'journal'
            ? '仅已加入的成员可读写。'
            : '发起者设置共创动态范围，各作者为自己的内容单独授权。'}
        </Text>
      </View>
      <View style={[styles.row, { flexWrap: 'wrap' }]}>
        <Button
          label="共同相册"
          variant="soft"
          icon="images-outline"
          onPress={() => open('album')}
        />
        {coll.kind === 'journal' && (
          <Button label="筛选日期与活动" variant="soft" onPress={() => open('filter')} />
        )}
      </View>
      <RelatedRelays kind={coll.kind} id={id} />
      {coll.canWrite && coll.kind === 'journal' && (
        <Button
          label="添加经历"
          icon="add"
          variant="gradient"
          onPress={() => {
            setClientId(randomUUID());
            setTitle('');
            open('entry');
          }}
        />
      )}
      {owner && coll.kind === 'collaboration' && !coll.momentId && (
        <Button label="发布共创动态" variant="gradient" onPress={() => open('publish')} />
      )}
      {owner && coll.momentId && (
        <Button
          label="管理已发布动态的可见范围"
          variant="soft"
          onPress={() => router.push({ pathname: '/private-moment', params: { id: coll.momentId! } })}
        />
      )}
      {coll.kind==='journal'&&<Button label="保存为共同回忆" variant="quiet"
        onPress={()=>router.push({pathname:'/life/memories',params:{from:coll.id,sourceKind:'journal',title:coll.title}})}/>}
      {!data.entries.length && <Empty icon="book-outline">还没有符合条件的记录。</Empty>}
      {[...data.entries, ...more].map((entry) => (
        <ListRow
          key={entry.id}
          title={entry.title}
          detail={entry.eventDate + ' · ' + categories[entry.category] + ' · ' + entry.author}
          onPress={() => router.push({ pathname: '/journal-entry/[id]', params: { id: entry.id } })}
        />
      ))}
      {next && (
        <Button
          label="加载更早记录"
          variant="soft"
          onPress={() =>
            void run(async () => {
              const result = await request<Detail>(
                base + (filter ? filter + '&' : '?') + 'before=' + encodeURIComponent(next),
              );
              setMore((current) => [...current, ...result.entries]);
              setCursor(result.next);
            }, false)
          }
        />
      )}
      {coll.canWrite && (
        <>
          <Section title="成员" />
          {!data.members.length && <Text style={styles.muted}>还没有其他成员加入。</Text>}
          {data.members
            .filter((member) => member.state === 'active' || member.state === 'invited')
            .map((member) => (
              <ListRow
                key={member.id}
                title={member.name}
                detail={member.state === 'active' ? '已加入' : '待接受'}
                trailing={
                  owner ? (
                    <Button
                      label="移除"
                      variant="danger"
                      disabled={busy}
                      onPress={() =>
                        void run(() => send('membership', { action: 'remove', userId: member.id }))
                      }
                    />
                  ) : undefined
                }
              />
            ))}
          {owner ? (
            <Button label="邀请好友" variant="soft" onPress={() => open('invite')} />
          ) : (
            <Button label="退出共同记录" variant="danger" onPress={() => open('leave')} />
          )}
        </>
      )}
      {!!error && <Notice>{error}</Notice>}
      {panel && (
        <Sheet
          title={
            {
              entry: '添加经历',
              invite: '邀请好友',
              publish: '发布共创动态',
              album: '共同相册',
              leave: '退出共同记录',
              filter: '筛选记录',
            }[panel]
          }
          onClose={() => setPanel(undefined)}
        >
          {(panel === 'invite' || (panel === 'publish' && (scope === 'group' || scope === 'selected'))) && (
            <InviteChoices ids={ids} setIds={setIds} groupId={group} setGroupId={setGroup} />
          )}
          {panel === 'publish' && (
            <>
              <Text style={styles.muted}>这项设置决定谁能打开共创动态。每条内容还需要作者授权给对应读者。</Text>
              <Choices
                labels={scopes}
                value={scope}
                set={(value) => {
                  setIds([]);
                  setGroup('');
                  setScope(value);
                }}
              />
            </>
          )}
          {panel === 'entry' && (
            <>
              <Field title="经历标题" value={title} onChangeText={setTitle} />
              <Field title="发生日期" placeholder="年-月-日" value={day} onChangeText={setDay} />
              <Choices labels={categories} value={entryCategory} set={setEntryCategory} />
            </>
          )}
          {panel === 'filter' && (
            <>
              <Choices
                labels={{ any: '所有分类', ...categories }}
                value={category ?? 'any'}
                set={(value) => setCategory(value === 'any' ? undefined : value)}
              />
              <Field title="开始日期（可选）" placeholder="年-月-日" value={from} onChangeText={setFrom} />
              <Field title="结束日期（可选）" placeholder="年-月-日" value={until} onChangeText={setUntil} />
            </>
          )}
          {panel === 'album' && <CollectionAlbum id={id} />}
          {panel === 'leave' && (
            <Text style={styles.muted}>
              退出后失去成员访问权限。已发布动态另按发起者设置的范围开放。你仍可在「我贡献的内容」撤回自己上传的记录。
            </Text>
          )}
          {!!error && <Notice>{error}</Notice>}
          {panel !== 'album' && (
            <Button
              label={
                panel === 'publish'
                  ? '确认发布'
                  : panel === 'leave'
                    ? '确认退出'
                    : panel === 'invite'
                      ? '发送邀请'
                      : '确认'
              }
              variant={panel === 'leave' ? 'danger' : 'gradient'}
              disabled={busy}
              onPress={() =>
                void run(
                  async () => {
                    if (panel === 'entry') {
                      const result = (await send('entries', {
                        title,
                        eventDate: day,
                        category: entryCategory,
                        clientId,
                      })) as { id: string };
                      setPanel(undefined);
                      router.push({ pathname: '/journal-entry/[id]', params: { id: result.id } });
                      return;
                    }
                    if (panel === 'invite')
                      await send('invite', { memberIds: ids, groupId: group || undefined });
                    if (panel === 'publish')
                      await send('publish', { scope, memberIds: ids, groupId: group || undefined });
                    if (panel === 'leave') {
                      await send('membership', { action: 'leave' });
                      router.replace({ pathname: '/social', params: { section: 'collections' } });
                      return;
                    }
                    if (panel === 'filter') {
                      const query = new URLSearchParams();
                      if (category) query.set('category', category);
                      if (from) query.set('from', from);
                      if (until) query.set('until', until);
                      setMore([]);
                      setCursor(undefined);
                      setFilter(query.size ? '?' + query : '');
                    }
                    setPanel(undefined);
                  },
                  panel !== 'filter' && panel !== 'leave',
                )
              }
            />
          )}
        </Sheet>
      )}
    </Screen>
  );
}

function CollectionAlbum({ id }: { id: string }) {
  const { data, error, load } = useRecord<{ media: (Media & { author: string; title: string })[] }>(
    '/p1/collections/' + id + '/album',
  );
  if (error) return <Notice action="重试" onAction={() => void load()}>{error}</Notice>;
  if (!data) return <Empty busy>正在读取相册…</Empty>;
  if (!data.media.length) return <Empty>还没有照片或视频。</Empty>;
  return data.media.map((item) => (
    <View key={item.id} style={styles.card}>
      <Text style={styles.strong}>{item.title} · {item.author}</Text>
      <MomentMediaTile item={item} />
    </View>
  ));
}
