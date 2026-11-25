import assert from 'node:assert/strict';
import test from 'node:test';
import { orderFriendRequests } from '../src/features/friends/request-order.ts';

test('friend requests use application time within pending and processed rows', () => {
  const items = [
    { id: 'old-resolved', status: 'accepted', requestedAt: '2026-11-05T10:00:00Z', updatedAt: '2026-11-21T10:00:00Z' },
    { id: 'new-resolved', status: 'declined', requestedAt: '2026-11-17T10:00:00Z' },
    { id: 'old-pending', status: 'pending', requestedAt: '2026-11-01T10:00:00Z' },
    { id: 'new-pending', status: 'pending', updatedAt: '2026-11-07T10:00:00Z' },
  ];
  assert.deepEqual(orderFriendRequests(items).map(({ id }) => id), ['new-pending', 'old-pending', 'new-resolved', 'old-resolved']);
  assert.equal(items[0].id, 'old-resolved');
});
