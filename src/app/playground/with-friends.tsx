import { useTogetherRouter } from '../../features/together/navigation';
import { useState } from 'react';

import { Button, Icon, ListRow, Screen, Section, Segments, SettingGroup } from '../../features/together/ui';
import { Chips, GameCard } from '../../features/play/Cards';
import { InviteButton } from '../../features/play/Gather';
import { gameModes, games } from '../../features/play/games';

type Panel = 'activities' | 'games';

export default function WithFriendsScreen() {
  const router = useTogetherRouter();
  const [panel, setPanel] = useState<Panel>('activities');
  const [mode, setMode] = useState<typeof gameModes[number]>('全部');
  const playable = games.filter((game) => mode === '全部' || game.mode === mode);
  return <Screen title="约朋友一起玩" back={() => router.canGoBack() ? router.back() : router.replace('/life')}>
    <Segments<Panel> label="约朋友一起玩" value={panel} onChange={setPanel}
      options={[{ id: 'activities', label: '活动' }, { id: 'games', label: '小游戏' }]} />
    {panel === 'activities' ? <>
      <Button label="发起约局" icon="calendar-outline" variant="gradient" onPress={() => router.push('/gathering/new')} />
      <SettingGroup>
        <ListRow title="心愿共振" left={<Icon name="heart-outline" />} onPress={() => router.push('/social')} />
        <ListRow title="一键约局" left={<Icon name="calendar-outline" />}
          onPress={() => router.push({ pathname: '/social', params: { section: 'gatherings' } })} />
        <ListRow title="邀请与消息" left={<Icon name="mail-outline" />} separator={false}
          onPress={() => router.push({ pathname: '/social', params: { section: 'events' } })} />
      </SettingGroup>
    </> : <>
      <Section title="本机小游戏" />
      <Chips items={gameModes} value={mode} onChange={setMode} />
      {playable.map((game, index) => <GameCard key={game.id} game={game} featured={index === 0} />)}
      <InviteButton message="下次见面来玩一局？我们可以在同一部手机上轮流出招。" />
    </>}
  </Screen>;
}
