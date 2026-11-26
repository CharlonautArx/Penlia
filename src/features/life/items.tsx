import { useTogether, useTogetherRouter } from '../together/navigation';
import { randomUUID } from 'expo-crypto';
import { useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import Animated, { FadeIn, ReduceMotion } from 'react-native-reanimated';
import { discoveryCatalog } from '../play/catalog';
import { PlaceCard } from '../play/Cards';
import { useSavedPlaces } from '../play/Gather';
import { ChatFavorite, type ChatFavoritePreview } from './ChatFavorite';
import { FavoriteSegments } from './FavoriteSegments';
import { Button, Icon, ListRow, Notice, Section, Sheet } from '../together/ui';
import { MemberChoices } from '../privacy/MemberChoices';
import { LocationBubble, LocationComposer } from '../media/LocationCard';
import { type LocalMedia, type Media } from '../moments/media';
import { Choices, Field, useRecord } from '../social/ui';
import { useFriends } from '../../services/friends';
import { useSession } from '../../services/session';
import { colors, fixed, radius, styles, touch, type } from '../../theme';
import { AssetPicker, DataEmpty, MediaStrip, uploadAssets, type Project } from './ui';

const categories = {
  food: '美食',
  film: '电影',
  music: '音乐',
  travel: '旅行',
  leisure: '休闲',
  other: '其他',
};
type Category = keyof typeof categories;
const collectionLabels = { food: '美食', travel: '景点', leisure: '休闲', chat: '聊天记录' };
type Collection = keyof typeof collectionLabels;
const collectionOf = (category: Category): Exclude<Collection, 'chat'> =>
  category === 'food' || category === 'travel' ? category : 'leisure';
const savedCategoryLabels = { food: '美食', travel: '景点', leisure: '休闲' };
const marks = { want: '想去', visited: '去过', done: '一起完成', recommended: '朋友推荐' };
const scopes = { private: '仅自己', space: '共同成员', selected: '指定好友', group: '预设关系组' };
type Scope = keyof typeof scopes;
type Kind = 'saved' | 'place';
type Item = {
  id: string;
  ownerId: string;
  quantity?:number;claimed?:boolean;claimedByMe?:boolean;
  chatRecordId?: string;
  chatPreview?: ChatFavoritePreview;
  kind: Kind;
  title: string;
  category: Category;
  notes: string;
  city: string;
  location: string;
  tags: string[];
  state: keyof typeof marks;
  scope: Scope | null;
  groupId: string | null;
  memberIds: string[] | null;
  sourceUrl: string | null;
  latitude: number | null;
  longitude: number | null;
  spaceId: string | null;
  revision: number;
  author: string;
  media: Media[];
  wishId?: string | null;
  tripId?: string | null;
  memoryId?: string | null;
};
type ItemPage = { items: Item[]; next: number | null };

const addressOf = (item: Item) => [item.city, item.location].filter(Boolean).join(' · ');
const tabs = { mine: '我的收藏', friends: '好友推荐' };
const mapTabs = { mine: '我的地点', friends: '朋友分享' };

export function ItemsView({ kind, space, itemId }: { kind: Kind; space?: string; itemId?: string }) {
  const router = useTogetherRouter();
  const together = useTogether();
  const { session } = useSession();
  const favorites = kind === 'saved' && !space;
  const [collection, setCollection] = useState<Collection>('food');
  const [tab, setTab] = useState<'mine' | 'friends'>('mine');
  const [category, setCategory] = useState<Category>();
  const [editor, setEditor] = useState<Item | 'new'>();
  const [expanded, setExpanded] = useState<Item>();
  const [chatActions, setChatActions] = useState<Item>();
  const [removing, setRemoving] = useState<Item>();
  const [copying, setCopying] = useState<{ id: string; clientId: string }>();
  const [notice, setNotice] = useState('');
  const [fetched, setFetched] = useState<{ path: string; rows: Item[]; next: number | null }>();
  const includeLegacy = favorites && tab === 'mine' && collection === 'travel' && !itemId;
  const legacy = useSavedPlaces(includeLegacy);
  const legacyPlaces = includeLegacy ? discoveryCatalog().filter((place) => legacy.saved?.includes(place.id)) : [];
  const path =
    '/p2/items?' +
    new URLSearchParams({
      kind,
      tab: space ? 'space' : tab,
      ...(space ? { space } : {}),
      ...(favorites ? { collection } : category ? { category } : {}),
    });
  const { data, error, busy, run, request, load } = useRecord<ItemPage>(path);
  const entries = [...(data?.items ?? []), ...(fetched?.path === path ? fetched.rows : [])].filter(
    (item, index, all) => all.findIndex((x) => x.id === item.id) === index,
  );
  const next = fetched?.path === path ? fetched.next : data?.next;
  const me = session?.user.id;
  async function refresh() {
    setFetched(undefined);
    await load();
  }
  const card = (item: Item) => favorites && item.chatRecordId ? (
    <ChatFavorite key={item.id} preview={item.chatPreview} fallback={item.title}
      open={() => router.push({ pathname: '/life/chat-record/[id]', params: { id: item.chatRecordId!, favorite: '1' } })}
      options={() => setChatActions(item)} />
  ) : (
    <ItemCard
      key={item.id}
      item={item}
      personalCollection={favorites}
      me={me || ''}
      checklist={together && space && kind==='saved' ? (action,extra)=>void run(async()=>{
        await request('/p2/items/'+item.id+'/checklist',{method:'POST',body:{action,...extra}});await refresh();
      },false) : undefined}
      open={() => setExpanded(item)}
      edit={() => setEditor(item)}
      remove={() => setRemoving(item)}
    />
  );
  return (
    <>
      {favorites ? <>
        <FavoriteSegments label="收藏与推荐" labels={tabs} value={tab} change={setTab} swipe />
        <FavoriteSegments label="收藏分类" labels={collectionLabels} value={collection} change={setCollection} />
      </> : <>
        {!space && <Choices labels={mapTabs} value={tab} set={setTab} />}
        <Choices labels={{ all: '全部', ...categories }} value={category ?? 'all'}
          set={(value) => setCategory(value === 'all' ? undefined : value)} />
      </>}
      {!itemId && (tab === 'mine' || space) && (!favorites || collection !== 'chat') && (
        <Button
          label={kind === 'place' ? '收藏地点' : '添加收藏'}
          variant="gradient"
          icon="add"
          onPress={() => setEditor('new')}
        />
      )}
      {itemId && <LinkedItem id={itemId} />}
      {!!error && (
        <Notice action="重试" onAction={() => void refresh()}>
          {error}
        </Notice>
      )}
      {!!notice && <Notice>{notice}</Notice>}
      {kind === 'place' && !!entries.length && <PlacePlot items={entries} select={setExpanded} />}
      {kind === 'place' && tab === 'mine' && !space && <Resonance />}
      {favorites ? <Animated.View key={path} entering={FadeIn.duration(160).reduceMotion(ReduceMotion.System)} style={{ gap: 8 }}>
        {includeLegacy && !!legacy.error && <Notice>{legacy.error}</Notice>}
        {legacyPlaces.map((place) => <PlaceCard key={place.id} place={place} compact />)}
        {!itemId && entries.map(card)}
        {!itemId && !entries.length && !legacyPlaces.length && !error && (
          <DataEmpty loading={!data || includeLegacy && !legacy.saved && !legacy.error}>
            {collection === 'chat' ? tab === 'mine' ? '在聊天中收藏的消息会出现在这里。' : '聊天记录收藏仅自己可见。'
              : '这里还没有可查看的收藏。'}
          </DataEmpty>
        )}
      </Animated.View> : <>
        {!itemId && !entries.length && !error && <DataEmpty loading={!data}>
          {kind === 'place' ? '这里还没有可查看的地点。' : '这里还没有可查看的收藏。'}
        </DataEmpty>}
        {!itemId && entries.map(card)}
      </>}
      {!itemId && next !== undefined && next !== null && (
        <Button
          label="查看更多"
          variant="soft"
          disabled={busy}
          onPress={() =>
            void run(async () => {
              const page = await request<ItemPage>(path + '&offset=' + next);
              setFetched({
                path,
                rows: [...(fetched?.path === path ? fetched.rows : []), ...page.items],
                next: page.next,
              });
            }, false)
          }
        />
      )}
      {editor && (
        <ItemEditor
          kind={kind}
          initial={editor === 'new' ? undefined : editor}
          space={space}
          defaultCategory={favorites && collection !== 'chat' ? collection : undefined}
          onClose={() => {
            setEditor(undefined);
            void refresh();
          }}
        />
      )}
      {expanded && (
        <Sheet title={expanded.title} onClose={() => setExpanded(undefined)}>
          <ItemInformation item={expanded} personalCollection={favorites} />
          {expanded.ownerId !== me && (
            <Button
              label="加入我的收藏"
              variant="gradient"
              disabled={busy}
              onPress={() => {
                const client = copying?.id === expanded.id ? copying.clientId : randomUUID();
                setCopying({ id: expanded.id, clientId: client });
                void run(async () => {
                  await request('/p2/items/' + expanded.id + '/copy', {
                    method: 'POST',
                    body: { clientId: client },
                  });
                  setExpanded(undefined);
                  setNotice(kind === 'place' ? '已添加到我的地点。' : '已添加到我的收藏。');
                }, false);
              }}
            />
          )}
          {expanded.chatRecordId && <Button label="查看聊天记录" icon="reader-outline" variant="soft" onPress={() => {
            setExpanded(undefined);
            router.push({ pathname: '/life/chat-record/[id]', params: { id: expanded.chatRecordId! } });
          }} />}
          {!expanded.chatRecordId && <Button
            label="从这里发起约局"
            variant="soft"
            onPress={() => {
              setExpanded(undefined);
              router.push({
                pathname: '/gathering/new',
                params: {
                  title: together ? '' : expanded.title,
                  ...(together ? {source:expanded.id} : {place:addressOf(expanded) || expanded.title}),
                  category:
                    expanded.category === 'food'
                      ? 'food'
                      : expanded.category === 'film'
                        ? 'film'
                        : expanded.category === 'travel'
                          ? 'travel'
                          : 'other',
                },
              });
            }}
          />}
          {kind === 'place' && (
            <Button
              label="从地点记录新心愿"
              variant="quiet"
              onPress={() => {
                setExpanded(undefined);
                router.push({
                  pathname: '/social',
                  params: {
                    section: 'wishes',
                    wishTitle: expanded.title,
                    wishPlace: addressOf(expanded) || expanded.title,
                  },
                });
              }}
            />
          )}
          {expanded.tripId && (
            <Button
              label="查看关联旅行"
              variant="quiet"
              onPress={() =>
                router.push({
                  pathname: '/life/project/[id]',
                  params: { id: expanded.tripId!, kind: 'trip' },
                })
              }
            />
          )}
          {expanded.memoryId && (
            <Button
              label="查看关联回忆"
              variant="quiet"
              onPress={() => router.push({ pathname: '/life/memories', params: { id: expanded.memoryId! } })}
            />
          )}
          {!!error && <Notice>{error}</Notice>}
        </Sheet>
      )}
      {chatActions && <Sheet title="收藏选项" onClose={() => setChatActions(undefined)}>
        <Button label="编辑收藏" variant="soft" onPress={() => {
          setEditor(chatActions);
          setChatActions(undefined);
        }} />
        <Button label="删除收藏" variant="danger" onPress={() => {
          setRemoving(chatActions);
          setChatActions(undefined);
        }} />
      </Sheet>}
      {removing && (
        <Sheet title="删除这条记录" onClose={() => setRemoving(undefined)}>
          <Text style={styles.muted}>已分享的读者将失去原记录和附件权限。</Text>
          {!!error && <Notice>{error}</Notice>}
          <Button
            label="确认删除"
            variant="danger"
            disabled={busy}
            onPress={() =>
              void run(async () => {
                await request('/p2/items/' + removing.id, { method: 'DELETE' });
                setRemoving(undefined);
                await refresh();
              }, false)
            }
          />
        </Sheet>
      )}
    </>
  );
}

function ItemCard({
  item,
  personalCollection,
  me,
  open,
  edit,
  remove,checklist,
}: {
  checklist?:(action:string,extra:Record<string,unknown>)=>void;
  item: Item;
  personalCollection: boolean;
  me: string;
  open: () => void;
  edit: () => void;
  remove: () => void;
}) {
  const [amount,setAmount]=useState(String(item.quantity??1));
  const address = addressOf(item);
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Icon name={item.kind === 'place' ? (item.latitude == null ? 'bookmark-outline' : 'location-outline') : 'bookmark-outline'}
          color={colors.accent} size={21} />
        <Section title={item.title} detail={item.chatRecordId ? '聊天记录 · 仅自己' : (personalCollection ? savedCategoryLabels[collectionOf(item.category)] : categories[item.category]) + ' · ' + marks[item.state]} />
      </View>
      {item.ownerId !== me && <Text style={styles.small}>{item.author} 分享</Text>}
      {!!address && <Text style={styles.muted}>{address}</Text>}
      {!!item.notes && <Text style={styles.body}>{item.notes}</Text>}
      {checklist && <>
        <Button label={item.state==='done'?'已完成 · 撤销':'勾选完成'} variant="soft" onPress={()=>checklist('check',{done:item.state!=='done'})}/>
        <Button label={item.claimedByMe?'撤回我的认领':item.claimed?'已有成员认领':'我来带'} disabled={item.claimed && !item.claimedByMe}
          variant="quiet" onPress={()=>checklist('claim',{enabled:!item.claimedByMe})}/>
        {me===item.ownerId ? <><Field title="数量" value={amount} onChangeText={setAmount} keyboardType="number-pad"/>
          {amount!==String(item.quantity??1) && <Button label="保存数量" onPress={()=>checklist('quantity',{quantity:Number(amount)})}/>}</> :
          !!item.quantity && <Text style={styles.muted}>数量 · {item.quantity}</Text>}
      </>}
      <MediaStrip media={item.media} />
      {!!item.tags.length && <Text style={styles.small}>{item.tags.map((tag) => '#' + tag).join('  ')}</Text>}
      <View style={[styles.row, { flexWrap: 'wrap' }]}>
        <Button label="查看与使用" variant="soft" onPress={open} />
        {item.ownerId === me && (
          <>
            <Button label="编辑" variant="quiet" onPress={edit} />
            <Button label="删除" variant="quiet" onPress={remove} />
          </>
        )}
      </View>
    </View>
  );
}
function ItemInformation({ item, personalCollection = false }: { item: Item; personalCollection?: boolean }) {
  const [notice, setNotice] = useState('');
  const address = addressOf(item);
  return (
    <>
      <Text style={styles.muted}>
        {item.chatRecordId ? '聊天记录 · 仅自己' : [personalCollection ? savedCategoryLabels[collectionOf(item.category)] : categories[item.category], marks[item.state], item.author].filter(Boolean).join(' · ')}
      </Text>
      {!!item.notes && <Text style={styles.body}>{item.notes}</Text>}
      {!!address && <Text style={styles.muted}>{address}</Text>}
      {item.kind === 'place' && item.latitude !== null && item.longitude !== null && (
        <LocationBubble
          value={{
            latitude: item.latitude,
            longitude: item.longitude,
            name: item.title,
            address,
          }}
        />
      )}
      <MediaStrip media={item.media} />
      {item.sourceUrl && (
        <Button
          label="打开用户保存的链接"
          icon="open-outline"
          variant="soft"
          onPress={() => void Linking.openURL(item.sourceUrl!).catch(() => setNotice('当前无法打开链接。'))}
        />
      )}
      {!!notice && <Notice>{notice}</Notice>}
    </>
  );
}
function LinkedItem({ id }: { id: string }) {
  const { data, error } = useRecord<{ item: Item }>('/p2/items/' + id);
  return data ? (
    <ItemInformation item={data.item} />
  ) : error ? (
    <Notice>{error}</Notice>
  ) : (
    <DataEmpty loading>正在读取收藏。</DataEmpty>
  );
}
function PlacePlot({ items, select }: { items: Item[]; select: (item: Item) => void }) {
  const points = items.filter((item) => item.latitude !== null && item.longitude !== null);
  if (!points.length) return null;
  const xs = points.map((p) => p.longitude!),
    ys = points.map((p) => p.latitude!);
  const xmin = Math.min(...xs),
    xmax = Math.max(...xs),
    ymin = Math.min(...ys),
    ymax = Math.max(...ys);
  const project = (n: number, min: number, max: number) =>
    min === max ? 50 : 10 + ((n - min) / (max - min)) * 80;
  const pinColors = { want: '#AE3E63', visited: '#1B7767', done: '#6653A4', recommended: '#98602A' };
  return (
    <View style={styles.card}>
      <Section title="地点示意图" />
      <Text style={styles.small}>按已授权点位的经纬度绘制。点按标记查看地点。</Text>
      <View style={{ height: 205, backgroundColor: colors.ice, borderRadius: radius.control, overflow: 'hidden' }}>
        <View
          style={{
            position: 'absolute',
            top: '50%',
            left: 0,
            right: 0,
            borderTopWidth: 1,
            borderColor: colors.border,
          }}
        />
        <View
          style={{
            position: 'absolute',
            left: '50%',
            top: 0,
            bottom: 0,
            borderLeftWidth: 1,
            borderColor: colors.border,
          }}
        />
        {points.map((point, index) => (
          <Pressable
            key={point.id}
            accessibilityRole="button"
            accessibilityLabel={point.title + '，' + marks[point.state]}
            onPress={() => select(point)}
            style={{
              position: 'absolute',
              top: 100 - project(point.latitude!, ymin, ymax) + '%',
              left: project(point.longitude!, xmin, xmax) + '%',
              transform: [{ translateX: -touch / 2 }, { translateY: -touch / 2 }],
              width: touch,
              height: touch,
              borderRadius: radius.pill,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: pinColors[point.state],
              borderWidth: 2,
              borderColor: colors.panel,
            }}
          >
            <Text style={{ ...type.tag, color: fixed.onAction }}>{index + 1}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function Resonance() {
  const together = useTogether();
  const router = useTogetherRouter();
  const { data } = useRecord<{ matches: { id: string; title: string; friend: string; friendId: string }[] }>(
    '/p2/place-resonance',
  );
  return data?.matches.length ? (
    <View style={styles.card}>
      <Section title="你们都想去" />
      {data.matches.map((item) => (
        <ListRow
          key={item.id + item.friendId}
          title={item.title}
          detail={item.friend + '也想去'}
          onPress={() =>
            router.push({
              pathname: '/gathering/new',
              params: { ...(together ? {source:item.id} : {title:item.title,place:item.title}), friend:item.friendId,category:'travel' },
            })
          }
        />
      ))}
    </View>
  ) : null;
}

function ItemEditor({
  kind,
  initial,
  space,
  defaultCategory,
  onClose,
}: {
  kind: Kind;
  initial?: Item;
  space?: string;
  defaultCategory?: Exclude<Collection, 'chat'>;
  onClose: () => void;
}) {
  const { relationships } = useFriends();
  const { session } = useSession();
  const { request, error, busy, run } = useRecord('/p2/items?kind=' + kind);
  const { data: groups } = useRecord<{ groups: { id: string; label: string }[] }>('/relationship-groups');
  const { data: projects } = useRecord<{ spaces: (Project & { state: string })[] }>(
    '/p2/spaces?kind=' + (kind === 'place' ? 'map' : 'list'),
  );
  const { data: trips } = useRecord<{ spaces: (Project & { state: string })[] }>('/p2/spaces?kind=trip');
  const { data: wishes } = useRecord<{ wishes: { id: string; description: string }[] }>('/p1/wishes');
  const { data: memories } = useRecord<{ memories: { id: string; ownerId: string; title: string }[] }>(
    '/p2/memories',
  );
  const isPlace = kind === 'place';
  const [clientId] = useState(randomUUID);
  const [title, setTitle] = useState(initial?.title ?? '');
  const [category, setCategory] = useState<Category>(initial?.category ?? defaultCategory ?? 'other');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [city, setCity] = useState(initial?.city ?? '');
  const [location, setLocation] = useState(initial?.location ?? '');
  const [tags, setTags] = useState(initial?.tags.join('、') ?? '');
  const [link, setLink] = useState(initial?.sourceUrl ?? '');
  const [mark, setMark] = useState<keyof typeof marks>(initial?.state ?? 'want');
  const [scope, setScope] = useState<Scope>(initial?.scope ?? 'private');
  const [ids, setIds] = useState(initial?.memberIds ?? []);
  const [group, setGroup] = useState(initial?.groupId ?? '');
  const [project, setProject] = useState(space ?? initial?.spaceId ?? '');
  const [lat, setLat] = useState(initial?.latitude == null ? '' : String(initial.latitude));
  const [lon, setLon] = useState(initial?.longitude == null ? '' : String(initial.longitude));
  const [locating, setLocating] = useState(false);
  const [wish, setWish] = useState(initial?.wishId ?? '');
  const [trip, setTrip] = useState(initial?.tripId ?? '');
  const [memory, setMemory] = useState(initial?.memoryId ?? '');
  const [relations, setRelations] = useState(false);
  const [media, setMedia] = useState<Media[]>(initial?.media ?? []);
  const [drafts, setDrafts] = useState<LocalMedia[]>([]);
  if (locating)
    return (
      <LocationComposer
        online
        purpose="map"
        onClose={() => setLocating(false)}
        onConfirm={(value) => {
          setLat(String(value.latitude));
          setLon(String(value.longitude));
          if (!title) setTitle(value.name);
          if (value.address) setLocation(value.address);
          setLocating(false);
        }}
      />
    );
  const scopesHere = project
    ? scopes
    : initial?.chatRecordId ? { private: scopes.private } : { private: scopes.private, selected: scopes.selected, group: scopes.group };
  const latitude = lat.trim() ? Number(lat) : null;
  const longitude = lon.trim() ? Number(lon) : null;
  const coordinatesInvalid = isPlace && (latitude !== null || longitude !== null) && (
    latitude === null || longitude === null || !Number.isFinite(latitude) || !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 || Math.abs(longitude) > 180
  );
  return (
    <Sheet title={initial ? '编辑记录' : isPlace ? '收藏地点' : '添加收藏'} onClose={onClose}>
      <Field title={isPlace ? '地点名称' : '名称'} value={title} onChangeText={setTitle} />
      {initial?.chatRecordId ? <Text style={styles.muted}>聊天记录 · 仅自己</Text>
        : kind === 'saved' && !space
        ? <Choices labels={savedCategoryLabels} value={collectionOf(category)} set={setCategory} />
        : <Choices labels={categories} value={category} set={setCategory} />}
      <Choices
        labels={
          isPlace ? marks : { want: '想体验', visited: '已体验', done: '已完成', recommended: '推荐给朋友' }
        }
        value={mark}
        set={setMark}
      />
      {isPlace && <Field title="城市（选填）" value={city} onChangeText={setCity} />}
      <Field title={isPlace ? '地址（选填）' : '地点或地址（选填）'} value={location} onChangeText={setLocation} />
      {isPlace && (
        <>
          <Text style={styles.muted}>只填写名称即可收藏。填写一对 WGS‑84 经纬度后，地点也会显示在示意图上。</Text>
          <View style={styles.row}>
            <View style={styles.grow}>
              <Field title="纬度（选填）" value={lat} onChangeText={setLat} keyboardType="numbers-and-punctuation" />
            </View>
            <View style={styles.grow}>
              <Field title="经度（选填）" value={lon} onChangeText={setLon} keyboardType="numbers-and-punctuation" />
            </View>
          </View>
          <Button
            label="从当前位置填写"
            variant="quiet"
            icon="locate-outline"
            onPress={() => setLocating(true)}
          />
          {coordinatesInvalid && <Notice>请同时填写有效的纬度和经度，或将两项留空。</Notice>}
        </>
      )}
      <Field title="备注或推荐理由（选填）" multiline value={notes} onChangeText={setNotes} />
      <Field title="标签（用顿号分开，选填）" value={tags} onChangeText={setTags} />
      <Field title="网页链接（选填）" value={link} keyboardType="url" onChangeText={setLink} />
      <AssetPicker drafts={drafts} change={setDrafts} limit={1} existing={media} updateExisting={setMedia} />
      {!space && !!projects?.spaces.some((p) => p.state === 'active') && (
        <>
          <Section title={isPlace ? '归入共同地图' : '归入共同清单'} />
          <Button
            label="个人记录"
            variant={!project ? 'primary' : 'soft'}
            onPress={() => {
              setProject('');
              if (scope === 'space') setScope('private');
            }}
          />
          {projects.spaces
            .filter((p) => p.state === 'active')
            .map((p) => (
              <Button
                key={p.id}
                label={p.title}
                variant={project === p.id ? 'primary' : 'soft'}
                onPress={() => setProject(p.id)}
              />
            ))}
        </>
      )}
      <Section title="谁可以看" />
      <Choices labels={scopesHere as Record<Scope, string>} value={scope} set={setScope} />
      {scope === 'selected' && (
        <MemberChoices
          friends={relationships?.filter((p) => p.status === 'accepted') ?? []}
          ids={ids}
          update={setIds}
        />
      )}
      {scope === 'group' &&
        groups?.groups.map((p) => (
          <Button
            key={p.id}
            label={p.label}
            variant={group === p.id ? 'primary' : 'soft'}
            onPress={() => setGroup(p.id)}
          />
        ))}
      {isPlace && (
        <>
          <Button
            label="关联心愿、旅行或回忆（选填）"
            variant="quiet"
            onPress={() => setRelations(!relations)}
          />
          {relations && (
            <>
              {wishes?.wishes.map((p) => (
                <Button
                  key={p.id}
                  label={p.description}
                  variant={wish === p.id ? 'primary' : 'soft'}
                  onPress={() => setWish(wish === p.id ? '' : p.id)}
                />
              ))}
              {trips?.spaces
                .filter((p) => p.state === 'active')
                .map((p) => (
                  <Button
                    key={p.id}
                    label={p.title}
                    variant={trip === p.id ? 'primary' : 'soft'}
                    onPress={() => setTrip(trip === p.id ? '' : p.id)}
                  />
                ))}
              {memories?.memories
                .filter((p) => p.ownerId === session?.user.id)
                .map((p) => (
                  <Button
                    key={p.id}
                    label={p.title}
                    variant={memory === p.id ? 'primary' : 'soft'}
                    onPress={() => setMemory(memory === p.id ? '' : p.id)}
                  />
                ))}
            </>
          )}
        </>
      )}
      {!!error && <Notice>{error}</Notice>}
      <Button
        label="保存"
        variant="gradient"
        disabled={
          busy ||
          !title.trim() ||
          coordinatesInvalid ||
          (scope === 'selected' && !ids.length) ||
          (scope === 'group' && !group)
        }
        onPress={() =>
          void run(async () => {
            const mediaIds = await uploadAssets(request, media, drafts);
            await request('/p2/items' + (initial ? '/' + initial.id : ''), {
              method: initial ? 'PATCH' : 'POST',
              body: {
                kind,
                clientId,
                title,
                category,
                notes,
                city: isPlace ? city : undefined,
                location,
                tags: tags
                  .split(/[、，,]/)
                  .map((tag) => tag.trim())
                  .filter(Boolean),
                sourceUrl: link,
                state: mark,
                scope,
                memberIds: ids,
                groupId: group || undefined,
                mediaIds,
                spaceId: project || undefined,
                latitude: isPlace ? latitude : undefined,
                longitude: isPlace ? longitude : undefined,
                wishId: wish || undefined,
                tripId: trip || undefined,
                memoryId: memory || undefined,
                revision: initial?.revision,
              },
            });
            onClose();
          }, false)
        }
      />
    </Sheet>
  );
}
