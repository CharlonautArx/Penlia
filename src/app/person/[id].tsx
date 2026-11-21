import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { GlassLayer } from '../../components/material';
import { Avatar, Button, Empty, Icon, IconButton, ListRow, Notice, Screen, SettingGroup, Sheet } from '../../components/ui';
import { isUiDemo } from '../../demo/mode';
import { demoPortrait } from '../../demo/visuals';
import { errorMessage, type User } from '../../services/api';
import { StatusBlock,type LifeStatus } from '../life/status';
import { useRecord } from '../../features/social/ui';
import { useFriends } from '../../services/friends';
import { useSession } from '../../services/session';
import { colors, radius, space, styles, type } from '../../theme';

export default function PersonScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { request } = useSession();
  const { relationships, refresh, error } = useFriends();
  const [profile,setProfile]=useState<User & {resting?:boolean}>();
  const [failure,setFailure]=useState('');
  const [confirm,setConfirm]=useState<'remove'|'block'|'restrict'>();
  const [management, setManagement] = useState(false);
  const [busy,setBusy]=useState(false);
  const friend = relationships?.find((item) => item.userId === id && item.status === 'accepted');
  useFocusEffect(useCallback(() => {
    let active=true;
    void refresh();
    if(!isUiDemo)void request<{user:User & {resting?:boolean}}>('/people/'+id)
      .then((value)=>{if(active)setProfile(value.user);})
      .catch((failure)=>{if(active)setFailure(errorMessage(failure));});
    return ()=>{active=false;};
  }, [id,refresh,request]));

  async function manage() {
    setBusy(true);setFailure('');
    try {
      await request('/friends/'+confirm,{method:'POST',body:{userId:id}});
      await refresh();router.replace('/friends');
    } catch(error){setFailure(errorMessage(error));}
    finally{setBusy(false);}
  }
  return <Screen title="好友资料" actions={friend && !isUiDemo &&
    <IconButton label="关系与隐私" icon="ellipsis-horizontal" onPress={() => setManagement(true)} />} back={() => router.canGoBack() ? router.back() : router.replace('/friends')}>
    {friend && (isUiDemo||profile) ? <>
      <View style={local.profile}>
        <View style={local.avatarFrame}>
          <GlassLayer tone="control" roundness={radius.pill} />
          <Avatar name={friend.name} source={demoPortrait(friend.username)} size={76} />
        </View>
        <View style={styles.grow}>
          <Text style={local.name}>{friend.name}</Text>
          <Text style={styles.muted}>朋聊号 @{friend.username}</Text>
          {profile?.resting && <Text style={styles.small}>正在休息</Text>}
        </View>
      </View>
      {!!(profile?.bio ?? friend.bio) && <Text style={[styles.body, local.bio]}>{profile?.bio ?? friend.bio}</Text>}
      <FriendLifeStatus id={id}/>
      <Button label="发消息" icon="chatbubble-outline"
        onPress={() => router.push({ pathname: '/chat/[id]', params: { id: friend.userId } })} />
      {isUiDemo?<View style={local.shortcuts}>
        <Button label="个人空间" icon="albums-outline" variant="soft"
          onPress={() => router.push({ pathname: '/space/[id]', params: { id: friend.userId } })} />
        <Button label="共同小宠物" icon="heart-circle-outline" variant="soft"
          onPress={() => router.push({ pathname: '/pet/[id]', params: { id: friend.userId } })} />
      </View>:<SettingGroup>
        <ListRow title="查看对方动态" left={<Icon name="images-outline" />}
          onPress={() => router.push({ pathname: '/moments', params: { author: id } })} separator={false} />
      </SettingGroup>}
    </> : <Empty busy={!relationships && !error && !failure}>{failure || error || (relationships && !friend ? '找不到这位好友。' : '正在加载资料…')}</Empty>}
    {management && <Sheet title="关系与隐私" onClose={() => setManagement(false)}>
      {([
        ['restrict', '限制对方查看我的内容', 'eye-off-outline'],
        ['remove', '删除好友', 'person-remove-outline'],
        ['block', '拉黑', 'ban-outline'],
      ] as const).map(([action, title, icon]) => <ListRow key={action} title={title}
        left={<Icon name={icon} color={action === 'block' ? colors.danger : colors.ink} />}
        onPress={() => { setManagement(false); setConfirm(action); }} />)}
    </Sheet>}
    {confirm&&<Sheet title={confirm==='block'?'拉黑联系人':confirm==='restrict'?'限制内容访问':'删除好友'} onClose={()=>{if(!busy)setConfirm(undefined);}}>
      <Text style={styles.muted}>{confirm==='block'?'拉黑后彼此无法发起私聊、申请或邀请。你可以在隐私中心管理黑名单。':confirm==='restrict'?'对方无法再查看你的动态、签名和休息状态。你们仍可正常聊天。':'删除后如需重新聊天，需要再次完成好友确认。'}</Text>
      {!!failure&&<Notice>{failure}</Notice>}
      <Button label={confirm==='block'?'确认拉黑':confirm==='restrict'?'确认限制':'确认删除好友'} variant="danger" disabled={busy} onPress={()=>void manage()}/>
    </Sheet>}
  </Screen>;
}

function FriendLifeStatus({id}:{id:string}){
  const {data}=useRecord<{status:LifeStatus|null}>('/p2/status/'+id,20000);
  return data?.status?<StatusBlock status={data.status}/>:null;
}

const local = StyleSheet.create({
  profile: { ...styles.row, padding: space.md, backgroundColor: colors.panel, borderRadius: radius.surface, gap: space.md },
  avatarFrame: { padding: space.xxs, borderRadius: radius.pill },
  shortcuts: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  name: { ...type.title, color: colors.text },
  bio: { paddingHorizontal: space.xxs },
});
