import { Image } from 'react-native';

const glint = require('../../assets/identity/glint.png');
const glintOn = require('../../assets/identity/glint-on.png');

export function Glint({ active = false, size = 25 }: { active?: boolean; size?: number }) {
  return <Image accessible={false} source={active ? glintOn : glint} style={{ width: size, height: size }} />;
}
