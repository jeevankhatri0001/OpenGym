/* Nutrition for the Coach (docs/NUTRITION.md): a compact summary of what was logged eating, so a
 * review or an answer can weigh recovery and progress against it. Small on purpose: the targets
 * and one line per logged day, whole numbers, at most NUTRITION_DAYS days. Never the foods, the
 * food names or the individual entries.
 *
 * Sent only when both hold:
 *   - the Nutrition module is on (Settings → Modules). This is the one module the Coach does not
 *     read past (docs/MODULES.md): food is more personal than training, and someone who switched
 *     it off should not find it in a prompt.
 *   - the Coach consent was given at CONSENT_NUTRITION or later, when the consent screen first
 *     named nutrition (frontend lib/coach.js CONSENT_VERSION). An older consent never agreed to it.
 *
 * Duplicated, not imported: the api image cannot import the frontend. frontend/src/lib/
 * coach-nutrition-parity.test.js pins nutritionOn against lib/modules.js isOn, and the totals and
 * targets against lib/nutrition.js, over a shared table.
 */

export const NUTRITION_DAYS = 14;
export const CONSENT_NUTRITION = 3;
export const NUTRIENT_KEYS = ['kcal', 'protein', 'carbs', 'fat', 'fibre'];
// frontend lib/nutrition.js DEFAULT_TARGETS and TARGET_MAX.
export const DEFAULT_TARGETS = Object.freeze({ kcal: 2200, protein: 140, carbs: 250, fat: 70, fibre: 30 });
const TARGET_MAX = { kcal: 10000, protein: 500, carbs: 1500, fat: 500, fibre: 150 };
// Every module but Nutrition (frontend lib/modules.js MODULE_IDS). Until someone chooses,
// Nutrition is on only when all of these are.
export const OTHER_MODULES = ['effort', 'plates', 'strength', 'videos', 'watch', 'checkin', 'body', 'health', 'motivation', 'coach', 'integrations', 'seasonal'];

const isMap = v => !!v && typeof v === 'object' && !Array.isArray(v);
const list = v => (Array.isArray(v) ? v : []);

function moduleOn(S, id) {
  const v = isMap(S?.modules) ? S.modules[id] : undefined;
  if (typeof v === 'boolean') return v;
  if (id === 'checkin') return S?.checkIn !== false;
  return true;
}

/** Whether the Nutrition module is on for this profile (lib/modules.js isOn(S, 'nutrition')). */
export function nutritionOn(S) {
  const v = isMap(S?.modules) ? S.modules.nutrition : undefined;
  if (typeof v === 'boolean') return v;
  return OTHER_MODULES.every(id => moduleOn(S, id));
}

/** Whether this profile's Coach consent covers nutrition. */
export const consentCoversNutrition = S => (Number(S?.coach?.consent?.version) || 0) >= CONSENT_NUTRITION;

/** The daily targets (lib/nutrition.js targetsOf): the profile's where valid, the defaults elsewhere. */
export function targetsOf(S) {
  const t = isMap(S?.nutritionTargets) ? S.nutritionTargets : {};
  const out = {};
  for (const k of NUTRIENT_KEYS) {
    const v = t[k] == null || t[k] === '' ? NaN : Number(t[k]);
    out[k] = Number.isFinite(v) && v >= 0 && v <= TARGET_MAX[k] ? Math.round(v) : DEFAULT_TARGETS[k];
  }
  return out;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Per logged day in [from, to], the sum of its entries' nutrients (`n`), unrounded, oldest first. */
export function dayTotals(S, from, to) {
  const byDay = new Map();
  for (const e of list(S?.foodLog)) {
    if (!isMap(e) || typeof e.d !== 'string' || !DAY.test(e.d)) continue;
    if ((from && e.d < from) || (to && e.d > to)) continue;
    const t = byDay.get(e.d) || { d: e.d, n: 0, kcal: 0, protein: 0, carbs: 0, fat: 0, fibre: 0 };
    const n = isMap(e.n) ? e.n : {};
    for (const k of NUTRIENT_KEYS) {
      const v = Number(n[k]);
      if (Number.isFinite(v) && v > 0) t[k] += v;
    }
    t.n++;
    byDay.set(e.d, t);
  }
  return [...byDay.values()].sort((a, b) => (a.d < b.d ? -1 : 1));
}

/**
 * What the payload carries as `nutrition`, or null when nothing should go: the module is off,
 * the consent predates nutrition, or nothing was logged in the NUTRITION_DAYS days up to `today`.
 * One short line per day: a full 14 days is about 1.3 KB of JSON, next to a review's 50 KB.
 */
export function nutritionOut(S, today) {
  if (!nutritionOn(S) || !consentCoversNutrition(S) || typeof today !== 'string' || !DAY.test(today)) return null;
  const start = new Date(today + 'T12:00:00Z');
  start.setUTCDate(start.getUTCDate() - (NUTRITION_DAYS - 1));
  const from = start.toISOString().slice(0, 10);
  const days = dayTotals(S, from, today).map(t => ({
    d: t.d, kcal: Math.round(t.kcal), protein: Math.round(t.protein), carbs: Math.round(t.carbs),
    fat: Math.round(t.fat), fibre: Math.round(t.fibre), n: Math.min(t.n, 99)
  }));
  if (!days.length) return null;
  return { targets: targetsOf(S), days };
}
