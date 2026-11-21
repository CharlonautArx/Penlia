import { activeMember, collectionReadable } from '../p1/collection-access.mjs';
import { member as lifeMember, opened } from '../p2/access.mjs';
import { memoryVisible } from '../p2/memories.mjs';
import { member } from './access.mjs';

const collection = (kind, predicate) => (viewer, id) =>
  `SELECT c.id,c.title FROM p1_collections c WHERE c.kind='${kind}' AND ${id ? 'c.id='+id+' AND ' : ''}${predicate('c', viewer)}`;
const p3Space = (kind) => (viewer, id) =>
  `SELECT s.id,s.title FROM p3_spaces s WHERE s.kind='${kind}' AND ${id ? 's.id='+id+' AND ' : ''}${member('s', viewer)}`;
const sources = {
  journal: collection('journal', activeMember),
  collaboration: collection('collaboration', collectionReadable),
  album: (v, id) => `SELECT c.id,c.title FROM p1_collections c
    WHERE ${id ? 'c.id='+id+' AND ' : ''}${collectionReadable('c',v)}`,
  trip: (v, id) => `SELECT s.id,s.title FROM p2_trips t JOIN p2_spaces s ON s.id=t.space_id
    WHERE t.completed_at IS NOT NULL AND ${id ? 's.id='+id+' AND ' : ''}${lifeMember('s', v)}`,
  capsule: (v, id) => `SELECT s.id,s.title FROM p2_capsules c JOIN p2_spaces s ON s.id=c.space_id
    WHERE ${opened('c')} AND ${id ? 's.id='+id+' AND ' : ''}${lifeMember('s', v)}`,
  memory: (v, id) => `SELECT m.id,m.title FROM p2_memories m
    WHERE ${id ? 'm.id='+id+' AND ' : ''}${memoryVisible('m', v)}`,
  relay: p3Space('relay'),
  world: p3Space('world'),
};

export const relaySources = ['collaboration', 'journal', 'world'];
export const worldSources = ['album', 'journal', 'trip', 'capsule', 'memory', 'relay'];

export const findSource = (kind, viewer, id) => sources[kind](viewer, id);

export function sourceMetadata(record, viewer) {
  // Return live metadata only when both the author and the reader can open the original.
  return `SELECT sc.title FROM (${Object.keys(sources).map((kind) =>
    `SELECT v.title FROM (${findSource(kind, viewer, record + '.source_id')}) v
    WHERE ${record}.source_kind='${kind}' AND EXISTS(
      SELECT 1 FROM (${findSource(kind, record + '.author_id', record + '.source_id')}) a)`,
  ).join(' UNION ALL ')}) sc`;
}
