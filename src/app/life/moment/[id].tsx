import { useLocalSearchParams } from 'expo-router';
import { MomentDetail } from '../../../features/moments/MomentDetail';

export default function SharedMoment() {
  const { id, original, compose, reply } = useLocalSearchParams<{ id: string; original?: string; compose?: string; reply?: string }>();
  return <MomentDetail path={'/moments/' + id + (original === '1' ? '/original' : '')} compose={compose} replyId={reply} protectedReference={original === '1'} />;
}
