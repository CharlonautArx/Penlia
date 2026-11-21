import { GlassLayer } from '../../components/material';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Icon, type IconName } from '../../components/ui';
import { colors, styles, type } from '../../theme';

const moves = [
  { label: '石头', icon: 'ellipse-outline' },
  { label: '剪刀', icon: 'cut-outline' },
  { label: '布', icon: 'hand-left-outline' },
] as const;

type Round = { first: number; second: number; winner: 0 | 1 | 2 };

export function HandGame() {
  const [mode, setMode] = useState<'cpu' | 'together'>('cpu');
  const [score, setScore] = useState([0, 0]);
  const [round, setRound] = useState<Round>();
  const [secret, setSecret] = useState<number>();
  const [passed, setPassed] = useState(false);
  const opponent = mode === 'cpu' ? '电脑' : '玩家 2';
  const firstPlayer = mode === 'cpu' ? '你' : '玩家 1';
  const finished = score.some((count) => count >= 2);

  function reset() {
    setScore([0, 0]);
    setRound(undefined);
    setSecret(undefined);
    setPassed(false);
  }

  function resolve(first: number, second: number) {
    const winner = first === second ? 0 : (second - first + moves.length) % moves.length === 1 ? 1 : 2;
    setRound({ first, second, winner });
    if (winner) setScore(([left, right]) => [left + Number(winner === 1), right + Number(winner === 2)]);
    setSecret(undefined);
    setPassed(false);
  }

  function play(index: number) {
    if (round) return;
    if (mode === 'cpu') resolve(index, Math.floor(Math.random() * moves.length));
    else if (secret === undefined) setSecret(index);
    else if (passed) resolve(secret, index);
  }

  return <View style={game.body}>
    <View style={game.mode}>
      <Button label="电脑练习" variant={mode === 'cpu' ? 'primary' : 'soft'} onPress={() => { setMode('cpu'); reset(); }} />
      <Button label="双人同机" variant={mode === 'together' ? 'primary' : 'soft'} onPress={() => { setMode('together'); reset(); }} />
    </View>
    <View style={game.arena}>
      <View style={game.score}>
        <Text style={game.scoreLabel}>{firstPlayer}</Text>
        <Text style={game.number}>{score[0]}<Text style={game.scoreSep}> : </Text>{score[1]}</Text>
        <Text style={game.scoreLabel}>{opponent}</Text>
      </View>
      <Text accessibilityLiveRegion="polite" style={game.result}>
        {finished ? (score[0] === 2 ? firstPlayer : opponent) + '赢得了这一场'
          : round ? (round.winner === 0 ? '平局，比分不变' : (round.winner === 1 ? firstPlayer : opponent) + '赢下这一局')
            : mode === 'cpu' ? '选一个手势开始' : secret === undefined ? '请玩家 1 出招' : passed ? '请玩家 2 出招' : '把手机递给玩家 2'}
      </Text>
      {round && <Text style={game.round}>{firstPlayer}出{moves[round.first].label} · {opponent}出{moves[round.second].label}</Text>}
    </View>
    {round ? <Button label={finished ? '再玩一场' : '下一局'} variant="gradient" onPress={finished ? reset : () => setRound(undefined)} />
      : secret !== undefined && !passed
        ? <Button label="接过手机，继续" variant="gradient" onPress={() => setPassed(true)} />
        : <View style={game.moves}>
          {moves.map(({ label, icon }, index) => <Move key={label} label={label} icon={icon} onPress={() => play(index)} />)}
        </View>}
  </View>;
}

function Move({ label, icon, onPress }: { label: string; icon: IconName; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}
    style={({ pressed }) => [game.move, pressed && game.pressed]}>
    <Icon name={icon} size={27} color={colors.accent} /><Text style={styles.strong}>{label}</Text>
  </Pressable>;
}

const prompts = [
  '最近哪件小事让你心情变好了？',
  '如果今天多出一小时，你会怎么用？',
  '哪一种味道会让你想起小时候？',
  '想和朋友一起重走哪一段路？',
  '最近哪一首歌值得分享？',
  '你最想和在场哪位朋友交换一天的日程？为什么？',
];

export function PromptGame() {
  const [index, setIndex] = useState<number>();
  const [draws, setDraws] = useState(0);

  function draw() {
    setIndex((current) => current === undefined ? Math.floor(Math.random() * prompts.length)
      : (current + 1 + Math.floor(Math.random() * (prompts.length - 1))) % prompts.length);
    setDraws((count) => count + 1);
  }

  return <View style={game.body}>
    <View style={game.prompt}>
      <GlassLayer tone="feature" />
      <Icon name="chatbubble-ellipses-outline" size={27} color={colors.accent} />
      <Text accessibilityLiveRegion="polite" style={game.question}>{index === undefined ? '今天从哪句话开始？' : prompts[index]}</Text>
      <Text style={styles.small}>{draws ? `已抽 ${draws} 张 · 轮到下一位朋友回答` : '轮流抽卡，想答就答。'}</Text>
    </View>
    <Button label={index === undefined ? '抽一张' : '换一题'} icon="shuffle" variant="gradient" onPress={draw} />
  </View>;
}

type ReflexPhase = 'idle' | 'waiting' | 'now' | 'early' | 'done';

export function ReflexGame() {
  const [phase, setPhase] = useState<ReflexPhase>('idle');
  const [time, setTime] = useState(0);
  const [best, setBest] = useState<number>();
  const phaseRef = useRef<ReflexPhase>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const start = useRef(0);
  useEffect(() => () => clearTimeout(timer.current), []);

  function change(next: ReflexPhase) {
    phaseRef.current = next;
    setPhase(next);
  }

  function press() {
    switch (phaseRef.current) {
      case 'waiting':
        clearTimeout(timer.current);
        change('early');
        return;
      case 'now': {
        const elapsed = Math.max(1, Math.round(performance.now() - start.current));
        setTime(elapsed);
        setBest((value) => Math.min(elapsed, value ?? elapsed));
        change('done');
        return;
      }
      default:
        change('waiting');
        timer.current = setTimeout(() => {
          start.current = performance.now();
          change('now');
        }, 1300 + Math.random() * 1650);
    }
  }

  const label = phase === 'waiting' ? '等一下…' : phase === 'now' ? '现在按！' : phase === 'early' ? '按早了，点这里重试'
    : phase === 'done' ? time + ' ms · 再试一次' : '点这里开始';
  return <View style={game.body}>
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={press}
      style={({ pressed }) => [game.target, phase === 'now' ? game.active : phase === 'waiting' && game.waiting, pressed && game.pressed]}>
      <Icon name="flash-outline" size={32} color={colors.accent} />
      <Text accessibilityLiveRegion="polite" style={game.question}>{label}</Text>
    </Pressable>
    <Text style={styles.muted}>{best === undefined ? '本次最快成绩会显示在这里。' : '本次最快成绩　' + best + ' ms'}</Text>
  </View>;
}

const game = StyleSheet.create({
  body: { gap: 12 },
  mode: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  arena: { borderRadius: 15, backgroundColor: '#322537', padding: 17, gap: 9, alignItems: 'center' },
  score: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch', justifyContent: 'space-around', gap: 12 },
  scoreLabel: { ...type.control, color: '#E7D9ED', fontSize: 13 },
  number: { ...type.score, color: '#FFFFFF' },
  scoreSep: { color: '#D89AB3' },
  result: { ...type.emphasis, color: '#FFFFFF', textAlign: 'center' },
  round: { color: '#E7D9ED', fontSize: 13, lineHeight: 20 },
  moves: { flexDirection: 'row', gap: 8 },
  move: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 85, borderRadius: 13, gap: 8,
    backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border },
  pressed: { opacity: 0.68 },
  prompt: { borderRadius: 15, padding: 18, gap: 12 },
  question: { ...type.hero, color: colors.ink },
  target: { minHeight: 155, borderRadius: 15, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: colors.lavender, padding: 15 },
  waiting: { backgroundColor: colors.tint },
  active: { backgroundColor: '#AEFFF8' },
});
