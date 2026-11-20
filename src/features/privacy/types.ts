export const weekdays = [
  ['Mon', '周一'],
  ['Tue', '周二'],
  ['Wed', '周三'],
  ['Thu', '周四'],
  ['Fri', '周五'],
  ['Sat', '周六'],
  ['Sun', '周日'],
] as const;
export type Day = (typeof weekdays)[number][0];
export type Settings = {
  addPolicy: 'anyone' | 'none';
  phoneSearch: boolean;
  groupPolicy: 'friends' | 'none';
  profilePolicy: 'friends' | 'private';
  statusPolicy: 'friends' | 'private';
  momentScope: 'private' | 'friends' | 'circle';
  zone: string;
  quietHours: Partial<Record<Day, [string, string]>>;
  showResting: boolean;
  muteIndefinitely: boolean;
  muteUntil: string | null;
  allowSilent: boolean;
  version: number;
};
export type RelationGroup = { id: string; label: string; circle: boolean; memberIds: string[] };
export type ChatGroup = { id: string; name: string; ownerId: string; membersCanInvite: boolean; memberCount: number };
export type Invite = {
  id: string;
  groupId: string;
  name: string;
  inviter: string;
  memberCount: number;
  expiresAt: string;
};
export type Device = { id: string; nickname: string; current: boolean; firstSeen: string | null; expiresAt: string };
