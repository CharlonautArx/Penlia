import type { ImageSourcePropType } from 'react-native';

export type OfficialSticker = {
  id: string;
  label: string;
  category: 'faces' | 'other';
  source: ImageSourcePropType;
};
