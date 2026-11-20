import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, Text, View } from 'react-native';
import { Button, Notice, Sheet } from '../../components/ui';
import { useRecord } from '../social/ui';
import { useSession } from '../../services/session';
import { styles } from '../../theme';
import { groupRtcProvider, type GroupGrant, type GroupRoom } from './group-provider';

type ActiveCall = { id: string; hostId: string; state: 'invited' | 'joined' | 'declined' | 'left' };
const states = {
  connecting: '正在连接…',
  connected: '通话中',
  reconnecting: '网络恢复中…',
  ended: '通话已结束',
};
export function GroupCallScreen({ groupId, onClose }: { groupId: string; onClose: () => void }) {
  const { session } = useSession();
  const path = '/p1/groups/' + groupId + '/call';
  const { data, error, request, run, busy } = useRecord<{ available: boolean; call: ActiveCall | null }>(
    path,
  );
  const provider = groupRtcProvider();
  const room = useRef<GroupRoom | undefined>(undefined);
  const entered = useRef<string | undefined>(undefined);
  const [state, setState] = useState<keyof typeof states>();
  const [video, setVideo] = useState<ReactNode>();
  const [mic, setMic] = useState(true);
  const [camera, setCamera] = useState(true);
  const command = (id: string, action: string) =>
    request<GroupGrant>('/p1/calls/' + id + '/' + action, { method: 'POST', body: {} });
  useEffect(() => {
    return () => {
      if (room.current) {
        void room.current.close().catch(() => {});
        room.current = undefined;
      }
      if (entered.current)
        void request('/p1/calls/' + entered.current + '/leave', { method: 'POST', body: {} }).catch(() => {});
    };
  }, [request]);
  useEffect(() => {
    if (!state || state === 'ended') return;
    async function renew() {
      if (!entered.current || !room.current) return;
      try {
        await room.current.updateToken(
          await request<GroupGrant>('/p1/calls/' + entered.current + '/renew', { method: 'POST', body: {} }),
        );
      } catch {
        await room.current?.close().catch(() => {});
        room.current = undefined;
        setVideo(undefined);
        setState('ended');
      }
    }
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') void renew();
    }, 35000);
    const listener = AppState.addEventListener('change', (next) => {
      if (next === 'active') void renew();
    });
    return () => {
      clearInterval(timer);
      listener.remove();
    };
  }, [request, state]);
  const availability = !!data?.available && !!provider;
  async function join(id?: string) {
    if (!provider) return;
    if (!(await provider.requestPermissions())) throw new Error('需要麦克风和摄像头权限才能加入视频通话。');
    const active = id ?? (await request<{ id: string }>(path, { method: 'POST', body: {} })).id;
    const grant = await command(active, 'join');
    entered.current = active;
    setState('connecting');
    try {
      room.current = await provider.join(grant, { onVideo: setVideo, onState: setState });
    } catch (failure) {
      await command(active, 'leave').catch(() => {});
      entered.current = undefined;
      setVideo(undefined);
      setState('ended');
      throw failure;
    }
  }
  const active = data?.call;
  return (
    <Sheet
      title="群视频通话"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      {!!error && <Notice>{error}</Notice>}
      {!data && !error && <Text style={styles.muted}>正在检查通话服务…</Text>}
      {data && !availability && (
        <Notice>{data.available ? '此版本尚未安装群视频组件。' : '群视频服务尚未配置。'}</Notice>
      )}
      {availability && !state && (
        <>
          {active?.state === 'declined' ? (
            <Text style={styles.muted}>已婉拒这次通话。</Text>
          ) : (
            <Button
              label={active ? '接听群视频' : '发起群视频'}
              variant="gradient"
              disabled={busy}
              onPress={() => void run(() => join(active?.id))}
            />
          )}
          {active && active.state === 'invited' && active.hostId !== session?.user.id && (
            <Button
              label="婉拒"
              variant="quiet"
              disabled={busy}
              onPress={() => void run(() => command(active.id, 'decline'))}
            />
          )}
        </>
      )}
      {state && <Text style={styles.strong}>{states[state]}</Text>}
      {state && state !== 'ended' && (
        <>
          {video}
          <View style={[styles.row, { flexWrap: 'wrap' }]}>
            <Button
              label={mic ? '静音' : '打开麦克风'}
              variant="soft"
              onPress={() =>
                void run(async () => {
                  if (room.current) {
                    await room.current.setMicrophone(!mic);
                    setMic(!mic);
                  }
                }, false)
              }
            />
            <Button
              label={camera ? '关闭摄像头' : '打开摄像头'}
              variant="soft"
              onPress={() =>
                void run(async () => {
                  if (room.current) {
                    await room.current.setCamera(!camera);
                    setCamera(!camera);
                  }
                }, false)
              }
            />
            <Button
              label="切换摄像头"
              variant="soft"
              disabled={!camera}
              onPress={() =>
                void run(async () => {
                  await room.current?.switchCamera();
                }, false)
              }
            />
          </View>
          <Button
            label="离开通话"
            variant="danger"
            disabled={busy}
            onPress={() =>
              void run(async () => {
                await room.current?.close();
                room.current = undefined;
                if (entered.current) await command(entered.current, 'leave');
                entered.current = undefined;
                onClose();
              }, false)
            }
          />
          {active?.hostId === session?.user.id && (
            <Button
              label="结束群通话"
              variant="danger"
              disabled={busy}
              onPress={() =>
                void run(async () => {
                  if (active) await command(active.id, 'end');
                  await room.current?.close();
                  room.current = undefined;
                  entered.current = undefined;
                  onClose();
                }, false)
              }
            />
          )}
        </>
      )}
    </Sheet>
  );
}
