import { router, useLocalSearchParams } from 'expo-router';
import { Image, StyleSheet, Text, View } from 'react-native';

import { Empty, Screen, Section } from '../../../components/ui';
import { HandGame, PromptGame, ReflexGame } from '../../../features/play/Experiences';
import { InviteButton } from '../../../features/play/Gather';
import { getGame } from '../../../features/play/games';
import { colors, styles } from '../../../theme';

export default function GameScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const game = getGame(id);
  return <Screen title={game?.title ?? '小游戏'} back={() => router.canGoBack() ? router.back() : router.replace('/play')}>
    {game ? <>
      <Image source={game.image} style={local.image} />
      <View style={local.info}>
        <Text style={local.players}>{game.players}</Text>
        <Text style={styles.body}>{game.note}</Text>
      </View>
      {game.id === 'hands' && <HandGame />}
      {game.id === 'reflex' && <ReflexGame />}
      {game.id === 'prompts' && <PromptGame />}
      <View style={local.invite}>
        <Section title="下次和朋友一起玩" />
        <InviteButton message={`下次见面一起玩「${game.title}」？`} />
      </View>
    </> : <Empty>找不到这个小游戏。</Empty>}
  </Screen>;
}

const local = StyleSheet.create({
  image: { width: '100%', height: 143, borderRadius: 14, resizeMode: 'cover', backgroundColor: colors.lavender },
  players: { color: colors.accent, fontSize: 12, lineHeight: 17, fontWeight: '700' },
  info: { gap: 3 },
  invite: { ...styles.card, gap: 8 },
});
