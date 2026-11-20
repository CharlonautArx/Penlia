import { useLocalSearchParams } from 'expo-router';
import { randomUUID } from 'expo-crypto';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Button, ListRow, Notice, Screen, Section, Sheet } from '../../components/ui';
import { MemberChoices } from '../../features/privacy/MemberChoices';
import { back, Choices, dateTime, Field, formatTime, useRecord } from '../../features/social/ui';
import { DataEmpty, daysText, formTime, localDay, moveDays } from '../../features/life/ui';
import { useFriends } from '../../services/friends';
import { useSession } from '../../services/session';
import { colors, styles } from '../../theme';

const modes = { day: '日', week: '周', month: '月' };
type Mode = keyof typeof modes;
const visibility = { private: '仅自己', busy: '只分享忙闲', detail: '可分享详情' };
const shares = { busy: '只分享忙闲', detail: '允许看可分享详情' };
type Entry = {
  id: string;
  ownerId: string;
  title: string;
  details?: string;
  startsAt: string;
  endsAt: string;
  revision?: number;
  visibility?: keyof typeof visibility;
};
type Person = { id: string; name: string; access: keyof typeof shares };
type Data = {
  calendars: Person[];
  events: Entry[];
  truncated: boolean;
  windows: { startsAt: string; endsAt: string }[];
};
const shades = ['#DD6D86', '#18867B', '#6A67AB', '#AB641A', '#216EA2', '#805A8B'];

function calendarBounds(date: Date, mode: Mode) {
  const from =
    mode === 'month'
      ? new Date(date.getFullYear(), date.getMonth(), 1)
      : mode === 'week'
        ? moveDays(date, -((date.getDay() + 6) % 7))
        : moveDays(date, 0);
  const until =
    mode === 'month'
      ? new Date(date.getFullYear(), date.getMonth() + 1, 1)
      : moveDays(from, mode === 'week' ? 7 : 1);
  const days = [];
  for (let day = from; day < until; day = moveDays(day, 1)) days.push(day);
  return { from, until, days };
}

export default function Calendar() {
  const { session } = useSession();
  const [mode, setMode] = useState<Mode>('week');
  const [date, setDate] = useState(new Date());
  const [showFree, setShowFree] = useState(false);
  const [editing, setEditing] = useState<Entry | 'new'>();
  const params = useLocalSearchParams<{ sharing?: string }>();
  const [sharing, setSharing] = useState(params.sharing === '1');
  const { from, until, days } = calendarBounds(date, mode);
  const path =
    '/p2/calendar?' + new URLSearchParams({ from: from.toISOString(), until: until.toISOString() });
  const { data, error, busy, load } = useRecord<Data>(path);
  const anyone = data?.calendars ?? [];
  const user = session?.user.id;
  const entries = (data?.events ?? []).sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt));
  const move = (step: number) =>
    setDate(
      mode === 'month'
        ? new Date(date.getFullYear(), date.getMonth() + step, 1)
        : moveDays(date, (mode === 'week' ? 7 : 1) * step),
    );
  const describes = (line: Entry) => formatTime(line.startsAt) + ' 至 ' + formatTime(line.endsAt);
  return (
    <Screen title="生活日程" back={back} refreshing={busy} onRefresh={() => void load()}>
      <View style={[styles.row, { justifyContent: 'space-between', flexWrap: 'wrap' }]}>
        <Choices labels={modes} value={mode} set={setMode} />
        <Button label="今天" variant="quiet" onPress={() => setDate(new Date())} />
        <Button label="共享设置" icon="people-outline" variant="soft" onPress={() => setSharing(true)} />
      </View>
      <View style={[styles.row, { justifyContent: 'space-between' }]}>
        <Button label="上一页" variant="quiet" onPress={() => move(-1)} />
        <Text style={styles.strong}>
          {date.getFullYear()}年{date.getMonth() + 1}月{mode === 'day' ? date.getDate() + '日' : ''}
        </Text>
        <Button label="下一页" variant="quiet" onPress={() => move(1)} />
      </View>
      {!!anyone.length && (
        <View style={[styles.row, { flexWrap: 'wrap' }]}>
          {anyone.map((person, i) => (
            <View key={person.id} style={styles.row}>
              <View
                style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: shades[i % shades.length] }}
              />
              <Text style={styles.small}>{person.id === user ? '我的日程' : person.name}</Text>
            </View>
          ))}
        </View>
      )}
      {mode === 'month' && (
        <View style={styles.card}>
          <View style={{ flexDirection: 'row' }}>
            {['一', '二', '三', '四', '五', '六', '日'].map((day) => (
              <Text key={day} style={[styles.small, { width: '14.285%', textAlign: 'center' }]}>
                {day}
              </Text>
            ))}
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {Array.from({ length: (from.getDay() + 6) % 7 }, (_, i) => (
              <View key={'gap' + i} style={{ width: '14.285%' }} />
            ))}
            {days.map((day) => {
              const end = moveDays(day, 1);
              const count = entries.filter(
                (entry) => new Date(entry.startsAt) < end && new Date(entry.endsAt) > day,
              ).length;
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={daysText(day) + '，' + count + '项日程'}
                  key={localDay(day)}
                  onPress={() => {
                    setDate(day);
                    setMode('day');
                  }}
                  style={{ width: '14.285%', height: 46, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Text style={styles.strong}>{day.getDate()}</Text>
                  {!!count && <Text style={styles.small}>{count} 项</Text>}
                </Pressable>
              );
            })}
          </View>
        </View>
      )}
      <Button label="添加日程" variant="gradient" icon="add" onPress={() => setEditing('new')} />
      {!!error && (
        <Notice action="重试" onAction={() => void load()}>
          {error}
        </Notice>
      )}
      {data?.truncated && <Notice>记录较多，请切换到日视图查看。</Notice>}
      {mode === 'day' && anyone.length > 1 && !data?.truncated && (
        <>
          <Button
            label={showFree ? '收起共同空闲' : '查看当天共同空闲'}
            variant="soft"
            onPress={() => setShowFree(!showFree)}
          />
          {showFree && (
            <View style={styles.card}>
              <Section title="共同空闲" />
              <Text style={styles.muted}>仅根据已共享给你的日程计算，显示至少 30 分钟的空档。</Text>
              {data?.windows.map((slot) => (
                <Text key={slot.startsAt} style={styles.body}>
                  {formatTime(slot.startsAt)} 至 {formatTime(slot.endsAt)}
                </Text>
              ))}
              {!data?.windows.length && <Text style={styles.muted}>当天没有达到 30 分钟的共同空档。</Text>}
            </View>
          )}
        </>
      )}

      {!entries.length && !error && <DataEmpty loading={!data}>这段时间没有可查看的日程。</DataEmpty>}
      {mode !== 'month' &&
        days.map((day) => {
          const end = moveDays(day, 1);
          const events = entries.filter((e) => new Date(e.startsAt) < end && new Date(e.endsAt) > day);
          return events.length ? (
            <View key={localDay(day)} style={styles.card}>
              <Section title={daysText(day)} />
              {events.map((line) => {
                const i = anyone.findIndex((p) => p.id === line.ownerId);
                return (
                  <ListRow
                    key={line.id}
                    title={line.title}
                    left={
                      <View
                        style={{
                          width: 5,
                          height: 32,
                          borderRadius: 4,
                          backgroundColor: shades[Math.max(i, 0) % shades.length],
                        }}
                      />
                    }
                    detail={
                      (line.ownerId === user ? '我' : (anyone[i]?.name ?? '好友')) +
                      ' · ' +
                      describes(line) +
                      (line.details ? '\n' + line.details : '')
                    }
                    onPress={line.ownerId === user ? () => setEditing(line) : undefined}
                  />
                );
              })}
            </View>
          ) : null;
        })}
      {editing && (
        <EventEditor
          initial={editing === 'new' ? undefined : editing}
          date={date}
          onClose={() => {
            setEditing(undefined);
            void load();
          }}
        />
      )}
      {sharing && (
        <ShareEditor
          onClose={() => {
            setSharing(false);
            void load();
          }}
        />
      )}
    </Screen>
  );
}

function EventEditor({ initial, date, onClose }: { initial?: Entry; date: Date; onClose: () => void }) {
  const { run, busy, error, request } = useRecord<Data>(
    '/p2/calendar?' +
      new URLSearchParams({ from: moveDays(date, 0).toISOString(), until: moveDays(date, 1).toISOString() }),
  );
  const [key] = useState(randomUUID);
  const [title, setTitle] = useState(initial?.title ?? '');
  const [details, setDetails] = useState(initial?.details ?? '');
  const [start, setStart] = useState(
    initial ? formTime(new Date(initial.startsAt)) : localDay(date) + ' 19:00',
  );
  const [end, setEnd] = useState(initial ? formTime(new Date(initial.endsAt)) : localDay(date) + ' 20:00');
  const [visible, setVisible] = useState(initial?.visibility ?? 'private');
  const [removing, setRemoving] = useState(false);
  return (
    <Sheet title={initial ? '编辑日程' : '添加日程'} onClose={onClose}>
      <Field title="日程名称" value={title} onChangeText={setTitle} />
      <Field title="开始时间" value={start} onChangeText={setStart} />
      <Field title="结束时间" value={end} onChangeText={setEnd} />
      <Field title="备注（选填）" value={details} onChangeText={setDetails} multiline />
      <Choices labels={visibility} value={visible} set={setVisible} />
      <Text style={styles.muted}>仅自己可见的日程也不会占用好友眼里的空闲时间。</Text>
      {!!error && <Notice>{error}</Notice>}
      <Button
        label="保存日程"
        variant="gradient"
        disabled={!title.trim() || busy}
        onPress={() =>
          void run(async () => {
            await request('/p2/calendar' + (initial ? '/' + initial.id : ''), {
              method: initial ? 'PATCH' : 'POST',
              body: {
                clientId: key,
                title,
                details,
                startsAt: dateTime(start),
                endsAt: dateTime(end),
                visibility: visible,
                revision: initial?.revision,
              },
            });
            onClose();
          }, false)
        }
      />
      {initial && (
        <Button
          label={removing ? '确认删除日程' : '删除日程'}
          variant="danger"
          onPress={() => {
            if (!removing) {
              setRemoving(true);
              return;
            }
            void run(async () => {
              await request('/p2/calendar/' + initial.id, { method: 'DELETE' });
              onClose();
            }, false);
          }}
        />
      )}
    </Sheet>
  );
}

function ShareEditor({ onClose }: { onClose: () => void }) {
  const { session } = useSession();
  const { relationships } = useFriends();
  const { data, run, request, busy, error } = useRecord<{
    shares: (Person & { ownerId: string; viewerId: string; accepted: boolean })[];
  }>('/p2/calendar-shares');
  const [selected, setSelected] = useState<string[]>([]);
  const [level, setLevel] = useState<keyof typeof shares>('busy');
  const me = session?.user.id;
  const act = (action: string, userId: string) =>
    request('/p2/calendar-shares', { method: 'POST', body: { action, userId, access: level } });
  return (
    <Sheet title="共享日程" onClose={onClose}>
      <Text style={{ color: colors.muted }}>好友接受后才可查看。忙闲模式只显示时间段。</Text>
      {data?.shares.map((item) => {
        const own = item.ownerId === me;
        return (
          <View key={item.ownerId + item.viewerId} style={styles.card}>
            <ListRow
              title={item.name}
              detail={
                (own ? '我共享给对方' : '对方共享给我') +
                ' · ' +
                shares[item.access] +
                (item.accepted ? '' : ' · 待接受')
              }
            />
            <View style={[styles.row, { flexWrap: 'wrap' }]}>
              {!own && !item.accepted && (
                <Button
                  label="接受"
                  disabled={busy}
                  onPress={() => void run(() => act('accept', item.ownerId))}
                />
              )}
              <Button
                label={own ? '关闭共享' : item.accepted ? '取消订阅' : '拒绝'}
                variant="quiet"
                disabled={busy}
                onPress={() =>
                  void run(() => act(own ? 'revoke' : 'decline', own ? item.viewerId : item.ownerId))
                }
              />
            </View>
          </View>
        );
      })}
      <Section title="邀请一位好友" />
      <Choices labels={shares} value={level} set={setLevel} />
      <MemberChoices
        friends={relationships?.filter((p) => p.status === 'accepted') ?? []}
        ids={selected}
        update={(value) => setSelected(value.slice(-1))}
      />
      {!!error && <Notice>{error}</Notice>}
      <Button
        label="发送共享邀请"
        variant="gradient"
        disabled={busy || !selected.length}
        onPress={() =>
          void run(async () => {
            await act('share', selected[0]);
            setSelected([]);
          })
        }
      />
    </Sheet>
  );
}
