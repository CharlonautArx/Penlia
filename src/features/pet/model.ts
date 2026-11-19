export const foods = [
  { id: 'tea', name: '奶茶', emoji: '🧋', cost: 4, gain: 6, mood: '抱着奶茶慢慢喝' },
  { id: 'cake', name: '小蛋糕', emoji: '🍰', cost: 6, gain: 10, mood: '今天多一点甜' },
  { id: 'fries', name: '薯条', emoji: '🍟', cost: 7, gain: 12, mood: '和你们分享一把' },
  { id: 'pizza', name: '披萨', emoji: '🍕', cost: 8, gain: 14, mood: '吃饱了想伸个懒腰' },
  { id: 'burger', name: '汉堡', emoji: '🍔', cost: 10, gain: 17, mood: '满满的满足感' },
  { id: 'hotpot', name: '火锅', emoji: '🍲', cost: 12, gain: 21, mood: '热气腾腾，刚刚好' },
] as const;
export type Food = typeof foods[number];

export type Pet = {
  name?: string;
  proposal?: { name: string; at: number };
  energy: number;
  vitality: number;
  waiting?: { side: 'mine' | 'theirs'; at: number };
  seen: string[];
  last?: { kind: 'named' | 'chat' | 'food'; at: number; label?: string };
  mood?: string;
};
export type PetDocument = Record<string, Pet>;
type ChatEvent = { id: string; timestamp: number; mine: boolean; text: string };

export const emptyPet = (): Pet => ({ energy: 0, vitality: 0, seen: [] });

export function proposeName(pet: Pet, name: string, at: number) {
  const form = name.trim();
  if (!form || Array.from(form).length > 16 || form === pet.name || pet.proposal?.name === form) return pet;
  return { ...pet, proposal: { name: form, at } };
}

export function confirmName(pet: Pet, at: number, byOther: boolean) {
  if (!pet.proposal || !byOther) return pet;
  return { ...pet, name: pet.proposal.name, proposal: undefined, vitality: pet.name ? pet.vitality : 45,
    last: { kind: 'named' as const, at } };
}

export function creditConversation(pet: Pet, messages: ChatEvent[]) {
  if (!pet.name) return pet;
  const seen = new Set(pet.seen);
  let next = pet;
  for (const message of messages.slice(-160)) {
    if (!message.id.startsWith('simulated-') || !message.text.trim() || seen.has(message.id)) continue;
    seen.add(message.id);
    const side = message.mine ? 'mine' : 'theirs';
    if (next.waiting && next.waiting.side !== side) {
      next = { ...next, waiting: undefined, energy: Math.min(99, next.energy + 4),
        vitality: Math.min(100, next.vitality + 2), mood: undefined, last: { kind: 'chat', at: message.timestamp } };
    } else next = { ...next, waiting: { side, at: message.timestamp } };
  }
  return next === pet ? pet : { ...next, seen: [...seen].slice(-192) };
}

export function feedPet(pet: Pet, food: Food, at: number) {
  if (!pet.name || pet.energy < food.cost) return pet;
  return { ...pet, energy: pet.energy - food.cost, vitality: Math.min(100, pet.vitality + food.gain),
    mood: food.mood, last: { kind: 'food' as const, at, label: food.name } };
}

export function petMood(pet: Pet) {
  return pet.mood ?? (pet.vitality >= 80 ? '精神不错，想在你们身边转转' : pet.vitality >= 55 ? '被陪伴得刚刚好' : '安静待在你们身边');
}
