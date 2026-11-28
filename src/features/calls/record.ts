import type { CallEvent, CallKind, CallState } from './model.ts';

export type CallOutcome = 'completed' | 'cancelled' | 'declined' | 'missed' | 'interrupted' | 'elsewhere';
export type CallRecord = {
  id: string;
  kind: CallKind;
  caller: string;
  recipient: string;
  endedAt: number;
  outcome: CallOutcome;
  seconds?: number;
  simulated: boolean;
};

export function recordCallEnd(
  before: CallState, after: CallState, action: CallEvent['action'],
  context: Pick<CallRecord, 'caller' | 'recipient' | 'endedAt' | 'simulated'> & { elapsedMs?: number },
): CallRecord | undefined {
  if (before === after || (after.phase !== 'ended' && after.phase !== 'failed')) return;
  const { elapsedMs, ...identity } = context;
  if (!identity.caller || !identity.recipient || identity.caller === identity.recipient) return;
  const seconds = elapsedMs !== undefined && Number.isFinite(elapsedMs) && elapsedMs >= 0
    ? Math.floor(elapsedMs / 1000) : undefined;
  const outcome = action === 'decline' ? 'declined' : action === 'timeout' ? 'missed'
    : action === 'fail' || before.phase === 'reconnecting' ? 'interrupted'
    : seconds === undefined ? 'cancelled' : 'completed';
  return { ...identity, id: after.id, kind: after.type, outcome,
    ...(seconds === undefined ? {} : { seconds }) };
}

export function appendCallRecord(records: CallRecord[], record: CallRecord) {
  return records.some((entry) => entry.id === record.id) ? records : [...records, record];
}

export function callCaption(record: CallRecord, viewer: string) {
  const part = (value: number) => String(value).padStart(2, '0');
  const seconds = record.seconds;
  const duration = seconds === undefined ? '' : (seconds >= 3600 ? Math.floor(seconds / 3600) + ':' : '')
    + part(Math.floor(seconds / 60) % 60) + ':' + part(seconds % 60);
  switch (record.outcome) {
    case 'completed': return duration ? '通话时长 ' + duration : '通话已结束';
    case 'cancelled': return '已取消';
    case 'declined': return viewer === record.caller ? '对方拒绝' : '已拒绝';
    case 'missed': return '未接听';
    case 'interrupted': return duration ? '通话中断 ' + duration : '通话中断';
    case 'elsewhere': return '已在其他设备接听';
  }
}
