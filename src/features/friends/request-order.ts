type RequestOrder = { id: string; status: string; requestedAt?: string; updatedAt?: string };

export function orderFriendRequests<T extends RequestOrder>(requests: readonly T[]) {
  const time = ({ requestedAt, updatedAt }: T) => Date.parse(requestedAt ?? updatedAt ?? '') || 0;
  return [...requests].sort((a, b) => Number(b.status === 'pending') - Number(a.status === 'pending')
    || time(b) - time(a) || b.id.localeCompare(a.id));
}
