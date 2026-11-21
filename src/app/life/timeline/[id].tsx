import { useLocalSearchParams } from 'expo-router';
import { PrivateFeed } from '../../../features/moments/Feed';

export default function Timeline() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <PrivateFeed key={id} author={id} />;
}
