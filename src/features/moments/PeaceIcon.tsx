import Svg, { Path } from 'react-native-svg';
import { colors } from '../../theme';

export function PeaceIcon({ active }: { active?: boolean }) {
  return <Svg width={21} height={21} viewBox="0 0 24 24" accessible={false}>
    <Path d="M6.5 13.5 4.8 11a1.65 1.65 0 0 1 2.7-1.9l1.6 2.1-1.5-7a1.6 1.6 0 1 1 3.1-.7l1.7 6.5 2.7-6.4a1.6 1.6 0 1 1 3 1.2l-2.5 6 2 .8a3.1 3.1 0 0 1 1.7 4.1l-1.2 2.8a5.3 5.3 0 0 1-4.9 3.2h-1.5a5.5 5.5 0 0 1-4.6-2.4l-2-3a1.7 1.7 0 0 1 2.7-2l2 2.1m5.8-5.6-2.2-.8a1.9 1.9 0 0 0-1.6 3.3l2.1 1.3"
      fill={active ? '#FF768D26' : 'none'} stroke={active ? colors.danger : colors.ink}
      strokeWidth={1.55} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>;
}
