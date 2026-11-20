import assert from 'node:assert/strict';
import test from 'node:test';
import { gatheringTimeChoices } from '../src/features/social/gathering-time.ts';

test('gathering presets use the local calendar, skip elapsed times and cross into next year', () => {
  const sunday = new Date(2026, 11, 27, 20);
  assert.deepEqual(
    Object.fromEntries(gatheringTimeChoices(sunday).map(({ label, value }) => [label, value])),
    {
      '明天 12:00': '2026-12-28 12:00',
      '明晚 19:00': '2026-12-28 19:00',
      '周六 14:00': '2027-01-02 14:00',
      '周日 18:00': '2027-01-03 18:00',
    },
  );
  const saturday = new Date(2026, 11, 26, 13);
  assert.equal(
    gatheringTimeChoices(saturday).find(({ label }) => label === '周六 14:00').value,
    '2026-12-26 14:00',
  );
  assert.equal(
    gatheringTimeChoices(saturday).find(({ label }) => label === '今晚 19:00').value,
    '2026-12-26 19:00',
  );
});
