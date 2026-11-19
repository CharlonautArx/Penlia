import type { ImageSourcePropType } from 'react-native';

import { isUiDemo } from './mode';

const portraits: Record<string, ImageSourcePropType> = {
  xiaoman: require('../../assets/demo/person-1.jpg'),
  azhu: require('../../assets/demo/person-2.jpg'),
  linlu: require('../../assets/demo/person-3.jpg'),
  shenyan: require('../../assets/demo/person-4.jpg'),
  qinghe: require('../../assets/demo/person-5.jpg'),
  chenmo: require('../../assets/demo/person-6.jpg'),
  taoxi: require('../../assets/demo/person-7.jpg'),
  beiyang: require('../../assets/demo/person-8.jpg'),
};

export function demoPortrait(username: string) {
  return isUiDemo ? portraits[username] : undefined;
}

const momentPhotos = {
  alley: require('../../assets/demo/alley.jpg'),
  pottery: require('../../assets/demo/pottery.jpg'),
};

export function demoMomentPhoto(photo: keyof typeof momentPhotos) {
  return isUiDemo ? momentPhotos[photo] : undefined;
}

const spacePhotos: Record<string, ImageSourcePropType> = {
  alley: require('../../assets/demo/alley.jpg'),
  pottery: require('../../assets/demo/pottery.jpg'),
  coffee: require('../../assets/demo/coffee.jpg'),
  cinema: require('../../assets/play/cinema.jpg'),
};

export function spaceSamplePhoto(id: string) {
  return isUiDemo ? spacePhotos[id] : undefined;
}
