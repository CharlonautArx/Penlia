import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Platform, Share, Switch, Text, TextInput, View } from 'react-native';

import { Button, Empty, Icon, ListRow, Notice, Screen, Section, SettingGroup, Sheet } from '../components/ui';
import { weekdays, type Day, type Device, type RelationGroup, type Settings } from '../features/privacy/types';
import { MemberChoices } from '../features/privacy/MemberChoices';
import { isUiDemo } from '../demo/mode';
import { errorMessage, type Relationship } from '../services/api';
import { useFriends } from '../services/friends';
import { useSession } from '../services/session';
import { colors, fixed, space, styles } from '../theme';

type Ticket = { id: string; kind: 'export' | 'delete_account'; status: string; requestedAt: string };

export default function PrivacyScreen() {
  const { request } = useSession();
  const { relationships, refresh } = useFriends();
  const [settings, setSettings] = useState<Settings>();
  const [priority, setPriority] = useState<string[]>([]);
  const [groups, setGroups] = useState<RelationGroup[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [blocks, setBlocks] = useState<{ id: string; name: string; username: string }[]>([]);
  const [restrictions, setRestrictions] = useState<typeof blocks>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [sheet, setSheet] = useState<
    'quiet' | 'groups' | 'priority' | 'blocks' | 'restricted' | 'devices' | 'password' | 'requests'
  >();
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/me'));

  const load = useCallback(async () => {
    try {
      const { settings: current, priorityIds } = await request<{ settings: Settings; priorityIds: string[] }>(
        '/privacy',
      );
      setSettings(current);
      setPriority(priorityIds);
    } catch (error) {
      setNotice(errorMessage(error));
    }
  }, [request]);
  useFocusEffect(
    useCallback(() => {
      void load();
      void refresh();
    }, [load, refresh]),
  );

  async function run(task: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setNotice('');
    try {
      await task();
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function save(values: Record<string, unknown>) {
    if (!settings) return;
    const { settings: current } = await request<{ settings: Settings }>('/privacy', {
      method: 'PATCH',
      body: { version: settings.version, ...values },
    });
    setSettings(current);
  }

  async function open(next: typeof sheet) {
    setSheet(next);
    if (next === 'groups') setGroups((await request<{ groups: RelationGroup[] }>('/relationship-groups')).groups);
    if (next === 'blocks') setBlocks((await request<{ blocks: typeof blocks }>('/privacy/blocks')).blocks);
    if (next === 'restricted')
      setRestrictions((await request<{ restrictions: typeof blocks }>('/privacy/restricted')).restrictions);
    if (next === 'devices') {
      await request('/privacy/devices/label', {
        method: 'POST',
        body: {
          nickname: Platform.OS === 'ios' ? 'iPhone 或 iPad' : Platform.OS === 'android' ? 'Android 设备' : '浏览器',
        },
      });
      setDevices((await request<{ devices: Device[] }>('/privacy/devices')).devices);
    }
    if (next === 'requests') setTickets((await request<{ requests: Ticket[] }>('/privacy/requests')).requests);
  }

  const friends = relationships?.filter((item) => item.status === 'accepted') ?? [];
  const toggle = (label: string, value: boolean, action: (value: boolean) => void, detail?: string) => (
    <ListRow
      title={label}
      detail={detail}
      trailing={
        <Switch
          accessibilityLabel={label}
          disabled={busy}
          value={value}
          onValueChange={action}
          trackColor={{ false: colors.border, true: colors.accent }}
          thumbColor={fixed.onAction}
        />
      }
    />
  );

  return (
    <Screen title="隐私与安全" back={back} refreshing={busy} onRefresh={() => void run(load)}>
      {isUiDemo && <Notice>隐私设置仅保存到这台设备。</Notice>}
      {!!notice && !sheet && (
        <Notice action="刷新" onAction={() => void run(load)}>
          {notice}
        </Notice>
      )}
      {!settings ? (
        <Empty busy={!notice}>正在读取隐私设置…</Empty>
      ) : (
        <>
          <SettingGroup title="社交权限">
            {toggle(
              '允许通过朋聊号或二维码添加我',
              settings.addPolicy === 'anyone',
              (value) => void run(() => save({ addPolicy: value ? 'anyone' : 'none' })),
            )}
            {toggle(
              '允许通过手机号找到我',
              settings.phoneSearch,
              (phoneSearch) => void run(() => save({ phoneSearch })),
              '仅已验证的手机号可用于精确查找。',
            )}
            {toggle(
              '允许好友邀请我加入群聊',
              settings.groupPolicy === 'friends',
              (value) => void run(() => save({ groupPolicy: value ? 'friends' : 'none' })),
              '每次加入都由你确认。',
            )}
            <ListRow title="黑名单" left={<Icon name="ban-outline" />} onPress={() => void run(() => open('blocks'))} />
            <ListRow
              title="受限联系人"
              detail="限制对方查看你的动态与私人资料"
              left={<Icon name="eye-off-outline" />}
              onPress={() => void run(() => open('restricted'))}
            />
          </SettingGroup>
          <SettingGroup title="内容隐私">
            <View style={{ padding: space.sm, gap: space.xs }}>
              <Text style={styles.strong}>动态默认可见范围</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xs }}>
              {(
                [
                  ['private', '仅自己'],
                  ['friends', '全部好友'],
                  ['circle', '亲密圈'],
                ] as const
              ).map(([value, label]) => (
                <Button
                  key={value}
                  label={label}
                  disabled={busy}
                  variant={settings.momentScope === value ? 'primary' : 'soft'}
                  onPress={() => void run(() => save({ momentScope: value }))}
                />
              ))}
              </View>
            </View>
            <ListRow title="亲密圈与关系组" onPress={() => void run(() => open('groups'))} />
            {toggle(
              '让好友看到个性签名',
              settings.profilePolicy === 'friends',
              (value) => void run(() => save({ profilePolicy: value ? 'friends' : 'private' })),
            )}
            {toggle(
              '让好友看到我设置的休息状态',
              settings.showResting && settings.statusPolicy === 'friends',
              (value) => void run(() => save({ showResting: value, statusPolicy: value ? 'friends' : 'private' })),
              '只显示正在休息，起止时间保密。',
            )}
          </SettingGroup>
          <SettingGroup title="通知和时间边界">
            <ListRow
              title="我的生活节奏"
              detail={settings.muteIndefinitely ? '一直静默' : '每周安静时间和临时静默'}
              left={<Icon name="moon-outline" />}
              onPress={() => void run(() => open('quiet'))}
            />
            <ListRow
              title="重要联系人"
              detail={priority.length + ' 位'}
              onPress={() => void run(() => open('priority'))}
            />
            {toggle(
              '接受好友安静送达',
              settings.allowSilent,
              (allowSilent) => void run(() => save({ allowSilent })),
              '关闭后文字消息按你的提醒规则处理。图片适用范围取决于环信服务。',
            )}
          </SettingGroup>
          <SettingGroup title="账号安全">
            <ListRow title="登录设备" onPress={() => void run(() => open('devices'))} />
            <ListRow title="修改账号密码" onPress={() => void run(() => open('password'))} />
            <ListRow
              title="数据与账号申请"
              detail="申请导出或注销账号"
              onPress={() => void run(() => open('requests'))}
            />
          </SettingGroup>
        </>
      )}
      {settings && sheet && (
        <Sheet
          title={
            {
              quiet: '我的生活节奏',
              groups: '亲密圈与关系组',
              priority: '重要联系人',
              blocks: '黑名单',
              restricted: '受限联系人',
              devices: '登录设备',
              password: '修改账号密码',
              requests: '数据与账号申请',
            }[sheet]
          }
          onClose={() => {
            if (!busy) {
              setSheet(undefined);
              setNotice('');
            }
          }}
        >
          {!!notice && <Notice>{notice}</Notice>}
          {sheet === 'quiet' && (
            <QuietForm
              settings={settings}
              busy={busy}
              save={(values) =>
                void run(async () => {
                  await save(values);
                  setNotice('已保存。聊天仍会正常接收消息。');
                })
              }
            />
          )}
          {sheet === 'groups' && (
            <GroupsForm
              groups={groups}
              friends={friends}
              busy={busy}
              run={(action) => void run(action)}
              save={async (group) => {
                const { group: saved } = await request<{ group: RelationGroup }>(
                  '/relationship-groups' + (group.id ? '/' + group.id : ''),
                  { method: group.id ? 'PUT' : 'POST', body: group },
                );
                setGroups((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
                setNotice('关系组已保存。');
              }}
              remove={async (id) => {
                await request('/relationship-groups/' + id, { method: 'DELETE' });
                setGroups((current) => current.filter((item) => item.id !== id));
              }}
            />
          )}
          {sheet === 'priority' && (
            <MemberForm
              friends={friends}
              initial={priority}
              busy={busy}
              save={(ids) =>
                void run(async () => {
                  await request('/privacy/priority', { method: 'PUT', body: { ids } });
                  setPriority(ids);
                  setNotice('重要联系人已保存。');
                })
              }
            />
          )}
          {sheet === 'blocks' &&
            (blocks.length ? (
              blocks.map((item) => (
                <ListRow
                  key={item.id}
                  title={item.name}
                  detail={'@' + item.username}
                  trailing={
                    <Button
                      label="移出黑名单"
                      variant="soft"
                      disabled={busy}
                      onPress={() =>
                        void run(async () => {
                          await request('/friends/unblock', { method: 'POST', body: { userId: item.id } });
                          await open('blocks');
                          void refresh();
                        })
                      }
                    />
                  }
                />
              ))
            ) : (
              <Empty>黑名单里还没有联系人。</Empty>
            ))}
          {sheet === 'restricted' &&
            (restrictions.length ? (
              restrictions.map((person) => (
                <ListRow
                  key={person.id}
                  title={person.name}
                  detail={'@' + person.username}
                  trailing={
                    <Button
                      label="解除限制"
                      variant="soft"
                      disabled={busy}
                      onPress={() =>
                        void run(async () => {
                          await request('/friends/unrestrict', { method: 'POST', body: { userId: person.id } });
                          await open('restricted');
                        })
                      }
                    />
                  }
                />
              ))
            ) : (
              <Empty>暂无受限联系人。在好友资料中可以限制对方查看你的动态。</Empty>
            ))}
          {sheet === 'devices' &&
            devices.map((device) => (
              <ListRow
                key={device.id}
                title={device.nickname}
                detail={
                  device.current ? '当前设备' : '登录有效至 ' + new Date(device.expiresAt).toLocaleDateString('zh-CN')
                }
                trailing={
                  device.current ? undefined : (
                    <Button
                      label="退出该设备"
                      variant="danger"
                      disabled={busy}
                      onPress={() =>
                        void run(async () => {
                          await request('/privacy/devices/revoke', { method: 'POST', body: { deviceId: device.id } });
                          await open('devices');
                          setNotice('已撤销该设备的登录。');
                        })
                      }
                    />
                  )
                }
              />
            ))}
          {sheet === 'password' && (
            <PasswordForm
              busy={busy}
              save={(oldPassword, newPassword) =>
                void run(async () => {
                  await request('/privacy/password', { method: 'POST', body: { oldPassword, newPassword } });
                  setSheet(undefined);
                  setNotice('密码已修改，其他设备的登录已撤销。');
                })
              }
            />
          )}
          {sheet === 'requests' && (
            <>
              <Text style={styles.muted}>
                可导出当前账号的资料、隐私设置、近期自发群消息及最新一页动态。完整数据与注销需提交申请并核验身份。
              </Text>
              <Button
                label="导出本页资料"
                disabled={busy}
                variant="soft"
                onPress={() =>
                  void run(async () => {
                    const exported = await request('/privacy/export');
                    const data = JSON.stringify(exported, null, 2);
                    if (Platform.OS === 'web') {
                      const uri = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
                      const link = document.createElement('a');
                      link.href = uri;
                      link.download = 'penlia-data.json';
                      link.click();
                      setTimeout(() => URL.revokeObjectURL(uri), 1000);
                    } else await Share.share({ title: '朋聊个人数据', message: data });
                    setNotice('导出内容已准备。请自行保管。');
                  })
                }
              />
              <Button
                label="申请数据导出"
                disabled={busy}
                variant="soft"
                onPress={() =>
                  void run(async () => {
                    await request('/privacy/requests', { method: 'POST', body: { kind: 'export' } });
                    await open('requests');
                    setNotice('已收到导出申请。');
                  })
                }
              />
              <DeleteRequest
                busy={busy}
                apply={() =>
                  void run(async () => {
                    await request('/privacy/requests', { method: 'POST', body: { kind: 'delete_account' } });
                    await open('requests');
                    setNotice('已收到注销申请。');
                  })
                }
              />
              {tickets.map((ticket) => (
                <ListRow
                  key={ticket.id}
                  title={ticket.kind === 'export' ? '数据导出' : '账号注销'}
                  detail={
                    new Date(ticket.requestedAt).toLocaleDateString('zh-CN') +
                    ' · ' +
                    ({
                      requested: '已提交',
                      processing: '处理中',
                      completed: '已完成',
                      cancelled: '已取消',
                    }[ticket.status] ?? ticket.status)
                  }
                />
              ))}
            </>
          )}
        </Sheet>
      )}
    </Screen>
  );
}

function QuietForm({
  settings,
  busy,
  save,
}: {
  settings: Settings;
  busy: boolean;
  save: (values: Record<string, unknown>) => void;
}) {
  const [day, setDay] = useState<Day>('Mon');
  const [hours, setHours] = useState(settings.quietHours);
  const [zone, setZone] = useState(settings.zone);
  const times = hours[day] ?? ['22:30', '08:00'];
  const deviceZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return (
    <>
      <Text style={styles.muted}>按选定时区执行。开始时间晚于结束时间时，安静时间会持续到次日。</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {weekdays.map(([value, label]) => (
          <Button
            key={value}
            label={label}
            variant={value === day ? 'primary' : 'soft'}
            onPress={() => setDay(value)}
          />
        ))}
      </View>
      <ListRow
        title="启用这一天"
        trailing={
          <Switch
            accessibilityLabel="启用这一天"
            value={!!hours[day]}
            onValueChange={(value) => {
              setHours((current) => {
                const next = { ...current };
                if (value) next[day] = ['22:30', '08:00'];
                else delete next[day];
                return next;
              });
            }}
          />
        }
      />
      {!!hours[day] && (
        <View style={styles.row}>
          <TextInput
            accessibilityLabel="开始时间"
            placeholder="22:30"
            value={times[0]}
            maxLength={5}
            style={[styles.input, styles.grow]}
            onChangeText={(start) => setHours({ ...hours, [day]: [start, times[1]] })}
          />
          <Text>至</Text>
          <TextInput
            accessibilityLabel="结束时间"
            placeholder="08:00"
            value={times[1]}
            maxLength={5}
            style={[styles.input, styles.grow]}
            onChangeText={(end) => setHours({ ...hours, [day]: [times[0], end] })}
          />
        </View>
      )}
      <TextInput
        accessibilityLabel="安静时间时区"
        value={zone}
        onChangeText={setZone}
        autoCapitalize="none"
        style={styles.input}
      />
      {deviceZone && (
        <Button label={'使用设备时区 ' + deviceZone} variant="quiet" onPress={() => setZone(deviceZone)} />
      )}
      <Button
        label="保存每周安静时间"
        variant="gradient"
        disabled={busy}
        onPress={() => save({ zone, quietHours: hours })}
      />
      <Section title="临时静默" />
      {settings.muteIndefinitely ? (
        <Text style={styles.muted}>静默中，直到手动解除。</Text>
      ) : settings.muteUntil && Date.parse(settings.muteUntil) > Date.now() ? (
        <Text style={styles.muted}>
          静默至 {new Date(settings.muteUntil).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
        </Text>
      ) : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {(
          [
            ['30', '30 分钟'],
            ['60', '1 小时'],
            ['until', '直到手动关闭'],
            ['off', '结束临时静默'],
          ] as const
        ).map(([value, label]) => (
          <Button key={value} label={label} variant="soft" disabled={busy} onPress={() => save({ temporary: value })} />
        ))}
      </View>
    </>
  );
}

function MemberForm({
  friends,
  initial,
  busy,
  save,
}: {
  friends: Relationship[];
  initial: string[];
  busy: boolean;
  save: (ids: string[]) => void;
}) {
  const [ids, setIds] = useState(initial);
  return (
    <>
      <Text style={styles.muted}>你可以保留来自重要联系人的通常提醒。系统通知权限始终优先。</Text>
      <MemberChoices friends={friends} ids={ids} update={setIds} />
      <Button label="保存重要联系人" disabled={busy} variant="gradient" onPress={() => save(ids)} />
    </>
  );
}

function GroupsForm({
  groups,
  friends,
  save,
  remove,
  run,
  busy,
}: {
  groups: RelationGroup[];
  friends: Relationship[];
  save: (value: RelationGroup) => Promise<void>;
  remove: (id: string) => Promise<void>;
  run: (task: () => Promise<void>) => void;
  busy: boolean;
}) {
  const [edit, setEdit] = useState<RelationGroup>();
  return edit ? (
    <>
      <Section title={edit.circle ? '编辑亲密圈' : '编辑关系组'} />
      {!edit.circle && (
        <TextInput
          accessibilityLabel="关系组名称"
          placeholder="例如家人"
          style={styles.input}
          maxLength={32}
          value={edit.label}
          onChangeText={(label) => setEdit({ ...edit, label })}
        />
      )}
      <MemberChoices friends={friends} ids={edit.memberIds} update={(memberIds) => setEdit({ ...edit, memberIds })} />
      <Button
        label="保存关系组"
        variant="gradient"
        disabled={busy || !edit.label.trim()}
        onPress={() =>
          run(async () => {
            await save(edit);
            setEdit(undefined);
          })
        }
      />
      <Button label="返回关系列表" variant="quiet" onPress={() => setEdit(undefined)} />
      {!!edit.id && !edit.circle && (
        <Button
          label="删除关系组"
          variant="danger"
          disabled={busy}
          onPress={() =>
            run(async () => {
              await remove(edit.id);
              setEdit(undefined);
            })
          }
        />
      )}
    </>
  ) : (
    <>
      <ListRow
        title="亲密圈"
        detail={(groups.find((group) => group.circle)?.memberIds.length ?? 0) + ' 位'}
        onPress={() =>
          setEdit(groups.find((group) => group.circle) ?? { id: '', label: '亲密圈', circle: true, memberIds: [] })
        }
      />
      {groups
        .filter((group) => !group.circle)
        .map((group) => (
          <ListRow
            key={group.id}
            title={group.label}
            detail={group.memberIds.length + ' 位'}
            onPress={() => setEdit(group)}
          />
        ))}
      <Button
        label="新建关系组"
        variant="soft"
        onPress={() => setEdit({ id: '', label: '', circle: false, memberIds: [] })}
      />
    </>
  );
}

function PasswordForm({ busy, save }: { busy: boolean; save: (oldPassword: string, newPassword: string) => void }) {
  const [old, setOld] = useState('');
  const [next, setNext] = useState('');
  return (
    <>
      <TextInput
        accessibilityLabel="原密码"
        placeholder="原密码"
        secureTextEntry
        value={old}
        onChangeText={setOld}
        style={styles.input}
      />
      <TextInput
        accessibilityLabel="新密码"
        placeholder="新密码，至少 10 个字符"
        secureTextEntry
        value={next}
        onChangeText={setNext}
        style={styles.input}
      />
      <Button
        label="修改密码"
        variant="gradient"
        disabled={busy || old.length < 10 || next.length < 10}
        onPress={() => save(old, next)}
      />
    </>
  );
}

function DeleteRequest({ busy, apply }: { busy: boolean; apply: () => void }) {
  const [confirmed, setConfirmed] = useState(false);
  return (
    <Button
      label={confirmed ? '确认提交注销申请' : '申请注销账号'}
      variant="danger"
      disabled={busy}
      onPress={() => {
        if (confirmed) {
          setConfirmed(false);
          apply();
        } else if (Platform.OS === 'web') setConfirmed(true);
        else
          Alert.alert('申请注销账号', '申请需要进一步核验。', [
            { text: '取消', style: 'cancel' },
            { text: '提交申请', style: 'destructive', onPress: apply },
          ]);
      }}
    />
  );
}
