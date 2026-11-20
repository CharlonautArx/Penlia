import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Avatar, Button, Empty, Notice, Screen, Sheet } from '../../components/ui';
import { isUiDemo } from '../../demo/mode';
import { demoPortrait } from '../../demo/visuals';
import { errorMessage, type User } from '../../services/api';
import { useFriends } from '../../services/friends';
import { useSession } from '../../services/session';
import { colors, styles } from '../../theme';

export default function PersonScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { request } = useSession();
  const { relationships, refresh, error } = useFriends();
  const [profile,setProfile]=useState<User & {resting?:boolean}>();
  const [failure,setFailure]=useState('');
  const [confirm,setConfirm]=useState<'remove'|'block'|'restrict'>();
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
  return <Screen title="好友资料" back={() => router.canGoBack() ? router.back() : router.replace('/friends')}>
    {friend && (isUiDemo||profile) ? <>
      <View style={local.profile}>
        <Avatar name={friend.name} source={demoPortrait(friend.username)} size={76} />
        <Text style={local.name}>{friend.name}</Text>
        <Text style={styles.muted}>朋聊号 @{friend.username}</Text>
        {!!(profile?.bio || friend.bio)&&<Text style={styles.body}>{profile?.bio ?? friend.bio}</Text>}
        {profile?.resting&&<Text style={styles.muted}>正在休息</Text>}
      </View>
      <Button label="发消息" icon="chatbubble-outline" variant="gradient"
        onPress={() => router.push({ pathname: '/chat/[id]', params: { id: friend.userId } })} />
      {isUiDemo?<View style={local.shortcuts}>
        <Button label="个人空间" icon="albums-outline" variant="soft"
          onPress={() => router.push({ pathname: '/space/[id]', params: { id: friend.userId } })} />
        <Button label="共同小宠物" icon="heart-circle-outline" variant="soft"
          onPress={() => router.push({ pathname: '/pet/[id]', params: { id: friend.userId } })} />
      </View>:<View style={local.shortcuts}>
        <Button label="查看对方动态" icon="albums-outline" variant="soft" onPress={()=>router.push({pathname:'/moments',params:{author:id}})}/>
        <Button label="限制对方查看我的内容" variant="quiet" onPress={()=>setConfirm('restrict')}/>
        <Button label="删除好友" variant="quiet" onPress={()=>setConfirm('remove')}/>
        <Button label="拉黑" variant="danger" onPress={()=>setConfirm('block')}/>
      </View>}
    </> : <Empty busy={!relationships && !error && !failure}>{failure || error || (relationships && !friend ? '找不到这位好友。' : '正在加载资料…')}</Empty>}
    {confirm&&<Sheet title={confirm==='block'?'拉黑联系人':confirm==='restrict'?'限制内容访问':'删除好友'} onClose={()=>{if(!busy)setConfirm(undefined);}}>
      <Text style={styles.muted}>{confirm==='block'?'拉黑后彼此无法发起私聊、申请或邀请。你可以在隐私中心管理黑名单。':confirm==='restrict'?'对方无法再查看你的动态、签名和休息状态。你们仍可正常聊天。':'删除后如需重新聊天，需要再次完成好友确认。'}</Text>
      {!!failure&&<Notice>{failure}</Notice>}
      <Button label={confirm==='block'?'确认拉黑':confirm==='restrict'?'确认限制':'确认删除好友'} variant="danger" disabled={busy} onPress={()=>void manage()}/>
    </Sheet>}
  </Screen>;
}

const local = StyleSheet.create({
  profile: { ...styles.card, padding: 20, alignItems: 'center', backgroundColor: colors.panel, gap: 8 },
  shortcuts: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  name: { fontSize: 24, fontWeight: '800', color: colors.text },
});
