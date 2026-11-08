// The nutrition coach on screen (rules in lib/nutrition-coach.js): a card under the day's totals,
// a line in the toast after food is added, and a sheet with every tip. "Ask the Coach" opens the AI
// Coach's chat with the day written out as a question, for the person to read and send.
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t } from '../lib/i18n.js'
import { fmtNum, todayISO } from '../lib/format.js'
import { workoutDay } from '../lib/history.js'
import { recentFoodIds, targetsOf } from '../lib/nutrition.js'
import { nutritionCoach, coachQuestion } from '../lib/nutrition-coach.js'
import { useCoachGate } from '../lib/use-coach-gate.js'
import { hasConsent } from '../lib/coach.js'
import { nav } from '../lib/nav.js'
import Icon from './Icon.jsx'
import { Button } from './ui.jsx'
import '../coach.css'

const mealName = m => ({ breakfast: t('Breakfast'), lunch: t('Lunch'), dinner: t('Dinner'), snack: t('Snack') })[m] || m

/** One tip as a sentence. */
export function tipLine(x) {
  switch (x.id) {
    case 'empty': return t('Nothing logged yet. Today aim for about {0} kcal and {1} g protein.', fmtNum(x.kcal), fmtNum(x.protein))
    case 'kcalOver': return t('{0} kcal over today. Keep the rest of the day light: lean protein and vegetables.', fmtNum(x.over))
    case 'mealFat': return t('{0} was mostly fat. Balance the next meal with protein and some carbs.', mealName(x.meal))
    case 'mealCarbs': return t('{0} was mostly carbs. Add a protein to the next meal.', mealName(x.meal))
    case 'mealProtein': return t('{0} was light on protein. Add some to the next meal.', mealName(x.meal))
    case 'proteinPace':
      if (x.meals === 1) return x.food
        ? t('{0} g protein left. Get about {1} g in your next meal, like {2} g {3}.', x.left, x.perMeal, x.food.grams, x.food.name)
        : t('{0} g protein left. Get about {1} g in your next meal.', x.left, x.perMeal)
      return x.food
        ? t('{0} g protein left. About {1} g at each of the next {2} meals, like {3} g {4}.', x.left, x.perMeal, x.meals, x.food.grams, x.food.name)
        : t('{0} g protein left. About {1} g at each of the next {2} meals.', x.left, x.perMeal, x.meals)
    case 'proteinDone': return t('Protein done for today: {0} g. Nice.', x.eaten)
    case 'proteinShort': return t('Protein finished {0} g short. Plan a protein in each meal next time.', x.left)
    case 'kcalPace': return t('You are eating ahead of the day. {0} kcal left, so keep the next meals lighter.', fmtNum(x.left))
    case 'kcalTight': return x.food
      ? t('About {0} kcal per meal left. Something light, like {1} g {2} ({3} kcal).', fmtNum(x.perMeal), x.food.grams, x.food.name, x.food.kcal)
      : t('About {0} kcal per meal left. Keep it light.', fmtNum(x.perMeal))
    case 'fibreLow': return t('{0} g fibre to go. Add vegetables, fruit, beans or oats.', x.left)
    case 'trainingDay': return t('Training day: aim for about {0} kcal, {1} g protein and {2} g carbs.', fmtNum(x.kcal), x.protein, x.carbs)
    case 'restDay': return t('Rest day: about {0} kcal is plenty.', fmtNum(x.kcal))
    case 'kcalLeft': return t('{0} kcal left today.', fmtNum(x.left))
    default: return ''
  }
}

const ICON = { kcalOver: 'warning', mealFat: 'warning', mealCarbs: 'warning', mealProtein: 'warning', proteinDone: 'check', trainingDay: 'bolt', restDay: 'moon' }

/** Whether a workout was logged on `d`, or is running today. */
export function trainedOn(S, d) {
  if (d === todayISO() && S.active && !S.active.editingWorkoutId) return true
  return (S.workouts || []).some(w => workoutDay(w) === d)
}

/** The coach's read of day `d` in profile `S`; `lastMeal` the meal of the food just added. */
export function coachRead(S, d, { lastMeal = null, at = new Date() } = {}) {
  return nutritionCoach({
    log: S.foodLog, d, targets: targetsOf(S), foods: S.foods || [],
    hour: d === todayISO() ? at.getHours() : 24,
    trained: trainedOn(S, d), lastMeal, recentIds: recentFoodIds(S.foodLog),
  })
}

/** The day as a message for the AI Coach's chat. */
export function askText(S, d) {
  const q = coachQuestion({ log: S.foodLog, d, targets: targetsOf(S), trained: trainedOn(S, d) })
  const day = d === todayISO() ? t('today') : d
  const lines = [
    t('Here is what I ate {0}: {1}.', day, q.ate || t('nothing yet')),
    t('Totals: {0} kcal, {1} g protein, {2} g carbs, {3} g fat, {4} g fibre.', q.totals.kcal, q.totals.protein, q.totals.carbs, q.totals.fat, q.totals.fibre),
    t('My targets: {0} kcal, {1} g protein, {2} g carbs, {3} g fat.', q.targets.kcal, q.targets.protein, q.targets.carbs, q.targets.fat) + ' ' + (q.trained ? t('I trained that day.') : t('It was a rest day.')),
    d === todayISO() ? t('What should I eat for the rest of the day?') : t('How did I do, and what should I change?'),
  ]
  const text = lines.join(' ')
  return text.length > 1500 ? text.slice(0, 1497) + '…' : text
}

function useAsk(d) {
  const S = useStore(s => s.S)
  const gate = useCoachGate()
  if (!gate.ok || !hasConsent(S)) return null
  return () => nav('/coach?ask=' + encodeURIComponent(askText(useStore.getState().S, d)))
}

function Tips({ tips }) {
  return tips.map((x, i) => <div key={x.id + i} className="nut-coach-tip">
    <Icon name={ICON[x.id] || 'sparkles'} />
    <span>{tipLine(x)}</span>
  </div>)
}

/** The card on the day screen: the top tips for day `d`. */
export function NutritionCoachCard({ d }) {
  const S = useStore(s => s.S)
  const ask = useAsk(d)
  const { tips } = coachRead(S, d)
  if (!tips.length) return null
  return <div className="card nut-coach" aria-label={t('Coach')}>
    <div className="pcard-eyebrow"><Icon name="sparkles" /> {t('Coach')}</div>
    <Tips tips={tips.slice(0, 3)} />
    {ask && <Button size="sm" variant="ghost" icon="sparkles" onClick={ask}>{t('Ask the Coach')}</Button>}
  </div>
}

function CoachSheet({ d, lastMeal, close }) {
  const S = useStore(s => s.S)
  const ask = useAsk(d)
  const { tips } = coachRead(S, d, { lastMeal })
  return <div className="nut-coach-sheet">
    <div className="pcard-eyebrow"><Icon name="sparkles" /> {t('Coach')}</div>
    <h3 style={{ margin: '4px 0 10px' }}>{t('Your day so far')}</h3>
    <Tips tips={tips} />
    <div className="pcard-ft" style={{ paddingInline: 0 }}>
      {ask && <Button variant="primary" icon="sparkles" onClick={() => { close(); ask() }}>{t('Ask the Coach')}</Button>}
      <Button onClick={close}>{t('Done')}</Button>
    </div>
  </div>
}

export function nutritionCoachSheet(d, { lastMeal = null } = {}) {
  return useUI.getState().openSheet(close => <CoachSheet d={d} lastMeal={lastMeal} close={close} />)
}

/**
 * The check-in after food is added: the coach's first tip in the toast, with More for the rest.
 * The training/rest line only leads when there is nothing else to say.
 */
export function coachToast(S, entry) {
  const { tips } = coachRead(S, entry.d, { lastMeal: entry.meal })
  const first = tips.find(x => x.id !== 'trainingDay' && x.id !== 'restDay') || tips[0]
  const added = t('{0} added', entry.name)
  if (!first) return useUI.getState().toast(added)
  useUI.getState().toast(added + '. ' + tipLine(first), {
    action: t('More'), onAction: () => nutritionCoachSheet(entry.d, { lastMeal: entry.meal }), ms: 7000,
  })
}

