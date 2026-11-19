import type { PetDocument } from '../features/pet/model';

export function initialDemoPets(): PetDocument {
  return {
    'demo-xiaoman': {
      name: '小澄', energy: 18, vitality: 64, seen: [],
      last: { kind: 'chat', at: Date.now() - 2 * 3_600_000 },
    },
  };
}
