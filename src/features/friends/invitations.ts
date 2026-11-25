import { randomUUID } from 'expo-crypto';
import { router } from 'expo-router';

export type FriendRequestStatus = 'pending' | 'accepted' | 'declined';
export type FriendRequest = {
  id: string;
  status: FriendRequestStatus;
  outgoing: boolean;
  name: string;
  verificationMessage: string;
  friendId?: string;
  avatar?: string;
  demoPortraitKey?: string;
};
export type PublicPerson = {
  id: string;
  name: string;
  bio: string;
  region: string;
  avatar?: string;
  demoPortraitKey?: string;
  isFriend: boolean;
};
export type FriendCode = { code: string; expiresAt: string };
export const requestStatuses: Record<FriendRequestStatus, string> = {
  pending: '待处理', accepted: '已接受', declined: '已拒绝',
};

let scan: { id: string; account: string; code: string } | undefined;
export function openScannedInvitation(account: string, code: string) {
  const id = randomUUID();
  scan = { id, account, code };
  router.push({ pathname: '/friend-invite', params: { ticket: id } });
}
export function scannedInvitation(ticket?: string, account?: string) {
  return scan && scan.id === ticket && scan.account === account ? scan.code : undefined;
}
export function clearScannedInvitation(ticket?: string) {
  if (scan?.id === ticket) scan = undefined;
}
