import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Avatar, Button, Empty, Icon, IconButton, Notice, Screen, Section, Sheet } from '../../components/ui';
import { demoPortrait } from '../../demo/visuals';
import { OrbFace, PetOrb, type Expression } from '../../features/pet/Orb';
import { confirmName, emptyPet, feedPet, foods, petMood, proposeName, type Food, type Pet } from '../../features/pet/model';
import { usePets } from '../../features/pet/store';
import { createdTime } from '../../features/space/model';
import { useFriends } from '../../services/friends';
import { useSession } from '../../services/session';
import { brandGradient, colors, styles, type } from '../../theme';

const newborn = emptyPet();

export default function PetScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { relationships } = useFriends();
  const { session, demoAvatarKey } = useSession();
  const state = usePets();
  const friend = relationships?.find((item) => item.userId === id && item.status === 'accepted');
  const pet = state.value?.[id] ?? newborn;
  const [sheet, setSheet] = useState<'name' | 'rules' | 'confirm' | 'faces'>();
  const [name, setName] = useState('');
  const [selected, setSelected] = useState<Food>();
  const [feedback, setFeedback] = useState('');
  const [fed, setFed] = useState(0);

  function startNaming() {
    setName(pet.proposal?.name ?? pet.name ?? '');
    setSheet('name');
  }
  function submitName() {
    state.mutate(id, (item) => proposeName(item, name, Date.now()));
    setSheet(undefined);
  }
  function feed() {
    if (!selected || selected.cost > pet.energy) return;
    state.mutate(id, (item) => feedPet(item, selected, Date.now()));
    setFeedback('已投喂 ' + selected.name);
    setFed((count) => count + 1);
    setSelected(undefined);
  }

  return <Screen title="共同小宠物" back={() => router.canGoBack() ? router.back() : router.replace('/')}
    actions={<IconButton label="小宠物规则" icon="information-circle-outline" onPress={() => setSheet('rules')} />}>
    {state.error && <Notice action="重试" onAction={state.retry}>{state.error}</Notice>}
    {state.value && friend && session ? <>
      <View style={local.hero}>
        <LinearGradient colors={['#F4E7F0', '#E0F6F3']} style={local.art}>
          <PetOrb vitality={pet.vitality} fed={fed} />
        </LinearGradient>
        <View style={local.heroCaption}>
          <View style={styles.grow}>
            <Text accessibilityRole="header" style={local.name}>{pet.name ?? '等你们一起起名'}</Text>
            <Text style={styles.muted}>{pet.name ? petMood(pet) : '给这段友谊养一个小陪伴。'}</Text>
          </View>
          <View style={local.partners}>
            <Avatar userId={session.user.id} name={session.user.name} source={demoPortrait(demoAvatarKey ?? session.user.username)} size={32} />
            <View style={local.second}><Avatar name={friend.name} source={demoPortrait(friend.username)} size={32} /></View>
          </View>
        </View>
      </View>
      <Text style={styles.small}>你和 {friend.name} 一起养 · 本机演示</Text>
      {pet.proposal && <View style={styles.card}>
        <Section title={pet.name ? '改名提议' : '命名提议'} />
        <Text style={styles.body}>「{pet.proposal.name}」等待 {friend.name} 确认。</Text>
        <View style={local.inline}>
          <Button label="模拟好友确认" variant="gradient" onPress={() => setSheet('confirm')} />
          <Button label="撤回提议" variant="quiet" onPress={() => state.mutate(id, (item) => ({ ...item, proposal: undefined }))} />
        </View>
      </View>}
      {!pet.name ? <View style={styles.card}>
        <Section title="先给它取个名字" />
        <Text style={styles.muted}>一人提出名字，另一人确认。一来一回的聊天会给它攒下能量，什么时候回来都可以。</Text>
        {!pet.proposal && <Button label="提议名字" icon="create-outline" variant="gradient" onPress={startNaming} />}
      </View> : <>
        <View style={local.stats}>
          <View style={local.vital}>
            <Text style={styles.small}>活力</Text>
            <Text style={local.value}>{pet.vitality}<Text style={styles.small}> / 100</Text></Text>
            <View style={local.track}>
              <LinearGradient colors={brandGradient} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }}
                style={[local.progress, { width: `${pet.vitality}%` }]} />
            </View>
          </View>
          <View style={local.energy}>
            <Text style={styles.small}>聊天能量</Text>
            <Text style={local.value}>{pet.energy}</Text>
          </View>
        </View>
        <View style={local.activity}>
          <Icon name="time-outline" size={18} color={colors.accent} />
          <Text style={[styles.muted, styles.grow]}>{eventText(pet)}</Text>
          {!pet.proposal && <Button label="提议改名" variant="quiet" onPress={startNaming} />}
        </View>
        <Section title="投喂" detail="用聊天攒下的能量" />
        <View style={local.foods}>{foods.map((food) => <Pressable key={food.id} accessibilityRole="button" accessibilityLabel={food.name}
          accessibilityState={{ selected: selected?.id === food.id }}
          onPress={() => { setSelected(food); setFeedback(''); }}
          style={({ pressed }) => [local.food, selected?.id === food.id && local.foodSelected, pressed && local.pressed]}>
          <Text style={local.emoji}>{food.emoji}</Text>
          <Text style={styles.strong}>{food.name}</Text>
          <Text style={styles.small}>{food.cost} 能量</Text>
        </Pressable>)}</View>
        {!!feedback && <Notice>{feedback}</Notice>}
        {selected && <Button label={selected.cost > pet.energy ? '聊天能量还不够' : '投喂 ' + selected.name}
          variant="gradient" disabled={selected.cost > pet.energy} onPress={feed} />}
        <View style={local.demoActions}>
          <Text style={styles.small}>演示里先在聊天发一句话，再模拟好友回复，可以看到能量变化。</Text>
          <Button label="模拟好友回复" variant="soft" disabled={pet.waiting?.side !== 'mine'}
            onPress={() => state.simulateResponse?.(id, '收到啦，回头见面再接着聊 🌿')} />
          <Button label="回到双人聊天" variant="quiet" icon="chatbubble-outline" onPress={() => {
            if (router.canGoBack()) router.back();
            else router.replace({ pathname: '/chat/[id]', params: { id } });
          }} />
        </View>
      </>}
    </> : <Empty busy={state.loading || !relationships} icon="heart-outline">
      {state.loading || !relationships ? '正在读取共同宠物…' : '只有已添加的好友可以一起养宠物。'}
    </Empty>}
    {sheet === 'rules' && <Sheet title="一起养的小规则" onClose={() => setSheet(undefined)}>
      <Text style={styles.strong}>想起它时，就来看看。</Text>
      <Text style={styles.body}>活力会保留。聊天隔了几天，回来还是原来的它。</Text>
      <Text style={styles.body}>双方有来有回可攒 4 点能量。重复内容不计，同一对好友两分钟内最多计一轮，每 24 小时最多计四轮。能量最多存 99 点。</Text>
      <Text style={styles.body}>取名和改名都需要另一位好友确认。演示里的另一位由本机模拟。</Text>
      <Button label="查看表情" variant="soft" onPress={() => setSheet('faces')} />
    </Sheet>}
    {sheet === 'faces' && <Sheet title="小宠物的表情" onClose={() => setSheet(undefined)}>
      <View style={local.foods}>
        {([['calm', '平静'], ['curious', '好奇'], ['resting', '困倦'], ['happy', '开心'],
          ['surprised', '惊喜'], ['blink', '眨眼']] as [Expression, string][]).map(([face, label]) => (
          <View key={face} style={local.faceTile}>
            <OrbFace size={60} expression={face} />
            <Text style={styles.small}>{label}</Text>
          </View>
        ))}
      </View>
    </Sheet>}
    {sheet === 'name' && <Sheet title={pet.name ? '提议改名' : '提议名字'} onClose={() => setSheet(undefined)}>
      <Text style={styles.muted}>{friend?.name} 确认后，新名字才会生效。</Text>
      <TextInput accessibilityLabel="宠物名字" style={styles.input} value={name} onChangeText={setName}
        placeholder="一起想个名字" placeholderTextColor={colors.quiet} maxLength={32} />
      <Button label="提出名字" variant="gradient"
        disabled={!name.trim() || Array.from(name.trim()).length > 16 || name.trim() === pet.name || name.trim() === pet.proposal?.name}
        onPress={submitName} />
    </Sheet>}
    {sheet === 'confirm' && pet.proposal && <Sheet title="模拟好友确认" onClose={() => setSheet(undefined)}>
      <Text style={styles.body}>以 {friend?.name} 的演示身份确认「{pet.proposal.name}」。</Text>
      <Button label="确认名字" variant="gradient" onPress={() => {
        state.mutate(id, (item) => confirmName(item, Date.now(), true));
        setSheet(undefined);
      }} />
    </Sheet>}
  </Screen>;
}

function eventText(pet: Pet) {
  if (!pet.last) return '等下一次相聚';
  const activity = pet.last.kind === 'named' ? '确认了名字' : pet.last.kind === 'food' ? '吃到' + pet.last.label : '有一轮聊天陪伴';
  return createdTime(pet.last.at) + ' · ' + activity;
}

const local = StyleSheet.create({
  hero: { borderRadius: 15, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  art: { height: 221, overflow: 'hidden' },
  heroCaption: { ...styles.row, paddingHorizontal: 14, paddingVertical: 10 },
  name: { ...type.title, color: colors.text },
  partners: { flexDirection: 'row', alignItems: 'center' },
  second: { marginLeft: -7, borderWidth: 2, borderColor: colors.panel, borderRadius: 12 },
  inline: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  stats: { flexDirection: 'row', gap: 9 },
  vital: { ...styles.card, flex: 1, padding: 10, gap: 4 },
  energy: { ...styles.card, width: 110, padding: 10, gap: 4, backgroundColor: colors.pink },
  value: { ...type.metric, color: colors.ink },
  track: { height: 6, borderRadius: 4, backgroundColor: colors.lavender, overflow: 'hidden' },
  progress: { height: '100%', borderRadius: 4 },
  activity: { ...styles.row, gap: 5 },
  foods: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  food: { width: '31.7%', borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel,
    minHeight: 78, alignItems: 'center', justifyContent: 'center', paddingVertical: 7 },
  faceTile: { width: '31.7%', borderRadius: 12, backgroundColor: colors.backdrop, alignItems: 'center', paddingVertical: 9, gap: 6 },
  foodSelected: { backgroundColor: colors.pink, borderColor: '#DA9CB0' },
  emoji: { fontSize: 20, marginBottom: 1 },
  pressed: { opacity: 0.67 },
  demoActions: { ...styles.card, gap: 9 },
});
