import { router } from 'expo-router';
import type { Media } from '../moments/media';

export const spaceTitles = { relay: '瞬间共鸣', world: '共同世界' };
export const sceneNames = { garden: '薄荷花园', coast: '傍晚海岸', night: '暮色露台' };
export const sourceNames = {
  collaboration: '共创动态', journal: '共同日记', album: '共同相册',
  trip: '共同旅行', capsule: '时光胶囊', memory: '共同回忆', relay: '瞬间共鸣', world: '共同世界',
};
export const decorNames = { flower: '小花', lamp: '暖灯', cushion: '坐垫', frame: '相框', shell: '贝壳', star: '星星' };
export type SpaceKind = keyof typeof spaceTitles;
export type Scene = keyof typeof sceneNames;
export type SourceKind = keyof typeof sourceNames;
export type Decor = keyof typeof decorNames;
export type RecordKind = 'contribution' | 'link' | 'decoration';
export type Space = {
  id: string; kind: SpaceKind; ownerId: string; title: string; eventDay: string | null;
  scene: Scene; petName: string; greetedAt: string | null; revision: number; rosterVersion: number;
};
export type Person = { id: string; name: string; state: 'invited' | 'active' };
export type WorldRecord = {
  id: string; kind: RecordKind; authorId: string; author: string; body: string;
  sourceKind: SourceKind | null; sourceId: string | null; sourceTitle: string | null;
  icon: Decor | null; x: number | null; y: number | null; revision: number;
  createdAt: string; memberIds: string[] | null; media: Media[];
};
export type Page<T> = { records: T[]; next: number | null };

export function openRecord(kind: SourceKind, id: string) {
  switch (kind) {
    case 'relay':
    case 'world':
      return router.push({ pathname: '/world/[id]', params: { id } });
    case 'collaboration':
    case 'journal':
    case 'album':
      return router.push({ pathname: '/collection/[id]', params: { id, album: kind === 'album' ? '1' : undefined } });
    case 'trip':
    case 'capsule':
      return router.push({ pathname: '/life/project/[id]', params: { id, kind } });
    case 'memory':
      return router.push({ pathname: '/life/memories', params: { id } });
  }
}
