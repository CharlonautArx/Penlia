import { useLocalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';

import { Empty, ListRow, Notice, Screen, Section, SettingGroup } from '../../components/ui';
import { isUiDemo } from '../../demo/mode';
import { MomentMediaTile, type Media } from '../../features/moments/media';
import { ReportLines } from '../../features/social/ReportSheet';
import { back, formatTime, useRecord } from '../../features/social/ui';
import { useLocalPhotoUri } from '../../features/space/media';
import { space, styles } from '../../theme';

type Detail = {
  target?: string;
  status: 'pending' | 'confirmed' | 'dismissed';
  submittedAt: string;
  explanation?: string;
  photos?: (Media & { photoId?: string })[];
  lines?: { id: string; author: string; content: string; sentAt?: string; attachments?: number }[];
};
const statuses = { pending: '等待审核', confirmed: '审核已确认违规', dismissed: '审核已结束' };

function Photo({ item, reportId }: { item: NonNullable<Detail['photos']>[number]; reportId: string }) {
  const uri = useLocalPhotoUri(item.photoId);
  return <MomentMediaTile item={{ ...item, demoUri: uri }} boundaryId={reportId} />;
}

export default function ReportDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const record = useRecord<Detail>('/p1/boundary/' + id);
  const data = record.data;
  return <Screen title="举报详情" back={back}>
    {!!record.error && <Notice action="重试" onAction={() => void record.load()}>{record.error}</Notice>}
    {!data && !record.error && <Empty busy>正在读取举报详情…</Empty>}
    {data && <>
      <SettingGroup>
        <ListRow title="举报对象" detail={data.target ?? '历史记录未保存举报对象'} />
        <ListRow title="举报时间" detail={formatTime(data.submittedAt)} />
        <ListRow title="处理状态" detail={isUiDemo ? '保存在本机' : statuses[data.status]} separator={false} />
      </SettingGroup>
      <Section title="举报所选消息" />
      {data.lines?.length ? <ReportLines lines={data.lines} /> : <Text style={styles.muted}>这条历史记录未保存消息原文。</Text>}
      <Section title="补充说明" />
      <Text style={styles.body}>{data.explanation || '未填写'}</Text>
      {!!data.photos?.length && <>
        <Section title="举报配图" />
        <View style={[styles.row, { gap: space.xs, flexWrap: 'wrap' }]}>
          {data.photos.map((item) => <Photo key={item.id} item={item} reportId={id} />)}
        </View>
      </>}
    </>}
  </Screen>;
}
