import { samplePlaces } from '../../demo/places';
import { isUiDemo } from '../../demo/mode';
import type { Place } from './places';

export function discoveryCatalog(): Place[] {
  return isUiDemo ? samplePlaces : [];
}
