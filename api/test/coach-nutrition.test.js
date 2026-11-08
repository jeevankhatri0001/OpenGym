// What the Coach is told about nutrition (core/nutrition.js): daily totals and targets for the
// last two weeks, in a review and a question, only with the Nutrition module on and a consent
// that named nutrition. Never a food, a name or an entry.
import test from 'node:test';
import assert from 'node:assert/strict';
import { sampleState } from './helpers.mjs';

const payload = await import('../coach/core/payload.js');
const { nutritionOut, nutritionOn, NUTRITION_DAYS, CONSENT_NUTRITION, DEFAULT_TARGETS } = await import('../coach/core/nutrition.js');
const { DATA_CATEGORIES } = await import('../coach/core/categories.js');

const NOW = new Date('2026-07-27T12:00:00').getTime();
const entry = (d, kcal, over = {}) => ({
  id: 'e' + d + kcal, foodId: 'seed:oats', name: 'Grandma’s secret porridge', d, grams: 100, meal: 'breakfast',
  loggedAt: 1, source: 'manual', n: { kcal, protein: kcal / 20, carbs: kcal / 8, fat: kcal / 40, fibre: 3.3 }, ...over,
});
const fed = (over = {}) => sampleState({
  coach: { consent: { agreedAt: '2026-07-01T00:00:00Z', version: CONSENT_NUTRITION }, profile: { goal: 'muscle' } },
  foodLog: [entry('2026-07-27', 600.4), entry('2026-07-27', 500), entry('2026-07-20', 2000), entry('2026-07-01', 1800)],
  nutritionTargets: { kcal: 2500, protein: 160 },
  ...over,
});
const build = (S, kind) => payload.build(S, { handle: 'h', kind, now: NOW });

test('nutrition is a category the consent names', () => {
  assert.ok(DATA_CATEGORIES.includes('nutrition'));
});

test('a review and a question carry the last two weeks, one whole-number line per logged day, and the targets', () => {
  for (const kind of ['review', 'ask']) {
    const p = build(fed(), kind);
    assert.deepEqual(p.nutrition.targets, { ...DEFAULT_TARGETS, kcal: 2500, protein: 160 });
    // 2026-07-01 is outside the 14 days up to the 27th; the 27th is two entries summed
    assert.deepEqual(p.nutrition.days, [
      { d: '2026-07-20', kcal: 2000, protein: 100, carbs: 250, fat: 50, fibre: 3, n: 1 },
      { d: '2026-07-27', kcal: 1100, protein: 55, carbs: 138, fat: 28, fibre: 7, n: 2 },
    ]);
  }
});

test('never a food, a food name or an entry', () => {
  const text = JSON.stringify(build(fed(), 'review'));
  assert.ok(!text.includes('porridge'));
  assert.ok(!text.includes('seed:oats'));
  assert.ok(!text.includes('breakfast'));
  assert.deepEqual(Object.keys(build(fed(), 'review').nutrition).sort(), ['days', 'targets']);
});

test('not with the module off, nor while it follows the others and one of them is off', () => {
  assert.equal(build(fed({ modules: { nutrition: false } }), 'review').nutrition, undefined);
  assert.equal(nutritionOn({ modules: { seasonal: false } }), false);
  assert.equal(build(fed({ modules: { seasonal: false } }), 'review').nutrition, undefined);
  assert.ok(build(fed({ modules: { seasonal: false, nutrition: true } }), 'review').nutrition);
});

test('not to a consent given before nutrition was on the list', () => {
  const S = fed();
  S.coach.consent.version = CONSENT_NUTRITION - 1;
  assert.equal(build(S, 'review').nutrition, undefined);
  delete S.coach.consent;
  assert.equal(nutritionOut(S, '2026-07-27'), null);
});

test('not in a new plan, a debrief or a mid-workout change, and nothing when nothing was logged lately', () => {
  for (const kind of ['create', 'debrief', 'adapt']) assert.equal(build(fed(), kind).nutrition, undefined, kind);
  assert.equal(build(fed({ foodLog: [entry('2026-06-01', 1000)] }), 'review').nutrition, undefined);
  assert.equal(build(fed({ foodLog: undefined }), 'review').nutrition, undefined);
});

test('stays small: a full two weeks of heavy logging is about a kilobyte, junk entries skipped', () => {
  const log = [];
  for (let i = 0; i < 40; i++) for (let j = 0; j < 12; j++) {
    const d = new Date(NOW - i * 86400000).toISOString().slice(0, 10);
    log.push(entry(d, 300 + j));
  }
  log.push({ d: 'yesterday', n: { kcal: 1e9 } }, null, 'x', { d: '2026-07-26', n: 'lots' });
  const p = build(fed({ foodLog: log }), 'review');
  assert.equal(p.nutrition.days.length, NUTRITION_DAYS);
  assert.ok(JSON.stringify(p.nutrition).length < 1500, JSON.stringify(p.nutrition).length + ' chars');
  assert.ok(p.nutrition.days.every(x => x.kcal < 10000));
});

test('targets out of range or of the wrong type fall back to the defaults', () => {
  const p = build(fed({ nutritionTargets: { kcal: 'lots', protein: -5, carbs: null, fat: 99999, fibre: 25.6 } }), 'review');
  assert.deepEqual(p.nutrition.targets, { ...DEFAULT_TARGETS, fibre: 26 });
});
