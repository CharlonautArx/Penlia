import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button, Screen } from '../../components/ui';
import { colors, styles } from '../../theme';

const prompts = [
  '最近哪件小事让你心情变好了？',
  '如果今天多出一小时，你会怎么用？',
  '哪一种味道会让你想起小时候？',
  '想和朋友一起重走哪一段路？',
  '最近哪一首歌值得分享？',
];

const moves = ['石头', '剪刀', '布'] as const;
type Move = (typeof moves)[number];

export default function PlayScreen() {
  const [promptIndex, setPromptIndex] = useState<number | null>(null);
  const [round, setRound] = useState<{ mine: Move; opponent: Move; result: string } | null>(null);
  const [wins, setWins] = useState(0);

  function draw() {
    if (promptIndex === null) {
      setPromptIndex(Math.floor(Math.random() * prompts.length));
      return;
    }
    const offset = 1 + Math.floor(Math.random() * (prompts.length - 1));
    setPromptIndex((promptIndex + offset) % prompts.length);
  }

  function play(index: number) {
    const opponent = Math.floor(Math.random() * moves.length);
    const won = (opponent - index + moves.length) % moves.length === 1;
    const result = opponent === index ? '平局' : won ? '你赢了' : '电脑赢了';
    setRound({ mine: moves[index], opponent: moves[opponent], result });
    if (won) setWins((count) => count + 1);
  }

  return (
    <Screen title="玩乐" subtitle="抽个话题，或者和电脑玩一局。">
      <View style={local.prompt}>
        <View style={styles.row}>
          <Ionicons name="sparkles-outline" size={23} color={colors.green} />
          <Text accessibilityRole="header" style={styles.section}>聊天话题卡</Text>
        </View>
        <Text accessibilityLiveRegion="polite" style={local.question}>
          {promptIndex === null ? '想找个轻松的话题？' : prompts[promptIndex]}
        </Text>
        <View style={local.actions}>
          <Button label={promptIndex === null ? '抽一张' : '换一张'} onPress={draw} icon="shuffle" />
        </View>
      </View>
      <View style={styles.card}>
        <View style={styles.row}>
          <Ionicons name="game-controller-outline" size={23} color={colors.green} />
          <Text accessibilityRole="header" style={[styles.section, styles.grow]}>石头剪刀布</Text>
          <Text style={styles.small}>胜场 {wins}</Text>
        </View>
        <Text accessibilityLiveRegion="polite" style={styles.body}>
          {round ? `你出${round.mine}，电脑出${round.opponent}。${round.result}！` : '选择一个手势开始。'}
        </Text>
        <View style={local.actions}>
          {moves.map((move, index) => (
            <Button key={move} label={move} variant="soft" onPress={() => play(index)} />
          ))}
        </View>
      </View>
    </Screen>
  );
}

const local = StyleSheet.create({
  prompt: { ...styles.card, backgroundColor: colors.sage, padding: 20 },
  question: { color: colors.deep, fontSize: 23, fontWeight: '700', lineHeight: 33 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
