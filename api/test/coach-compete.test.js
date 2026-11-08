// A competitor (coachProfile.goal "compete", core/compete.js): what the intake's show, body and
// food answers become on the way to the model, and the prep rules that come with them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { sampleState } from './helpers.mjs';

const payload = await import('../coach/core/payload.js');
const { cleanCompete, weeksOut, COMPETE_BOUNDS } = await import('../coach/core/compete.js');
const { buildPromptParts } = await import('../coach/core/prompt.js');

const NOW = new Date('2026-11-08T12:00:00').getTime();
const COMPETE = {
  division: 'classic', federation: 'A natural federation', showDate: '2027-05-16', posing: 'never',
  age: 24, heightCm: 175, weight: 78.4, trainingYears: 3, bodyFat: 14, diet: 'egg', meals: 4, foodNotes: 'dal and rice most days',
};
const athlete = (compete = COMPETE, over = {}) => sampleState({
  coach: { consent: { agreedAt: '2026-11-01T00:00:00Z', version: 3 }, profile: { goal: 'compete', experience: 'regular', compete } },
  ...over,
});
const build = (S, kind) => payload.build(S, { handle: 'h', kind, now: NOW });

test('the show, the body and the food reach the Coach cleaned, with the weeks to the show worked out', () => {
  const p = build(athlete(), 'ask');
  assert.deepEqual(p.coachProfile.compete, { ...COMPETE, weeksOut: 27 });   // 189 days
});

test('a competitor’s answers only under the compete goal', () => {
  const S = athlete();
  S.coach.profile.goal = 'muscle';
  assert.equal(build(S, 'ask').coachProfile.compete, undefined);
});

test('junk is not an answer: unknown words, numbers out of range, long text cut', () => {
  const c = cleanCompete({ division: 'ms olympia', posing: 1, diet: 'carnivore', age: 7, heightCm: '175', weight: 9999, meals: 4.4, bodyFat: 'lean',
    federation: 'x'.repeat(500), foodNotes: 'y'.repeat(900), showDate: 'next spring' });
  assert.equal(c.division, null);
  assert.equal(c.posing, null);
  assert.equal(c.diet, null);
  assert.equal(c.age, null);
  assert.equal(c.heightCm, 175);
  assert.equal(c.weight, null);
  assert.equal(c.meals, 4);
  assert.equal(c.bodyFat, null);
  assert.equal(c.federation.length, 60);
  assert.equal(c.foodNotes.length, 300);
  assert.equal(c.showDate, null);
  assert.equal(cleanCompete('nope'), null);
  for (const [k, [lo, hi]] of Object.entries(COMPETE_BOUNDS)) {
    assert.equal(cleanCompete({ [k]: lo - 1 })[k], null, k);
    assert.equal(cleanCompete({ [k]: hi })[k], hi, k);
  }
});

test('weeks out: whole weeks, 0 in show week, negative after, null without a date', () => {
  assert.equal(weeksOut('2026-11-15', '2026-11-08'), 1);
  assert.equal(weeksOut('2026-11-14', '2026-11-08'), 0);
  assert.equal(weeksOut('2026-11-01', '2026-11-08'), -1);
  assert.equal(weeksOut(null, '2026-11-08'), null);
  const p = build(athlete({ ...COMPETE, showDate: null }), 'ask');
  assert.equal(p.coachProfile.compete.weeksOut, undefined);
});

test('a question carries the last four weeks of weigh-ins, as a review does', () => {
  const day = n => new Date(NOW - n * 86400000).toISOString().slice(0, 10);
  const S = athlete(COMPETE, { targetW: null, bodyweight: [{ d: day(40), w: 80 }, { d: day(20), w: 79.1 }, { d: day(2), w: 78.4 }] });
  assert.deepEqual(build(S, 'ask').bodyweight.series.map(b => b.w), [79.1, 78.4]);
  assert.equal(build({ ...S, bodyweight: [] }, 'ask').bodyweight, undefined);
});

test('the prep rules ride in the system prompt for a competitor only, and keep it a prompt', () => {
  for (const kind of ['create', 'review', 'ask', 'debrief', 'adapt']) {
    const plain = buildPromptParts(kind, { coachProfile: { goal: 'muscle' } }).system;
    const prep = buildPromptParts(kind, { coachProfile: { goal: 'compete' } }).system;
    assert.ok(!plain.includes('## Competitors'), kind);
    assert.ok(prep.includes('## Competitors'), kind);
    assert.ok(prep.length < 24000, kind + ' ' + prep.length);
  }
  const prep = buildPromptParts('ask', { coachProfile: { goal: 'compete' } }).system;
  // the safety lines a natural prep coach must keep
  assert.match(prep, /diuretics/);
  assert.match(prep, /bloodwork/);
  assert.match(prep, /0\.5–1% of body weight a week/);
});
