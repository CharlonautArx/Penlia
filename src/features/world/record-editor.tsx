import { randomUUID } from 'expo-crypto';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Button, Icon, ListRow, Notice, Section, Sheet } from '../../components/ui';
import { AssetPicker, DataEmpty, uploadAssets } from '../life/ui';
import type { LocalMedia, Media } from '../moments/media';
import { Choices, Field, useRecord } from '../social/ui';
import { colors, styles } from '../../theme';
import { decorNames, sourceNames, type Decor, type Person, type RecordKind, type SourceKind, type WorldRecord } from './model';

export type RecordDraft = {
  kind: RecordKind; initial?: WorldRecord; x?: number; y?: number;
};
const sourceLabels = { none: '普通摆件', ...sourceNames };
const sourceOptions = {
  link: ['journal', 'collaboration', 'world'],
  decoration: ['none', 'album', 'journal', 'trip', 'capsule', 'memory', 'relay'],
} as const;

export function RecordEditor({ spaceId, rosterVersion, draft, people, close, saved }: {
  spaceId: string; rosterVersion: number; draft: RecordDraft; people: Person[]; close: () => void; saved: () => void;
}) {
  const { kind, initial } = draft;
  const path = '/p3/spaces/' + spaceId + '/records';
  const { busy, error, request, run } = useRecord(path);
  const [clientId] = useState(randomUUID);
  const [confirmedRoster] = useState(rosterVersion);
  const [body, setBody] = useState(initial?.body ?? '');
  const [ids, setIds] = useState(initial?.memberIds?.filter((id) => people.some((person) => person.id === id)) ?? []);
  const [media, setMedia] = useState<Media[]>(initial?.media ?? []);
  const [drafts, setDrafts] = useState<LocalMedia[]>([]);
  const [icon, setIcon] = useState<Decor>(initial?.icon ?? 'flower');
  const [x, setX] = useState(initial?.x ?? draft.x ?? 0);
  const [y, setY] = useState(initial?.y ?? draft.y ?? 0);
  const [sourceKind, setSourceKind] = useState<SourceKind | 'none'>(initial?.sourceKind ?? (kind === 'link' ? 'journal' : 'none'));
  const [sourceId, setSourceId] = useState(initial?.sourceId ?? '');
  const [confirmed, setConfirmed] = useState(false);
  const scopeChanged = (value: string[]) => { setIds(value); setConfirmed(false); };
  const hasSource = sourceKind !== 'none';
  const needsConfirm = !!ids.length || hasSource;
  const staleRoster = !!ids.length && rosterVersion !== confirmedRoster;
  const canSave = kind === 'contribution' ? !!(body.trim() || media.length || drafts.length)
    : hasSource ? !!sourceId : kind === 'decoration' && !!body.trim();
  const titles = { contribution: '补充这个瞬间', link: '关联生活记录', decoration: initial ? '编辑摆件' : '放一个摆件' };
  return (
    <Sheet title={titles[kind]} onClose={close}>
      {kind === 'contribution' && <>
        <Field title="这一刻的感受（可选）" multiline value={body} onChangeText={setBody} maxLength={1600} />
        <AssetPicker video limit={6} drafts={drafts} change={setDrafts} existing={media} updateExisting={setMedia} />
      </>}
      {kind === 'decoration' && <>
        <Field title={hasSource ? '摆件寄语（选填）' : '摆件名称'} value={body} onChangeText={setBody} maxLength={80} />
        <Choices labels={decorNames} value={icon} set={setIcon} />
        <Section title="摆放位置" />
        <Choices labels={{ '0':'第 1 行', '1':'第 2 行', '2':'第 3 行' }} value={String(y)} set={(value) => setY(Number(value))} />
        <Choices labels={{ '0':'第 1 列', '1':'第 2 列', '2':'第 3 列', '3':'第 4 列' }} value={String(x)} set={(value) => setX(Number(value))} />
      </>}
      {kind !== 'contribution' && <>
        <Section title={kind === 'link' ? '关联类型' : '选一段回忆做纪念物'} />
        <View style={[styles.row, { flexWrap:'wrap' }]}>
          {sourceOptions[kind].map((option) => <Button key={option} label={sourceLabels[option]}
            variant={option === sourceKind ? 'primary' : 'soft'} onPress={() => {
              if (option === sourceKind) return;
              setSourceId(''); setSourceKind(option); setConfirmed(false);
            }} />)}
        </View>
        {sourceKind !== 'none' && <Sources
          kind={sourceKind} selected={sourceId}
          fallback={initial?.sourceId === sourceId ? initial.sourceTitle : undefined}
          pick={(value) => { setSourceId(value); setConfirmed(false); }}
        />}
        <Text style={styles.muted}>有权查看原记录的成员才能打开此连结。</Text>
      </>}
      <Section title="谁可以查看" detail={ids.length ? '已选 ' + ids.length + ' 人' : '仅自己'} />
      <Text style={styles.muted}>逐位选择已加入的成员。新成员加入后需要你再次授权。</Text>
      {people.length > 1 && <Button label="选中当前成员" variant="soft" onPress={() => scopeChanged(people.map((person) => person.id))} />}
      {people.map((person) => <Check key={person.id} label={person.name} checked={ids.includes(person.id)}
        toggle={() => scopeChanged(ids.includes(person.id) ? ids.filter((id) => id !== person.id) : [...ids,person.id])} />)}
      {needsConfirm && <Check label="我确认本次范围及关联记录" checked={confirmed} toggle={() => setConfirmed(!confirmed)} />}
      {staleRoster && <Notice>成员名单刚刚变化，请退出编辑后重新选择成员。</Notice>}
      {!!error && <Notice>{error}</Notice>}
      <Button label={kind === 'contribution' ? '保存投稿' : '确认保存'} variant="gradient"
        disabled={!canSave || busy || staleRoster || (needsConfirm && !confirmed)}
        onPress={() => void run(async () => {
          const mediaIds = kind === 'contribution' ? await uploadAssets(request,media,drafts) : [];
          await request(path + (initial ? '/' + initial.id : ''), {
            method:initial ? 'PATCH' : 'POST', body:{
              clientId,kind,body,icon,x,y,sourceKind:hasSource ? sourceKind : null,
              sourceId:hasSource ? sourceId : null,mediaIds,memberIds:ids,confirmed,
              revision:initial?.revision,rosterVersion:confirmedRoster,
            },
          });
          saved();
        }, false)} />
    </Sheet>
  );
}

function Sources({ kind,selected,fallback,pick }: { kind: SourceKind; selected: string; fallback?: string | null; pick: (id: string) => void }) {
  const { data, error, load } = useRecord<{ sources: { id: string; title: string }[] }>('/p3/sources?kind=' + kind);
  return (
    <>
      {!!error && <Notice action="重试" onAction={() => void load()}>{error}</Notice>}
      {fallback && !data?.sources.some((item) => item.id === selected) && <Text style={styles.muted}>{fallback} · 已选择</Text>}
      {!data?.sources.length && !error && !fallback && <DataEmpty loading={!data}>暂无可以关联的原记录。</DataEmpty>}
      {data?.sources.map((item) => <ListRow key={item.id} title={item.title} detail={item.id === selected ? '已选择' : '选择'}
        onPress={() => pick(item.id)} />)}
    </>
  );
}

function Check({ label,checked,toggle }: { label: string; checked: boolean; toggle: () => void }) {
  return (
    <Pressable accessibilityRole="checkbox" accessibilityLabel={label} accessibilityState={{ checked }}
      onPress={toggle} style={[styles.row, { minHeight:44, paddingHorizontal:6 }]}>
      <Icon name={checked ? 'checkbox' : 'square-outline'} color={checked ? colors.accent : colors.quiet} />
      <Text style={[styles.body, styles.grow]}>{label}</Text>
    </Pressable>
  );
}
