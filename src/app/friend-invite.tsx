import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';

import { Button, Empty, Notice, Screen } from '../components/ui';
import { clearScannedInvitation, scannedInvitation, type PublicPerson } from '../features/friends/invitations';
import { PublicProfile } from '../features/friends/PublicProfile';
import { back, Field } from '../features/social/ui';
import { errorMessage } from '../services/api';
import { useFriends } from '../services/friends';
import { useSession } from '../services/session';

export default function FriendInvite() {
  const { session } = useSession();
  const { ticket } = useLocalSearchParams<{ ticket?: string }>();
  return <Invitation key={ticket + ':' + session?.user.id} account={session?.user.id} ticket={ticket} />;
}

function Invitation({ account, ticket }: { account?: string; ticket?: string }) {
  const { request } = useSession();
  const { refresh } = useFriends();
  const [code] = useState(() => scannedInvitation(ticket, account));
  const [person, setPerson] = useState<PublicPerson>();
  const [note, setNote] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(!!code);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(code ? '' : '请从「好友 → 添加好友」重新扫码。');
  const lock = useRef(false);
  useEffect(() => {
    clearScannedInvitation(ticket);
  }, [ticket]);
  useEffect(() => {
    if (!code) return;
    let active = true;
    void request<{ person: PublicPerson | null }>('/people/code', { method: 'POST', body: { code } }).then((result) => {
      if (!active) return;
      if (result.person) setPerson(result.person);
      else setError('这个二维码无效、已过期或已撤销，也可能是你自己的二维码。');
    }).catch((failure) => { if (active) setError(errorMessage(failure)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [request, code]);

  async function send() {
    if (!code || lock.current || sent) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      await request('/friends', { method: 'POST', body: { code, note } });
      setSent(true);
      void refresh();
    } catch (failure) { setError(errorMessage(failure)); }
    finally { lock.current = false; setBusy(false); }
  }

  return <Screen title="添加好友" back={back}>
    {!!error && <Notice>{error}</Notice>}
    {loading && <Empty busy>正在校验二维码…</Empty>}
    {person && <>
      <PublicProfile person={person} />
      {person.isFriend ? <Button label="查看好友主页" variant="gradient"
        onPress={() => router.replace({ pathname: '/person/[id]', params: { id: person.id } })} />
        : sent ? <Notice>已提交好友申请，等待对方处理。</Notice> : <>
          <Field title="验证消息（选填）" value={note} onChangeText={setNote} maxLength={100} multiline />
          <Button label="发送好友申请" variant="gradient" disabled={busy} onPress={() => void send()} />
        </>}
    </>}
  </Screen>;
}
