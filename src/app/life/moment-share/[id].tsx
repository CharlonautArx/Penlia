import { useLocalSearchParams } from 'expo-router';
import { MomentDetail } from '../../../features/moments/MomentDetail';

export default function SharedMomentTicket() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <MomentDetail path={'/moment-chat-shares/' + id} protectedReference />;
}
