import { pinyin } from 'pinyin-pro';

import type { Relationship } from '../../services/api';

export const defaultGroupName = '我的好友';
export type FriendGroup = { id: string; name: string };
export type Directory = { remarks: Record<string, string>; groups: FriendGroup[]; membership: Record<string, string> };
export const emptyDirectory: Directory = { remarks: {}, groups: [], membership: {} };

export function displayName(friend: Pick<Relationship, 'userId' | 'name'>, directory: Directory) {
  return directory.remarks[friend.userId] || friend.name;
}

export function setRemark(directory: Directory, userId: string, input: string): Directory {
  const remarks = { ...directory.remarks };
  const remark = input.trim();
  if (remark) remarks[userId] = remark;
  else delete remarks[userId];
  return { ...directory, remarks };
}

export function saveGroup(directory: Directory, id: string, input: string): Directory {
  const name = input.trim();
  if (!name) throw new Error('请输入分组名称。');
  const key = name.normalize('NFKC').toLowerCase();
  if (key === defaultGroupName || directory.groups.some((group) => group.id !== id && group.name.normalize('NFKC').toLowerCase() === key)) {
    throw new Error('已有同名分组。');
  }
  const groups = directory.groups.some((group) => group.id === id)
    ? directory.groups.map((group) => group.id === id ? { id, name } : group)
    : [...directory.groups, { id, name }];
  return { ...directory, groups };
}

export function deleteGroup(directory: Directory, id: string): Directory {
  return {
    ...directory,
    groups: directory.groups.filter((group) => group.id !== id),
    membership: Object.fromEntries(Object.entries(directory.membership).filter(([, groupId]) => groupId !== id)),
  };
}

export function reorderGroup(directory: Directory, id: string, offset: -1 | 1): Directory {
  const index = directory.groups.findIndex((group) => group.id === id);
  const next = index + offset;
  if (index < 0 || next < 0 || next >= directory.groups.length) return directory;
  const groups = [...directory.groups];
  const [group] = groups.splice(index, 1);
  groups.splice(next, 0, group);
  return { ...directory, groups };
}

export function moveFriend(directory: Directory, userId: string, groupId: string | null): Directory {
  const membership = { ...directory.membership };
  if (groupId) {
    if (!directory.groups.some((group) => group.id === groupId)) throw new Error('这个分组已经不存在。');
    membership[userId] = groupId;
  } else {
    delete membership[userId];
  }
  return { ...directory, membership };
}

export function groupOf(directory: Directory, userId: string) {
  return directory.groups.find((group) => group.id === directory.membership[userId])?.id ?? null;
}

const latin = new Intl.Collator('en', { sensitivity: 'base' });

export function nameKey(name: string) {
  const normalized = name.trim().normalize('NFKC');
  const syllables = pinyin(normalized, { toneType: 'none', type: 'array', nonZh: 'consecutive', surname: 'head' });
  const key = syllables.join(' ').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  const letter = /^[a-z]/.test(key) ? key[0].toUpperCase() : '#';
  return { key, letter, rank: letter === '#' ? 26 : letter.charCodeAt(0) - 65 };
}

export function sortFriends(friends: readonly Relationship[], directory: Directory) {
  return friends.map((friend) => {
    const name = displayName(friend, directory);
    return { ...friend, displayName: name, ...nameKey(name) };
  }).sort((a, b) => a.rank - b.rank || latin.compare(a.key, b.key) ||
    latin.compare(a.username, b.username) || (a.userId < b.userId ? -1 : Number(a.userId > b.userId)));
}
