import assert from 'node:assert/strict';
import test from 'node:test';
import { transitionCall } from '../src/features/calls/model.ts';
import { appendCallRecord, callCaption, recordCallEnd } from '../src/features/calls/record.ts';

test('call receipts use terminal events and perspective, with no ringing duration', () => {
  const ringing = { id: 'a', phase: 'outgoing', type: 'voice' };
  const context = { caller: 'me', recipient: 'peer', endedAt: 10000, simulated: true };
  for (const [action, mine, other] of [
    ['decline', '对方拒绝', '已拒绝'], ['end', '已取消', '已取消'], ['timeout', '未接听', '未接听'],
    ['fail', '通话中断', '通话中断'],
  ]) {
    const ended = transitionCall(ringing, { id: 'a', action });
    const receipt = recordCallEnd(ringing, ended, action, context);
    assert.equal(callCaption(receipt, 'me'), mine);
    assert.equal(callCaption(receipt, 'peer'), other);
    assert.equal(receipt.seconds, undefined);
    const saved = appendCallRecord([], receipt);
    assert.equal(appendCallRecord(saved, receipt), saved);
    assert.equal(recordCallEnd(ended, ended, action, context), undefined);
  }
  assert.equal(recordCallEnd(ringing, transitionCall(ringing, { id: 'other', action: 'end' }), 'end', context), undefined);
  assert.equal(recordCallEnd(ringing, transitionCall(ringing, { id: 'a', action: 'accept' }), 'accept', context), undefined);
});

test('connected and interrupted receipts retain measured time', () => {
  const active = { id: 'b', phase: 'active', type: 'video' };
  for (const [phase, action, caption] of [
    ['active', 'end', '通话时长 1:01:03'],
    ['reconnecting', 'fail', '通话中断 1:01:03'],
  ]) {
    const before = { ...active, phase };
    const receipt = recordCallEnd(before, transitionCall(before, { id: 'b', action }), action,
      { caller: 'c', recipient: 'd', endedAt: 5, elapsedMs: 3663900, simulated: true });
    assert.equal(callCaption(receipt, 'c'), caption);
  }
  assert.equal(callCaption({ outcome: 'elsewhere' }, 'd'), '已在其他设备接听');
});
