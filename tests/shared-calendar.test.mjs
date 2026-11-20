import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sharedFreeWindows } from '../server/p2/calendar.mjs';

test('free-time windows union overlapping busy periods then clip the requested range', () => {
  const hour = (t) => new Date('2026-11-20T' + t + 'Z');
  const event = (s, e) => ({ startsAt: hour(s), endsAt: hour(e) });
  const booked = [
    event('10:45:00', '11:20:00'),
    event('07:50:00', '08:15:00'),
    event('11:15:00', '12:00:00'),
    event('12:15:00', '13:30:00'),
  ];
  assert.deepEqual(sharedFreeWindows(hour('08:00:00'), hour('13:00:00'), booked), [
    event('08:15:00', '10:45:00'),
  ]);
  assert.deepEqual(sharedFreeWindows(hour('08:00:00'), hour('09:00:00'), []), [
    event('08:00:00', '09:00:00'),
  ]);
});
