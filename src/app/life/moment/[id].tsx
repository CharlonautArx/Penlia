import { useLocalSearchParams } from 'expo-router';
import { MomentDetail } from '../../../features/moments/MomentDetail';

export default function SharedMoment() {
  const { id, original } = useLocalSearchParams<{ id: string; original?: string }>();
  return <MomentDetail path={'/moments/' + id + (original === '1' ? '/original' : '')} protectedReference={original === '1'} />;
}
