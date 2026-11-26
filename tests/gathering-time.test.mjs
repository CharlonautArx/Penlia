import test from 'node:test';
import assert from 'node:assert/strict';
import { calendarDays, gatheringStart, localDay } from '../src/features/social/gathering-time.ts';

test('calendar aligns the first and last day and includes leap day', () => {
  const leap = calendarDays(2028, 1);
  assert.deepEqual(leap.slice(0, 4), [null, null, 1, 2]);
  assert.equal(leap.at(-1), 29);
  assert.equal(calendarDays(2027, 1).at(-1), 28);
});

test('activity times use the local time zone and 24:00 rolls to the next day', () => {
  const date = new Date(gatheringStart('2027-12-31 24:00'));
  assert.equal(localDay(date), '2028-01-01');
  assert.equal(date.getHours(), 0);
  const time = new Date(gatheringStart('2027-12-31 09:35'));
  assert.equal(localDay(time), '2027-12-31');
  assert.equal(time.getHours(), 9);
  assert.equal(time.getMinutes(), 35);
});

test('activity time rejects partial choices and invalid calendar dates', () => {
  for (const input of ['2027-12-31 ', ' 09:30', '2027-02-29 10:00', '2027-12-31 24:01', '2027-12-31 19:60'])
    assert.throws(() => gatheringStart(input));
});
