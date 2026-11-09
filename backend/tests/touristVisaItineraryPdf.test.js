'use strict';

// The itinerary PDF (step 8h-3) without a database: how the stored text is read (a day or a week for each block, optional clock times), the grid of
// details, the layout plan (no block is split, the fill rule, the density), and the file read back with pdfjs: the design, the words (the stored
// words and the furniture and nothing else), the margins, long lines, plain typography, the refusal of text the fonts cannot print, the draft
// mark and the palette. Made-up data only.

process.env.NODE_ENV = 'test';
process.env.FIELD_ENCRYPTION_KEY = require('node:crypto').randomBytes(32).toString('base64');

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const itinerary = require('../utils/touristVisaItineraryPdf');
const config = require('../config/touristVisaPdf');
const engine = require('../shared/tourist-visa/engine');
const { buildItineraryFacts } = require('../shared/tourist-visa/itineraryFacts');
const { buildSkeleton } = require('../utils/touristVisaItinerarySkeleton');
const { buildTemplateDescriptions } = require('../utils/touristVisaItineraryTemplate');
const { assembleItinerary, britishSpelling } = require('../utils/touristVisaItineraryChecks');
const { fullAnswers } = require('./helpers/touristVisaFixtures');
const { inspectPdf, linesOf } = require('./helpers/pdfInspect');

const C = String.fromCodePoint;
const { ITINERARY_PAGE, BRAND, TEXT } = config;
const MARGIN = ITINERARY_PAGE.margin;
const NAME = 'Aisha Khan-Reynolds';
const REFERENCE = 'TV-K7M3QD9R';
const ARABIC = C(0x645, 0x631, 0x62d, 0x628, 0x627);
const DISPLAY = /CormorantGaramond/;

/** A real template itinerary for a stay of `nights` nights (the stored structure), with its facts. */
function made(nights, { places = 'We would like to see London, then Bath and Edinburgh.', stay = 'family_friends' } = {}) {
  const a = fullAnswers('Aisha', 'Khan-Reynolds', 'a@example.com');
  const dep = new Date(Date.UTC(2027, 2, 15 + nights)).toISOString().slice(0, 10);
  Object.assign(a, { q1_5: places, q1_6: '2027-03-15', q1_7: dep, q6_7: false, q6_7x: stay });
  const facts = buildItineraryFacts(engine.config, a, { submittedAt: new Date('2026-11-03T10:00:00Z') });
  const skeleton = buildSkeleton(facts.raw.arrival, facts.raw.departure);
  assert.equal(skeleton.ok, true);
  const text = assembleItinerary(skeleton.blocks, buildTemplateDescriptions(facts, skeleton).map(britishSpelling));
  return { text, facts, skeleton, details: itinerary.detailsOf(facts, NAME) };
}

const modelOf = (text, over = {}) => itinerary.buildItineraryModel({ text, reference: REFERENCE, applicantName: NAME, details: [{ label: 'Traveller', value: NAME }], draft: false, ...over });
const render = (model) => itinerary.renderItineraryPdf(model);
const pdfOf = async (text, over) => inspectPdf(await render(modelOf(text, over)));
const tokens = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}£'-]+/gu, ' ').split(/\s+/).filter(Boolean).sort();
const top = (page, item) => page.height - item.y; // from the top of the page, in points
/** The lines of a page without the turned band labels (which the reader would otherwise merge into the text lines they lie beside). */
const plainLines = (page) => linesOf(page.items.filter((i) => i.angle === 0));
/** The words of a turned label ("DAY 1", "15 MAR"): each word is a piece of text turned on its side; the items of the words in order, or null if one is missing. */
const turned = (page, label, inside = () => true) => {
  const [first, ...rest] = label.split(' ');
  // The words of one label lie on one vertical line (the same x), one above the other: a word of another label (the same word can be in two) does not count.
  for (const start of page.items.filter((i) => i.str === first && i.angle === 90 && inside(i))) {
    const found = [start];
    for (const word of rest) {
      const next = page.items.find((i) => i.str === word && i.angle === 90 && Math.abs(i.x - start.x) < 0.6 && i.y > found[found.length - 1].y);
      if (!next) break;
      found.push(next);
    }
    if (found.length === 1 + rest.length) return found;
  }
  return null;
};

/** A stored itinerary of `days` days, written by hand: the text of each day is `text(i)`. */
const written = (days, text = (i) => `A short description of the plan for day ${i + 1}.`) => {
  const blocks = Array.from({ length: days }, (_, i) => `Day ${i + 1}, ${['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][i % 7]} ${15 + i} March 2027\n${text(i)}`);
  return ['Proposed itinerary', 'This is a proposed plan for the visit, and it may change.', ...blocks].join('\n\n');
};

// ---------------------------------------------------------------------------
// The stored text, as it is
// ---------------------------------------------------------------------------

test('the real structure of a stored itinerary is read as it is: the title, the note, and a heading with one description line for each day', () => {
  const { text, skeleton } = made(4);
  const parsed = itinerary.parseItinerary(text);
  assert.equal(parsed.title, 'Proposed itinerary');
  assert.deepEqual(parsed.note, ['This is a proposed plan for the visit, and it may change.']);
  assert.equal(parsed.blocks.length, skeleton.blocks.length);
  assert.equal(parsed.blocks.length, 5);
  parsed.blocks.forEach((block, i) => {
    assert.equal(block.kind, 'day');
    assert.equal(block.heading, skeleton.blocks[i].heading);
    assert.equal(block.main, `DAY ${i + 1}`);
    assert.match(block.title, /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday) \d{1,2} March 2027$/);
    assert.equal(block.lines.length, 1, 'one description line');
  });
  assert.equal(parsed.blocks[0].sub, '15 MAR');
  // Nothing is lost or added: the parts put back together are the stored text.
  const again = [parsed.title, parsed.note.join('\n'), ...parsed.blocks.map((b) => [b.heading, ...b.lines].join('\n'))].join('\n\n');
  assert.equal(again, text);
});

test('a long stay is written a week at a time: the heading is a range of dates, a block of one day is just that date, and each is read as it is', () => {
  const { text, skeleton } = made(30);
  assert.equal(skeleton.mode, 'weeks');
  const parsed = itinerary.parseItinerary(text);
  assert.equal(parsed.blocks.length, skeleton.blocks.length);
  const first = parsed.blocks[0];
  assert.equal(first.heading, 'Monday 15 March 2027 to Sunday 21 March 2027');
  assert.deepEqual([first.main, first.sub, first.title], ['15 MAR', 'TO 21 MAR', 'Monday 15 March 2027 to Sunday 21 March 2027']);
  const single = itinerary.headingParts('Monday 15 March 2027');
  assert.deepEqual(single, { main: '15 MAR', sub: '2027', title: 'Monday 15 March 2027' });
  assert.equal(parsed.blocks.every((b) => b.kind === 'day'), true);
  const again = [parsed.title, parsed.note.join('\n'), ...parsed.blocks.map((b) => [b.heading, ...b.lines].join('\n'))].join('\n\n');
  assert.equal(again, text);
});

test('a hand-edited itinerary is read too: no title, a paragraph that is not a heading, a heading with no text, a clock time at the start of a line', () => {
  const edited = ['Day 1, Monday 15 March 2027', '09:30 Breakfast and a walk', '2.15 pm - Museum visit', 'A line with no time', '', 'A note the administrator added.', '', 'Day 2, Tuesday 16 March 2027'].join('\n');
  const parsed = itinerary.parseItinerary(edited);
  assert.equal(parsed.title, null);
  assert.equal(parsed.note, null);
  assert.deepEqual(parsed.blocks.map((b) => b.kind), ['day', 'note', 'day']);
  assert.deepEqual(parsed.blocks[1].lines, ['A note the administrator added.']);
  assert.deepEqual(parsed.blocks[2].lines, [], 'a heading with no text is a block with no rows');
  const model = modelOf(edited);
  assert.deepEqual(model.blocks[0].rows, [{ time: '09:30', text: 'Breakfast and a walk' }, { time: '2.15 pm', text: 'Museum visit' }, { time: '', text: 'A line with no time' }]);
  assert.equal(model.hasTimes, true);
  assert.equal(modelOf(written(2)).hasTimes, false, 'a stored itinerary has no clock times');
});

test('a clock time is only read at the start of a line, followed by text; numbers and words that are not times are left alone', () => {
  const t = itinerary.splitTime;
  assert.deepEqual(t('09:30 Breakfast'), { time: '09:30', text: 'Breakfast' });
  assert.deepEqual(t('9am - Walk'), { time: '9am', text: 'Walk' });
  assert.deepEqual(t('10.15 pm: Dinner'), { time: '10.15 pm', text: 'Dinner' });
  assert.deepEqual(t('18:00 - 20:00 Show'), { time: '18:00', text: '20:00 Show' });
  for (const none of ['2027 plans', '12 rooms are booked', '9 people will travel', 'Breakfast at 09:30', '09:30', 'Arrive 09:30', '25:00 never']) assert.deepEqual(t(none), { time: '', text: none }, none);
});

test('the grid of details has only the fields the data has: nothing is invented, and a field the answers do not hold is not there', () => {
  const full = itinerary.detailsOf(made(4).facts, NAME);
  assert.deepEqual(full.map((d) => d.label), ['Traveller', 'Destination', 'Arrival', 'Departure', 'Length of stay', 'Staying']);
  assert.deepEqual(full.find((d) => d.label === 'Destination').value, 'London, Bath, Edinburgh');
  assert.equal(full.find((d) => d.label === 'Length of stay').value, '4 nights');
  assert.equal(full.find((d) => d.label === 'Staying').value, 'With family or friends');
  const noPlaces = itinerary.detailsOf(made(4, { places: 'A relaxed holiday.' }).facts, NAME);
  assert.equal(noPlaces.some((d) => d.label === 'Destination'), false, 'no place named, no destination');
  assert.equal(itinerary.detailsOf(made(0).facts, NAME).some((d) => d.label === 'Length of stay'), false, 'a day trip has no nights');
  assert.deepEqual(itinerary.detailsOf(null, ''), []);
  assert.deepEqual(itinerary.detailsOf(null, NAME), [{ label: 'Traveller', value: NAME }]);
  assert.equal(modelOf(written(1), { details: [{ label: 'Traveller', value: '  ' }, { label: 'Arrival', value: '15 March 2027' }] }).details.length, 1);
});

// ---------------------------------------------------------------------------
// The plan: density, no split block, the page-balancing rule
// ---------------------------------------------------------------------------

test('a short trip is one complete page and a long one flows: 1 to 3 days are one page, and the type is set by the number of days', () => {
  const byDays = {};
  for (const days of [1, 2, 3, 5, 8, 14, 20]) {
    const plan = itinerary.planItinerary(modelOf(written(days)));
    byDays[days] = plan;
  }
  for (const days of [1, 2, 3]) assert.equal(byDays[days].pages.length, 1, `${days} days are one page`);
  assert.equal(byDays[1].density, 'grand', 'a day trip is set largest');
  assert.equal(byDays[2].density, 'grand');
  assert.equal(byDays[3].density, 'comfortable', 'three days are set comfortably, and fit one page');
  assert.ok(byDays[14].pages.length >= 2 && byDays[14].pages.length <= 4, `14 days: ${byDays[14].pages.length} pages`);
  assert.equal(byDays[14].density, 'compact', 'a long trip is set compact');
  assert.ok(byDays[20].pages.length > byDays[5].pages.length);
  assert.ok(byDays[5].pages.length <= 2, `5 short days: ${byDays[5].pages.length} pages`);
});

test('no block is split or lost: every day is on exactly one page, in order, whatever the number of days', () => {
  for (const days of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 14, 16, 20]) {
    const plan = itinerary.planItinerary(modelOf(written(days)));
    const placed = plan.pages.flatMap((p) => p.blocks.map((slot) => slot.m.block.heading));
    assert.deepEqual(placed, Array.from({ length: days }, (_, i) => modelOf(written(days)).blocks[i].heading), `${days} days: every block once and in order`);
    for (const page of plan.pages) {
      const room = page.index === 0 ? page.room : page.room;
      const last = page.blocks[page.blocks.length - 1];
      if (last) assert.ok(last.y + last.height <= plan.pages[0].blocks[0].y + (page.index === 0 ? page.room : 0) + 700, 'on the page');
      for (let i = 1; i < page.blocks.length; i += 1) assert.ok(page.blocks[i].y >= page.blocks[i - 1].y + page.blocks[i - 1].height, `${days} days: blocks do not overlap`);
      assert.ok(room > 0);
    }
  }
});

// A greedy count of the pages, written here on its own (not the module's): the blocks in order, each page holding as many as fit.
const countPages = ({ heights, gap, room1, room2 }) => {
  let pages = 1;
  let room = room1;
  let used = 0;
  let count = 0;
  for (const h of heights) {
    const add = (count ? gap : 0) + h;
    if (used + add <= room + 1e-6) { used += add; count += 1; continue; }
    pages += 1; room = room2; used = h; count = 1;
  }
  return pages;
};
const LONG_TEXT = (i) => `A description of the plan for day ${i + 1}, long enough to take more than one line on the page so that the blocks differ in height.`;

test('THE PAGE-BALANCING RULE: the fewest pages the blocks can take at their smallest size, and within them the largest block size at which every day still fits', () => {
  for (const days of [1, 2, 3, 4, 5, 6, 8, 10, 12, 14, 16, 19, 22, 25, 28, 30]) {
    for (const text of [undefined, LONG_TEXT]) {
      const plan = itinerary.planItinerary(modelOf(written(days, text)));
      const label = `${days} days${text ? ' (long)' : ''}`;
      // 1. No fewer pages is possible: at the smallest size the blocks need exactly this many.
      assert.equal(countPages(plan.sizesAt(0)), plan.pages.length, `${label}: the smallest number of pages is ${plan.pages.length}`);
      assert.equal(plan.minPages, plan.pages.length);
      // 2. The size used fits in those pages, and a little larger would not (unless it is the largest size there is).
      assert.ok(countPages(plan.sizesAt(plan.scale)) <= plan.pages.length, `${label}: the chosen size fits`);
      if (plan.scale < 1) assert.ok(countPages(plan.sizesAt(Math.min(1, plan.scale + 0.02))) > plan.pages.length, `${label}: a larger size (${plan.scale.toFixed(2)} + 0.02) would need another page`);
      assert.ok(plan.scale >= 0 && plan.scale <= 1);
      // 3. Every page holds whole blocks within its room, and the blocks are one size (the same scale) on every page.
      plan.pages.forEach((page) => {
        assert.ok(page.fill <= 1.0001, `${label}: page ${page.index + 1} overflows`);
        page.blocks.forEach((slot) => assert.equal(slot.sp.u, plan.scale));
      });
    }
  }
});

test('the pages are balanced: no page of a trip that needs several is left mostly empty, and the last page is about as full as the others', () => {
  for (const days of [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30]) {
    for (const text of [undefined, LONG_TEXT]) {
      const plan = itinerary.planItinerary(modelOf(written(days, text)));
      const label = `${days} days${text ? ' (long)' : ''}`;
      if (plan.pages.length < 2) continue;
      const fills = plan.pages.map((p) => p.fill);
      fills.forEach((f, p) => assert.ok(f >= 0.75, `${label}: page ${p + 1} of ${fills.length} is only ${f.toFixed(2)} full`));
      assert.ok(fills[fills.length - 1] >= 0.8 * Math.max(...fills), `${label}: the last page (${fills[fills.length - 1].toFixed(2)}) is much emptier than the fullest (${Math.max(...fills).toFixed(2)})`);
      // The days per page differ by at most two from page 2 on (the first page holds fewer, under the title and the details).
      const counts = plan.pages.slice(1).map((p) => p.count);
      assert.ok(Math.max(...counts) - Math.min(...counts) <= 2, `${label}: the days per page are ${plan.pages.map((p) => p.count).join('/')}`);
    }
  }
});

test('19 days take 3 well-filled pages, not 4: the real itineraries of 1, 3, 5, 10, 14 and 19 days, with the days on each page', () => {
  const expected = { 0: [1], 2: [3], 4: [2, 3], 9: [4, 6], 13: [6, 8], 18: [5, 7, 7] };
  for (const [nights, counts] of Object.entries(expected)) {
    const { text, details } = made(Number(nights));
    const plan = itinerary.planItinerary(modelOf(text, { details }));
    assert.deepEqual(plan.pages.map((p) => p.count), counts, `${Number(nights) + 1} days`);
    if (plan.pages.length > 1) plan.pages.forEach((p) => assert.ok(p.fill >= 0.8, `${Number(nights) + 1} days: page ${p.index + 1} is ${p.fill.toFixed(2)} full`));
  }
  // 28 days, written by hand (the generator writes a week at a time beyond 21 nights): four pages, evenly shared.
  const plan28 = itinerary.planItinerary(modelOf(written(28, LONG_TEXT)));
  assert.equal(plan28.pages.length, 4);
  assert.ok(Math.max(...plan28.pages.map((p) => p.count)) - Math.min(...plan28.pages.slice(1).map((p) => p.count)) <= 2);
});

test('the block size stays between the smallest and the largest the density allows, and the type sizes of the tiers are kept', () => {
  for (const days of [1, 2, 3, 5, 9, 10, 14, 19, 28]) {
    const plan = itinerary.planItinerary(modelOf(written(days, LONG_TEXT)));
    const d = itinerary.DENSITIES[plan.density];
    const sp = plan.spacing;
    assert.ok(sp.pad >= d.tight.pad - 1e-9 && sp.pad <= d.pad + d.cap.pad / 2 + 1e-9, `${days} days: padding ${sp.pad}`);
    assert.ok(sp.gap >= d.tight.gap - 1e-9 && sp.gap <= d.gap + d.cap.gap + 1e-9, `${days} days: gap ${sp.gap}`);
    assert.ok(sp.rowPad >= d.tight.rowPad - 1e-9 && sp.rowPad <= d.rowPad + d.cap.row / 2 + 1e-9);
    // The smallest size is still a clear, readable block: type not under 10 pt, a line at least 1.3 times the size, a band that holds its label.
    assert.ok(d.text >= 10 && d.pitch / d.text >= 1.3 && d.tight.minBlock >= 50, `${plan.density} type`);
  }
  assert.deepEqual([1, 2, 3, 9, 10].map((n) => itinerary.planItinerary(modelOf(written(n))).density), ['grand', 'grand', 'comfortable', 'comfortable', 'compact']);
});

// ---------------------------------------------------------------------------
// The file: the design, 1 day to 14 days
// ---------------------------------------------------------------------------

test('a one-day trip is a designed, complete page: the title in the display face, the kicker and the note, the grid of details, one day block with its band, and the slim footer', async () => {
  const { text, details } = made(0, { places: 'We would like to see London.' });
  const pdf = await pdfOf(text, { details });
  assert.equal(pdf.numPages, 1);
  const page = pdf.pages[0];
  assert.ok(Math.abs(page.width - 595.28) < 0.5 && Math.abs(page.height - 841.89) < 0.5, 'A4');
  const title = page.items.find((i) => i.str === 'Travel itinerary');
  assert.ok(title && DISPLAY.test(title.font) && title.size >= 40, `a large title in the display face: ${title && title.size}`);
  assert.ok(Math.abs(title.x - MARGIN) < 1.5);
  const kicker = page.items.find((i) => i.str === 'Proposed itinerary');
  assert.ok(kicker && kicker.size < 11 && kicker.y > title.y, 'the stored title is the small kicker above');
  const note = page.items.find((i) => i.str === 'This is a proposed plan for the visit, and it may change.');
  assert.ok(note && note.y < title.y && /Italic/.test(note.font), 'the stored note, in italic, under the title');
  for (const label of ['Traveller', 'Destination', 'Arrival', 'Departure', 'Staying']) assert.ok(page.items.some((i) => i.str === label && i.size < 9), `grid label ${label}`);
  assert.equal(page.items.some((i) => i.str === 'Length of stay'), false, 'a day trip has no nights');
  assert.ok(page.items.some((i) => i.str === NAME) && page.items.some((i) => i.str === 'London') && page.items.some((i) => i.str === '15 March 2027'));
  assert.ok(turned(page, 'DAY 1'), 'the label is turned on its side');
  assert.ok(turned(page, '15 MAR'), 'the date under it');
  const dayTitle = page.items.find((i) => i.str === 'Monday 15 March 2027');
  assert.ok(dayTitle && /SemiBoldItalic/.test(dayTitle.font) && dayTitle.size >= 20, 'the title of the day in the italic display face');
  const row = page.lines.find((l) => /^A single day/.test(l.text));
  assert.ok(row && row.items.every((i) => /SourceSerif4/.test(i.font)));
  const footer = page.items.filter((i) => i.y < MARGIN + ITINERARY_PAGE.footer.height).map((i) => i.str).join(' ');
  assert.match(footer, new RegExp(`${REFERENCE} . Prepared by Wiser Consulting`));
  assert.ok(footer.includes('Page 1 of 1'));
  assert.equal(pdf.text.includes('not an official'), false);
  assert.equal((pdf.raw.match(/\/Subtype\s*\/Image/g) || []).length, 0, 'no logo or picture');
});

test('1, 3, 5 and 14 days: each day\'s band, title and description are on one page and inside its block, in order; later pages have the compact header; every page has the footer', async () => {
  for (const nights of [0, 2, 4, 13]) {
    const { text, details } = made(nights);
    const model = modelOf(text, { details });
    const plan = itinerary.planItinerary(model);
    const pdf = await inspectPdf(await render(model));
    assert.equal(pdf.numPages, plan.pages.length, `${nights + 1} days: the file has the planned pages`);
    let day = 0;
    plan.pages.forEach((planned, p) => {
      const page = pdf.pages[p];
      for (const slot of planned.blocks) {
        day += 1;
        const block = slot.m.block;
        const inside = (item) => top(page, item) >= slot.y - 1 && top(page, item) <= slot.y + slot.height + 1;
        const label = turned(page, block.main, inside);
        const title = page.items.find((i) => i.str === block.title && /Italic/.test(i.font) && inside(i));
        assert.ok(label, `day ${day}: the band label is in its block on page ${p + 1}`);
        assert.ok(title, `day ${day}: the title is in its block`);
        for (const row of slot.m.rows) {
          // (the same sentence can be in several days: the one inside this block is the one that counts)
          const line = plainLines(page).find((l) => l.text.startsWith(row.lines[0]) && l.items.every((i) => /SourceSerif4/.test(i.font)) && top(page, l.items[0]) >= slot.y && top(page, l.items[0]) <= slot.y + slot.height);
          assert.ok(line, `day ${day}: the description is in its block`);
        }
      }
      const footer = page.items.filter((i) => i.y < MARGIN + ITINERARY_PAGE.footer.height).map((i) => i.str).join(' ');
      assert.ok(footer.includes(`Page ${p + 1} of ${pdf.numPages}`) && footer.includes(REFERENCE) && footer.includes('Prepared by Wiser Consulting'));
      if (p > 0) {
        const head = page.items.filter((i) => top(page, i) < MARGIN + ITINERARY_PAGE.header.height + 4);
        assert.ok(head.some((i) => i.str === 'Travel itinerary' && DISPLAY.test(i.font) && i.size < 20), `page ${p + 1}: the compact header`);
        assert.ok(head.some((i) => i.str === NAME));
      } else {
        assert.ok(page.items.some((i) => i.str === 'Travel itinerary' && i.size >= 40));
      }
    });
    assert.equal(day, nights + 1, 'every day was placed');
  }
});

test('the days alternate the two band colours, and the first is the brand green (read from the file\'s colour operators)', async () => {
  const { text } = made(4);
  const buffer = await render(modelOf(text));
  const inflate = require('node:zlib').inflateSync;
  const raw = buffer.toString('latin1');
  const streams = [];
  const re = /stream\r?\n/g;
  let m;
  while ((m = re.exec(raw))) {
    const start = m.index + m[0].length;
    const end = raw.indexOf('endstream', start);
    try { streams.push(inflate(Buffer.from(raw.slice(start, end), 'latin1')).toString('latin1')); } catch { /* not a deflate stream */ }
  }
  const content = streams.filter((s) => / scn\b/.test(s)).join('\n');
  const rgb = (hex) => [1, 3, 5].map((i) => (parseInt(hex.slice(i, i + 2), 16) / 255).toFixed(3)).join(' ');
  const order = [...content.matchAll(/([\d.]+) ([\d.]+) ([\d.]+) scn\b/g)].map((x) => x.slice(1, 4).map((n) => Number(n).toFixed(3)).join(' '));
  // The block tints in the order they are painted: the details panel is the first green tint, then one tint for each day, alternating.
  const tints = order.filter((c) => c === rgb(BRAND.greenTint) || c === rgb(BRAND.accentTint)).map((c) => (c === rgb(BRAND.greenTint) ? 'green' : 'accent'));
  assert.deepEqual(tints.slice(1), ['green', 'accent', 'green', 'accent', 'green'], 'five days alternate, green first');
  assert.ok(order.includes(rgb(BRAND.green)) && order.includes(rgb(BRAND.accent)), 'both band colours are used');
});

test('the itinerary is only its own words: the printed words are the stored words and the furniture, and nothing else, for 1, 3, 5 and 14 days and a long stay', async () => {
  for (const nights of [0, 2, 4, 13, 30]) {
    const { text, details } = made(nights);
    const model = modelOf(text, { details });
    const pdf = await inspectPdf(await render(model));
    const n = pdf.numPages;
    // The furniture: the large title and the compact header of the later pages (title and name), the grid, the date under each day label, the
    // footer. (The day label itself is part of the stored heading.)
    const furniture = ['Travel itinerary', ...Array.from({ length: n - 1 }, () => `Travel itinerary ${NAME}`),
      ...model.details.flatMap((d) => [d.label, d.value]),
      ...model.blocks.map((b) => (b.kind === 'day' ? (/^DAY/.test(b.main) ? b.sub : `${b.main} ${b.sub}`) : '')),
      ...Array.from({ length: n }, (_, i) => `${REFERENCE} Prepared by Wiser Consulting Page ${i + 1} of ${n}`)];
    const printed = pdf.pages.flatMap((p) => p.items.map((i) => i.str)).join(' ');
    const expected = [text, ...furniture].join(' ');
    assert.deepEqual(tokens(printed), tokens(expected), `${nights + 1} days: the words`);
  }
});

test('nothing is printed outside the 20 mm margins, on any page, for a trip of 1, 5 or 14 days and a draft or an approved one', async () => {
  for (const [nights, draft] of [[0, false], [4, true], [13, false], [13, true]]) {
    const { text, details } = made(nights);
    const pdf = await pdfOf(text, { details, draft });
    for (const page of pdf.pages) {
      for (const item of page.items.filter((i) => i.angle === 0 && i.str.trim())) {
        assert.ok(item.x >= MARGIN - 1.5, `page ${page.number}: "${item.str.slice(0, 30)}" starts at ${item.x}`);
        assert.ok(item.x + item.width <= page.width - MARGIN + 1.5, `page ${page.number}: "${item.str.slice(0, 30)}" ends at ${item.x + item.width}`);
        assert.ok(top(page, item) - item.size * 0.75 >= MARGIN - 2, `page ${page.number}: "${item.str.slice(0, 30)}" is above the top margin`);
        assert.ok(item.y >= MARGIN - 2, `page ${page.number}: "${item.str.slice(0, 30)}" is below the bottom margin`);
      }
    }
  }
});

test('very long lines wrap inside their block, and an unbroken very long word is broken to fit; nothing overlaps and no word is lost', async () => {
  const longLine = Array.from({ length: 70 }, (_, i) => `word${i}`).join(' ');
  const unbroken = 'A'.repeat(300);
  const text = written(3, (i) => (i === 0 ? longLine : i === 1 ? `Before ${unbroken} after` : 'A short one.'));
  const model = modelOf(text);
  const plan = itinerary.planItinerary(model);
  const pdf = await inspectPdf(await render(model));
  plan.pages.forEach((planned, p) => {
    const page = pdf.pages[p];
    for (const slot of planned.blocks) {
      const bottom = slot.y + slot.height;
      const items = page.items.filter((i) => i.angle === 0 && i.str.trim() && top(page, i) >= slot.y && top(page, i) <= bottom);
      assert.ok(items.length > 0);
      for (const item of items) {
        assert.ok(item.x + item.width <= page.width - MARGIN - 17, `"${item.str.slice(0, 20)}" runs out of its block: ${item.x + item.width}`);
        assert.ok(top(page, item) - item.size * 0.8 >= slot.y - 1 && top(page, item) <= bottom + 1, 'inside the block vertically');
      }
    }
  });
  const printed = pdf.pages.map((p) => plainLines(p).map((l) => l.text).join(' ')).join(' ').replace(/\s+/g, '');
  assert.ok(printed.includes('A'.repeat(300)), 'every character of the long word is there');
  for (let i = 0; i < 70; i += 1) assert.ok(printed.includes(`word${i}`));
  // Lines of one block do not overlap.
  for (const page of pdf.pages) {
    const ys = plainLines(page).map((l) => l.y);
    for (let i = 1; i < ys.length; i += 1) assert.ok(ys[i - 1] - ys[i] > 6, `lines are ${ys[i - 1] - ys[i]} apart`);
  }
});

test('one row taller than a page (one enormous line) carries on in a second block: nothing is lost and no block is taller than a page', async () => {
  const huge = Array.from({ length: 900 }, (_, i) => `token${i}`).join(' ');
  const model = modelOf(written(1, () => huge));
  const plan = itinerary.planItinerary(model);
  assert.ok(plan.pages.length >= 2, `${plan.pages.length} pages`);
  assert.ok(plan.blocks.length >= 2 && plan.blocks.slice(1).every((m) => m.continued));
  for (const page of plan.pages) for (const slot of page.blocks) assert.ok(slot.height <= 760, `a block ${slot.height} points tall`);
  const pdf = await inspectPdf(await render(model));
  const printed = pdf.text.replace(/\s+/g, ' ');
  for (let i = 0; i < 900; i += 50) assert.ok(printed.includes(`token${i} `) || printed.includes(`token${i}`), `token${i} is printed`);
  assert.ok(printed.includes('token899'));
});

test('clock times, when the text has them, are a column of their own beside the description; a stored itinerary has none, so no time column is printed', async () => {
  const edited = ['Proposed itinerary', 'Day 1, Monday 15 March 2027', '09:30 Breakfast and a walk', '14:15 Museum visit', 'An evening at leisure', '', 'Day 2, Tuesday 16 March 2027', '10am Train to Bath'].join('\n');
  const pdf = await pdfOf(edited);
  const page = pdf.pages[0];
  const t1 = page.items.find((i) => i.str === '09:30');
  const d1 = page.items.find((i) => i.str === 'Breakfast and a walk');
  assert.ok(t1 && d1 && t1.x < d1.x && Math.abs(t1.y - d1.y) < 1.5, 'the time is before its description, on the same line');
  assert.ok(/SourceSans3-Bold/.test(t1.font));
  assert.ok(page.items.some((i) => i.str === '10am'));
  const noTime = page.items.find((i) => i.str === 'An evening at leisure');
  assert.equal(noTime.x, d1.x, 'a line without a time starts in the same column');
  const plain = await pdfOf(written(3));
  assert.equal(plain.pages[0].items.some((i) => /^\d{1,2}[:.]\d{2}$/.test(i.str)), false);
  const x = plain.pages[0].items.filter((i) => /^A short description/.test(i.str)).map((i) => i.x);
  assert.ok(x.length === 3 && Math.max(...x) - Math.min(...x) < 0.5, 'with no times the descriptions start at the left of the text area');
  assert.ok(x[0] < d1.x, 'and nearer the band than when there is a time column');
});

test('typographic characters become plain ones, and the stored text is not changed in the model: curly quotes, dashes, the ellipsis, spaces', async () => {
  const text = written(2, (i) => (i === 0 ? `It${C(0x2019)}s ${C(0x201c)}quoted${C(0x201d)} ${C(0x2013)} ten${C(0xa0)}minutes${C(0x2026)}${C(0x200b)}` : 'Plain.'));
  const pdf = await pdfOf(text);
  assert.ok(pdf.text.includes('It\'s "quoted" - ten minutes...'), pdf.text.slice(0, 400));
  for (const code of [0x2019, 0x201c, 0x201d, 0x2013, 0x2026, 0xa0, 0x200b]) assert.equal(pdf.text.includes(C(code)), false, `U+${code.toString(16)}`);
});

test('text the fonts cannot print is found before anything is drawn: in the itinerary, or in the details at the top; the text is never returned', () => {
  assert.equal(itinerary.unprintableIn(modelOf(written(2, () => `A trip to ${ARABIC} soon.`))), 'itinerary');
  assert.equal(itinerary.unprintableIn(modelOf(`${written(1)}\n\nA note with ${C(0x5317)}${C(0x4eac)} in it.`)), 'itinerary');
  assert.equal(itinerary.unprintableIn(modelOf(written(1), { applicantName: ARABIC })), 'details');
  assert.equal(itinerary.unprintableIn(modelOf(written(1), { details: [{ label: 'Destination', value: `${C(0x5317)}${C(0x4eac)}` }] })), 'details');
  for (const bad of [C(0x5d0), C(0x939), C(0xe0e), C(0x1f600)]) assert.equal(itinerary.unprintableIn(modelOf(written(1, () => `A ${bad} here.`))), 'itinerary');
  assert.equal(itinerary.unprintableIn(modelOf(written(2, () => `${C(0x201c)}Caf${C(0xe9)}${C(0x201d)} ${C(0x2014)} ${C(0xa3)}5${C(0x2026)}`))), null);
  assert.equal(itinerary.unprintableIn(modelOf(made(13).text, { details: made(13).details })), null);
});

test('a DRAFT is marked on every page, over the blocks: the watermark (text, diagonal, drawn after the content so the tinted blocks do not hide it) and the banner; an approved itinerary has neither', async () => {
  for (const nights of [0, 4, 13]) {
    const { text } = made(nights);
    const draft = await pdfOf(text, { draft: true });
    for (const page of draft.pages) {
      const marks = page.items.filter((i) => i.str === TEXT.draftMark);
      assert.equal(marks.length, 2, `page ${page.number}: a watermark and a banner`);
      const watermark = marks.find((i) => i.angle !== 0);
      const banner = marks.find((i) => i.angle === 0);
      assert.ok(Math.abs(watermark.angle) === 45 && watermark.size >= 40 && banner.size < 12);
      assert.ok(top(page, banner) < MARGIN + 20, 'the banner is at the top');
      // Over the content: it comes after the last block text in the page's drawing order.
      const lastContent = page.items.map((i, k) => (i.angle === 0 && i.size > 9 && i.size < 14 && i.str.trim() && i.str !== TEXT.draftMark && i.str !== NAME ? k : -1)).reduce((a, b) => Math.max(a, b), -1);
      assert.ok(page.items.indexOf(watermark) > lastContent, 'drawn over the blocks');
    }
    const approved = await pdfOf(text, { draft: false });
    assert.equal(/DRAFT|NOT APPROVED/i.test(approved.text), false);
    assert.equal(approved.pages.some((p) => p.items.some((i) => i.angle !== 0 && i.angle !== 90)), false, 'no diagonal text');
  }
});

test('fonts embedded (Cormorant Garamond, Source Serif 4, Source Sans 3) and no standard font; the metadata holds no personal data; no script, no link, no picture', async () => {
  const { text, details } = made(4);
  const pdf = await pdfOf(text, { details });
  assert.ok(pdf.embeddedFonts >= 4);
  assert.equal(/\/BaseFont\s*\/(?:[A-Z]{6}\+)?(?:Helvetica|Times|Courier|Symbol|ZapfDingbats|Arial)/.test(pdf.raw), false);
  const fonts = [...new Set(pdf.pages.flatMap((p) => p.items.map((i) => i.font)))].join(' ');
  for (const family of [/CormorantGaramond-SemiBold\b/, /CormorantGaramond-SemiBoldItalic/, /SourceSerif4/, /SourceSans3/]) assert.match(fonts, family);
  assert.equal(pdf.info.Title, TEXT.itineraryInfo.Title);
  for (const value of Object.values(pdf.info).filter((v) => typeof v === 'string')) for (const personal of ['Aisha', 'Khan', REFERENCE, 'London', 'Bath', 'Edinburgh', '2027']) assert.equal(value.includes(personal), false, `${personal} in the metadata`);
  for (const script of ['/JavaScript', '/JS ', '/OpenAction', '/Launch', '/URI']) assert.equal(pdf.raw.includes(script), false, script);
  assert.equal((pdf.raw.match(/\/Subtype\s*\/Image/g) || []).length, 0);
});

test('no page looks like a government document: no crest, no government name, no barcode, no official reference', async () => {
  const pdf = await pdfOf(made(4).text, { details: made(4).details });
  for (const forbidden of [/UK Visas/i, /Home Office/i, /HM Government/i, /GWF/, /Partially completed/i, /Crown/, /barcode/i]) assert.equal(forbidden.test(pdf.text), false, String(forbidden));
});

test('a stay of the longest length (about six months, written a week at a time) and a full-size itinerary are made in a few seconds', async () => {
  const { text, details } = made(180);
  const started = Date.now();
  const pdf = await pdfOf(text, { details, draft: true });
  assert.ok(Date.now() - started < 20000, `${Date.now() - started} ms`);
  assert.ok(pdf.numPages >= 2);
  const plan = itinerary.planItinerary(modelOf(text, { details }));
  plan.pages.slice(0, -1).forEach((page) => assert.ok(page.fill >= 0.95));
});

// ---------------------------------------------------------------------------
// The palette, the fonts and the modules
// ---------------------------------------------------------------------------

const luminance = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  const lin = (c) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(n >> 16) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
};
const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);
const grey = (hex) => { const n = parseInt(hex.slice(1), 16); return 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255); };

test('the brand palette is defined once, in the config, with good print contrast, and its tints stay quiet on a greyscale printer', () => {
  assert.ok(contrast(BRAND.white, BRAND.green) >= 6, `white on the green ${contrast(BRAND.white, BRAND.green).toFixed(2)}`);
  assert.ok(contrast(BRAND.white, BRAND.accent) >= 4.5, `white on the terracotta ${contrast(BRAND.white, BRAND.accent).toFixed(2)}`);
  assert.ok(contrast(BRAND.ink, BRAND.greenTint) >= 12 && contrast(BRAND.ink, BRAND.accentTint) >= 12, 'ink on the tints');
  assert.ok(contrast(BRAND.muted, BRAND.white) >= 4.5 && contrast(BRAND.muted, BRAND.greenTint) >= 4.5, 'the muted grey');
  assert.ok(contrast(BRAND.greenDeep, BRAND.greenTint) >= 7 && contrast(BRAND.accentDeep, BRAND.accentTint) >= 7, 'the deep titles on their tints');
  assert.ok(contrast(BRAND.accentDeep, BRAND.white) >= 7, 'the grid labels');
  // Greyscale: the tints are light (about 94 percent), the bands deep, and a band is far darker than its tint.
  assert.ok(grey(BRAND.greenTint) > 235 && grey(BRAND.accentTint) > 235);
  assert.ok(grey(BRAND.green) < 120 && grey(BRAND.accent) < 120);
  assert.ok(grey(BRAND.greenTint) - grey(BRAND.green) > 120);
  // The green is the logo's own green.
  const logoGreen = [79, 103, 79];
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(BRAND.green.slice(i, i + 2), 16));
  assert.ok(Math.abs(r - logoGreen[0]) < 12 && Math.abs(g - logoGreen[1]) < 12 && Math.abs(b - logoGreen[2]) < 12, 'the brand green is the logo green');
  // Defined once: the PDF modules name colours, they never write one.
  for (const file of ['utils/touristVisaItineraryPdf.js', 'utils/touristVisaCoverLetterPdf.js', 'utils/pdf/documentBuilder.js', 'utils/pdf/letterBuilder.js']) {
    const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    assert.equal(/#[0-9a-fA-F]{6}\b/.test(source), false, `${file} writes a colour of its own`);
  }
  // The older names the application summary uses come from the same palette.
  assert.equal(config.PALETTE.green, BRAND.green);
  assert.equal(config.PALETTE.ink, BRAND.ink);
});

test('the display fonts are bundled with their licence (SIL Open Font Licence 1.1), cover what is printed, and are in the font list', () => {
  const dir = path.join(__dirname, '..', 'assets', 'fonts');
  for (const file of ['CormorantGaramond-SemiBold.ttf', 'CormorantGaramond-SemiBoldItalic.ttf', 'OFL-CormorantGaramond.txt']) assert.ok(fs.existsSync(path.join(dir, file)), file);
  assert.match(fs.readFileSync(path.join(dir, 'OFL-CormorantGaramond.txt'), 'utf8'), /SIL OPEN FONT LICENSE Version 1\.1/);
  assert.match(fs.readFileSync(path.join(dir, 'OFL-CormorantGaramond.txt'), 'utf8'), /Cormorant Project Authors/);
  assert.match(config.FONT_FILES.Display, /CormorantGaramond-SemiBold\.ttf$/);
  assert.match(config.FONT_FILES.DisplayItalic, /CormorantGaramond-SemiBoldItalic\.ttf$/);
  const pdfText = require('../utils/pdf/pdfText');
  const printed = `Travel itinerary Monday 15 March 2027 Aisha Khan-Reynolds ${C(0xe9)}${C(0xfc)}${C(0xf1)}${C(0xc9)}${C(0xc7)} ${C(0xa3)}1,200 0123456789`;
  assert.deepEqual(pdfText.unsupportedIn(printed, ['Display', 'DisplayItalic']), []);
  assert.deepEqual(pdfText.unsupportedIn(C(0x5317), ['Display']), [0x5317]);
  // No script or handwriting fonts: the families are the five of the brief and nothing else.
  assert.deepEqual(Object.keys(config.FONT_FILES).sort(), ['Display', 'DisplayItalic', 'Sans', 'SansBold', 'SansItalic', 'Serif', 'SerifBold', 'SerifBoldItalic', 'SerifItalic', 'Title', 'TitleRegular']);
});

test('the margins are at least 18 mm and the type never grows as a trip gets longer: the density only gets tighter from 1 day to 25 days', () => {
  assert.ok(ITINERARY_PAGE.margin >= 18 * (72 / 25.4) - 0.01 && ITINERARY_PAGE.margin <= 20 * (72 / 25.4) + 0.01, 'margins of 20 mm: ' + ITINERARY_PAGE.margin);
  const order = ['grand', 'comfortable', 'compact'];
  let previous = 0;
  for (let days = 1; days <= 25; days += 1) {
    const index = order.indexOf(itinerary.planItinerary(modelOf(written(days))).density);
    assert.ok(index >= previous, `${days} days are set in ${order[index]}, looser than the shorter trip before`);
    previous = index;
  }
  assert.equal(order[previous], 'compact', 'a long trip is compact');
});

test('the itinerary module is built on the shared foundation and knows nothing of storage, the network or the database', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'utils', 'touristVisaItineraryPdf.js'), 'utf8');
  assert.match(source, /require\('\.\/pdf\/documentBuilder'\)/);
  assert.equal(/require\('(fs|http|https|net|mongoose|cloudinary)'\)|require\("(fs|mongoose)"\)|fetch\(/.test(source), false);
});

// ---------------------------------------------------------------------------
// The date labels in the band (step 8h-4): the same gap between the day and the month for every date
// ---------------------------------------------------------------------------

const fontkit = require(require.resolve('fontkit', { paths: [path.join(__dirname, '..'), path.dirname(require.resolve('pdfkit'))] }));

/** The words of a turned label with the ink of each (its first and last glyph's real edges, from the font file), along the line of the text, in points. */
function labelInk(page, label, inside) {
  const words = turned(page, label, inside);
  assert.ok(words, `the label ${label} is in the file`);
  const font = fontkit.openSync(/Bold/.test(words[0].font) ? config.FONT_FILES.SansBold : config.FONT_FILES.Sans);
  const unit = words[0].size / font.unitsPerEm;
  return words.map((item) => {
    const chars = [...item.str];
    const first = font.glyphForCodePoint(chars[0].codePointAt(0));
    const last = font.glyphForCodePoint(chars[chars.length - 1].codePointAt(0));
    // The label is turned 90 degrees: the text runs up the page, so its start is the item's y and it ends width higher.
    return { str: item.str, size: item.size, start: item.y + first.bbox.minX * unit, end: item.y + item.width - (last.advanceWidth - last.bbox.maxX) * unit };
  });
}

test('the date labels in the band keep the same gap between the day and the month for every date, a single digit or two and wide or narrow letters: 1 MAY, 28 FEB, 31 MAR, 2 APR, 10 JAN', async () => {
  const days = [
    'Day 1, Saturday 1 May 2027', 'Day 2, Sunday 28 February 2027', 'Day 3, Wednesday 31 March 2027', 'Day 4, Friday 2 April 2027', 'Day 5, Sunday 10 January 2027',
    'Day 6, Monday 12 July 2027', 'Day 7, Tuesday 4 September 2027', 'Day 8, Thursday 9 November 2027', 'Day 9, Friday 30 December 2027',
  ];
  const text = ['Proposed itinerary', 'This is a proposed plan for the visit, and it may change.', ...days.map((d) => `${d}\nA short description of the plan.`)].join('\n\n');
  const model = modelOf(text);
  const plan = itinerary.planItinerary(model);
  const pdf = await inspectPdf(await render(model));
  const gaps = [];
  let checked = 0;
  plan.pages.forEach((planned, p) => {
    const page = pdf.pages[p];
    for (const slot of planned.blocks) {
      const inside = (item) => top(page, item) >= slot.y - 1 && top(page, item) <= slot.y + slot.height + 1;
      for (const label of [slot.m.block.main, slot.m.block.sub]) {
        const words = labelInk(page, label, inside);
        for (let i = 1; i < words.length; i += 1) {
          const gap = words[i].start - words[i - 1].end;
          gaps.push(gap / words[i].size);
          checked += 1;
        }
        // The label's ink is centred on the block.
        const mid = (words[0].start + words[words.length - 1].end) / 2;
        assert.ok(Math.abs(page.height - mid - (slot.y + slot.height / 2)) < 1.5, `${label}: centred on its block (${(page.height - mid).toFixed(1)} against ${(slot.y + slot.height / 2).toFixed(1)})`);
      }
    }
  });
  assert.ok(checked >= 18, `${checked} gaps were measured`);
  assert.ok(Math.min(...gaps) >= 0.34 && Math.max(...gaps) <= 0.38, `every gap is about a third of the size, from ${Math.min(...gaps).toFixed(3)} to ${Math.max(...gaps).toFixed(3)} em`);
  assert.ok(Math.max(...gaps) - Math.min(...gaps) < 0.01, `and all alike (${(Math.max(...gaps) - Math.min(...gaps)).toFixed(4)} em apart)`);
});

test('the date labels of a week (15 MAR, TO 21 MAR) and of a single date (15 MAR, 2027) are spaced the same way, and the words of a label are separate pieces of text, in order', async () => {
  const text = ['Proposed itinerary', 'This is a proposed plan for the visit, and it may change.',
    'Monday 15 March 2027 to Sunday 21 March 2027\nA week in the countryside.', 'Monday 22 March 2027\nOne last day.'].join('\n\n');
  const model = modelOf(text);
  const plan = itinerary.planItinerary(model);
  const pdf = await inspectPdf(await render(model));
  const page = pdf.pages[0];
  const slot = plan.pages[0].blocks[0];
  const inside = (item) => top(page, item) >= slot.y - 1 && top(page, item) <= slot.y + slot.height + 1;
  const to = labelInk(page, 'TO 21 MAR', inside);
  assert.equal(to.length, 3);
  const gaps = [to[1].start - to[0].end, to[2].start - to[1].end].map((g) => g / to[0].size);
  assert.ok(gaps.every((g) => g >= 0.34 && g <= 0.38) && Math.abs(gaps[0] - gaps[1]) < 0.01, `TO 21 MAR gaps ${gaps.map((g) => g.toFixed(3))}`);
  // The words come one after the other along the line, in reading order, and never overlap.
  for (let i = 1; i < to.length; i += 1) assert.ok(to[i].start > to[i - 1].end, 'in order and apart');
  assert.ok(turned(page, '15 MAR'), 'the week starts 15 MAR');
  const second = plan.pages[0].blocks[1];
  const insideSecond = (item) => top(page, item) >= second.y - 1 && top(page, item) <= second.y + second.height + 1;
  assert.ok(turned(page, '22 MAR', insideSecond) && turned(page, '2027', insideSecond), 'a single date: the day and month, and the year');
});

test('a label of one word is drawn as it was, and an empty label draws nothing', async () => {
  const { DocumentBuilder } = require('../utils/pdf/documentBuilder');
  const b = new DocumentBuilder({ reference: REFERENCE, applicantName: NAME });
  b.rotatedText('', 100, 100);
  b.rotatedText('   ', 100, 100);
  b.rotatedText('2027', 100, 100, { font: 'Sans', size: 9 });
  b.rotatedText('DAY  1', 140, 100, { font: 'SansBold', size: 12 });
  const pdf = await inspectPdf(await b.finish());
  const items = pdf.pages[0].items.filter((i) => i.angle === 90 && i.str.trim());
  assert.deepEqual(items.map((i) => i.str).sort(), ['1', '2027', 'DAY']);
});
