import { DepthGlass } from '../../components/depth-glass';
import { isLiquidGlass } from '../../demo/mode';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { AppState, Text, TextInput, View, type TextInputProps } from 'react-native';

import { Button, ListRow, Notice } from '../../components/ui';
import { MemberChoices } from '../privacy/MemberChoices';
import type { RelationGroup } from '../privacy/types';
import { errorMessage } from '../../services/api';
import { useFriends } from '../../services/friends';
import { useSession } from '../../services/session';
import { colors, radius, styles } from '../../theme';

export const categories = {
  food: '吃饭',
  film: '看电影',
  travel: '旅行',
  sports: '运动',
  walk: '散步',
  games: '一起玩',
  other: '其他',
};
export type Category = keyof typeof categories;
export const back = () => (router.canGoBack() ? router.back() : router.replace('/play'));
export const formatTime = (value: string) =>
  new Date(value).toLocaleString('zh-CN', { dateStyle: 'medium', timeStyle: 'short' });

export function dateTime(value: string) {
  const text = value.trim().replace(' ', 'T');
  const date = new Date(text);
  if (
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d{1,3})?)?(?:Z|[+-]\d\d:\d\d)?$/.test(text) ||
    !Number.isFinite(+date)
  ) {
    throw new Error('时间格式为 年-月-日 时:分，例如 2027-01-02 14:30。');
  }
  return date.toISOString();
}

export function useRecord<T>(path: string, refreshMillis?: number) {
  const { request } = useSession();
  const [loaded, setLoaded] = useState<{ path: string; value: T }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  const sequence = useRef(0);
  const load = useCallback(async () => {
    const generation = ++sequence.current;
    try {
      const value = await request<T>(path);
      if (sequence.current === generation) {
        setLoaded({ path, value });
        setError('');
      }
    } catch (failure) {
      if (sequence.current === generation) {
        setLoaded(undefined);
        setError(errorMessage(failure));
      }
    }
  }, [path, request]);
  useFocusEffect(
    useCallback(() => {
      setError('');
      void load();
      const timer = refreshMillis
        ? setInterval(() => {
            if (!lock.current && AppState.currentState === 'active') void load();
          }, refreshMillis)
        : undefined;
      return () => {
        sequence.current++;
        if (timer) clearInterval(timer);
      };
    }, [load, refreshMillis]),
  );
  async function run(task: () => Promise<unknown>, reload = true) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      await task();
      if (reload) await load();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return { data: loaded?.path === path ? loaded.value : undefined, load, error, busy, run, request };
}

export function Field({ title, ...props }: TextInputProps & { title: string }) {
  const input = <TextInput accessibilityLabel={title} placeholderTextColor={colors.quiet}
    style={[styles.input, props.multiline && { minHeight: 84, textAlignVertical: 'top' }]}
    {...props} />;
  return <View style={{ gap: 5 }}>
    <Text style={styles.strong}>{title}</Text>
    {isLiquidGlass ? <View>
      {input}
      <DepthGlass level="medium" roundness={radius.control} rimOnly />
    </View> : input}
  </View>;
}

export function Choices<T extends string>({
  labels,
  value,
  set,
}: {
  labels: Record<T, string>;
  value?: T;
  set: (value: T) => void;
}) {
  return (
    <View style={[styles.row, { flexWrap: 'wrap' }]}>
      {(Object.keys(labels) as T[]).map((item) => (
        <Button
          key={item}
          label={labels[item]}
          variant={item === value ? 'primary' : 'soft'}
          onPress={() => set(item)}
        />
      ))}
    </View>
  );
}

export function InviteChoices({
  ids,
  setIds,
  groupId,
  setGroupId,
  portraits = false,
}: {
  ids: string[];
  setIds: (ids: string[]) => void;
  groupId: string;
  setGroupId: (id: string) => void;
  portraits?: boolean;
}) {
  const { relationships, refresh } = useFriends();
  const { data, error } = useRecord<{ groups: RelationGroup[] }>('/relationship-groups');
  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );
  return (
    <>
      {!!error && <Notice>{error}</Notice>}
      {!!data?.groups.length && (
        <>
          <Text style={styles.strong}>好友关系组</Text>
          <View style={[styles.row, { flexWrap: 'wrap' }]}>
            {data.groups.map((group) => (
              <Button
                key={group.id}
                label={group.label}
                variant={groupId === group.id ? 'primary' : 'soft'}
                onPress={() => setGroupId(groupId === group.id ? '' : group.id)}
              />
            ))}
          </View>
        </>
      )}
      <Text style={styles.strong}>选择好友</Text>
      <MemberChoices
        friends={relationships?.filter((person) => person.status === 'accepted') ?? []}
        ids={ids}
        update={setIds}
        portraits={portraits}
      />
    </>
  );
}

export function CheckRow({
  label,
  selected,
  action,
}: {
  label: string;
  selected: boolean;
  action: () => void;
}) {
  return (
    <ListRow
      title={label}
      trailing={<Text style={styles.strong}>{selected ? '已选择' : '选择'}</Text>}
      onPress={action}
    />
  );
}
