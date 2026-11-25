'use strict';

// The reply hours of the Contact chat: 12 PM to 9 PM Pakistan time, every day, worked out in Asia/Karachi whatever the server or the
// visitor's time zone is. Pure functions, no database.

process.env.NODE_ENV = 'test';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { HOURS, evaluateHours, label12, zonedToUtc } = require('../config/contactChatHours');

// Pakistan time is UTC+5 all year. 12:00 in Karachi is 07:00 UTC; 21:00 is 16:00 UTC.
const at = (iso) => new Date(iso);

test('the configured hours are 12 PM to 9 PM Pakistan time, every day, in Asia/Karachi', () => {
  assert.equal(HOURS.timezone, 'Asia/Karachi');
  assert.deepEqual([...HOURS.days], [0, 1, 2, 3, 4, 5, 6]);
  assert.equal(HOURS.from, '12:00');
  assert.equal(HOURS.to, '21:00');
  assert.equal(Object.isFrozen(HOURS), true);
});

test('inside the hours', () => {
  for (const iso of ['2027-03-10T07:00:00Z', '2027-03-10T07:01:00Z', '2027-03-10T11:30:00Z', '2027-03-10T15:59:00Z', '2027-03-10T16:00:00Z']) {
    // 07:00Z is 12:00 PKT (open); 15:59Z is 20:59 PKT (open); 16:00Z is 21:00 PKT (closed): the last one is checked below
    const result = evaluateHours(at(iso));
    assert.equal(result.openNow, iso !== '2027-03-10T16:00:00Z', iso);
  }
});

test('the boundaries: 11:59 is closed, 12:00 is open, 20:59 is open, 21:00 is closed', () => {
  assert.equal(evaluateHours(at('2027-03-10T06:59:00Z')).openNow, false, '11:59 PKT');
  assert.equal(evaluateHours(at('2027-03-10T07:00:00Z')).openNow, true, '12:00 PKT');
  assert.equal(evaluateHours(at('2027-03-10T15:59:59Z')).openNow, true, '20:59:59 PKT');
  assert.equal(evaluateHours(at('2027-03-10T16:00:00Z')).openNow, false, '21:00 PKT');
});

test('outside the hours it says when the team is back: later today, tomorrow', () => {
  const morning = evaluateHours(at('2027-03-10T03:00:00Z')); // 08:00 PKT
  assert.equal(morning.openNow, false);
  assert.equal(morning.nextOpenAt, '2027-03-10T07:00:00.000Z', 'back at 12 PM the same day');
  assert.equal(morning.backText, 'We are back at 12 PM (Pakistan time)');
  assert.equal(morning.closesAt, null);

  const night = evaluateHours(at('2027-03-10T18:00:00Z')); // 23:00 PKT
  assert.equal(night.nextOpenAt, '2027-03-11T07:00:00.000Z', 'back tomorrow at 12 PM');
  assert.equal(night.backText, 'We are back tomorrow at 12 PM (Pakistan time)');

  const open = evaluateHours(at('2027-03-10T10:00:00Z'));
  assert.equal(open.nextOpenAt, null);
  assert.equal(open.closesAt, '2027-03-10T16:00:00.000Z', 'closes at 9 PM Pakistan time');
  assert.equal(open.backText, null);
});

test('the sentence is exactly the agreed one', () => {
  assert.equal(evaluateHours(at('2027-03-10T10:00:00Z')).text, 'We usually reply between 12 PM and 9 PM (Pakistan time)');
});

test('the day is the Pakistan day, not the server or visitor day: just after midnight in Pakistan is still the evening before in UTC', () => {
  // 2027-03-10 23:30 UTC is 2027-03-11 04:30 PKT: closed, back at 12 PM on the 11th (07:00 UTC the 11th).
  const result = evaluateHours(at('2027-03-10T23:30:00Z'));
  assert.equal(result.openNow, false);
  assert.equal(result.nextOpenAt, '2027-03-11T07:00:00.000Z');
  assert.equal(result.backText, 'We are back at 12 PM (Pakistan time)', 'the same Pakistan day, so no "tomorrow"');
});

test('a visitor in another time zone gets the same answer: the result depends only on the instant', () => {
  const instant = at('2027-03-10T07:30:00Z');
  const saved = process.env.TZ;
  try {
    for (const zone of ['UTC', 'America/Los_Angeles', 'Pacific/Auckland', 'Asia/Karachi', 'Europe/London']) {
      process.env.TZ = zone;
      const result = evaluateHours(instant);
      assert.equal(result.openNow, true, zone);
      assert.equal(result.closesAt, '2027-03-10T16:00:00.000Z', zone);
    }
  } finally {
    if (saved === undefined) delete process.env.TZ;
    else process.env.TZ = saved;
  }
});

test('other days and shapes: a day without hours is skipped, "to" must come after "from", times are written in 12 hour form', () => {
  const weekdays = { ...HOURS, days: [1, 2, 3, 4, 5] }; // Monday to Friday
  // Saturday 2027-03-13 10:00 PKT: closed, back Monday 12 PM PKT = Monday 07:00 UTC
  const saturday = evaluateHours(at('2027-03-13T05:00:00Z'), weekdays);
  assert.equal(saturday.openNow, false);
  assert.equal(saturday.nextOpenAt, '2027-03-15T07:00:00.000Z');
  assert.equal(saturday.backText, 'We are back on Monday at 12 PM (Pakistan time)');
  assert.throws(() => evaluateHours(new Date(), { ...HOURS, from: '21:00', to: '12:00' }));
  assert.throws(() => evaluateHours(new Date(), { ...HOURS, from: 'noon' }));
  assert.deepEqual(['00:00', '09:30', '12:00', '12:30', '15:05', '21:00', '23:59'].map(label12), ['12 AM', '9:30 AM', '12 PM', '12:30 PM', '3:05 PM', '9 PM', '11:59 PM']);
  assert.equal(zonedToUtc({ y: 2027, m: 3, d: 10, hh: 12, mm: 0 }, 'Asia/Karachi').toISOString(), '2027-03-10T07:00:00.000Z');
  // A zone with daylight saving works too (the code does not assume Pakistan's fixed offset).
  assert.equal(zonedToUtc({ y: 2027, m: 7, d: 1, hh: 12, mm: 0 }, 'Europe/London').toISOString(), '2027-07-01T11:00:00.000Z');
});
