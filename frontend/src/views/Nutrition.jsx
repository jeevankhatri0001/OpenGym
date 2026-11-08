import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import {
  MEALS, MACROS, NAME_MAX, SERVINGS_MAX, NUTRIENTS, addDays, averageDay, cleanFood, cleanGrams, dailyTotals,
  entriesByMeal, foodProblems, makeLogEntry, nutrientsFor, progress, recentFoodIds, regram, round1,
  searchFoods, targetsOf, weeklySeries, dailySeries,
} from '../lib/nutrition.js'
import { STARTER_VARIES, shouldSeed, starterFoodsToAdd } from '../lib/nutrition-seed.js'
import { fmtDate, fmtNum, todayISO, uid } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import Icon from '../components/Icon.jsx'
import SwipeRow from '../components/SwipeRow.jsx'
import GramsInput from '../components/GramsInput.jsx'
import { BarRow } from '../components/StatBars.jsx'
import { Button, NumberField, SearchField, Section, Segmented, Switch, TextField } from '../components/ui.jsx'
import { confirmSheet } from '../sheets.jsx'
import NutritionTargetsPage from './NutritionTargets.jsx'
import { NutritionCoachCard, coachToast } from '../components/NutritionCoach.jsx'

// Nutrition (docs/NUTRITION.md): Today with a date switcher (/nutrition?d=YYYY-MM-DD), the Foods
// library (/nutrition/foods) and History (/nutrition/history). The numbers are lib/nutrition.js's;
// this file only shows them and writes through useStore update, so the foods and the log sync and
// merge like every other list (a removal is recorded by stampDeletions, an Undo brings it back).

const update = fn => useStore.getState().update(fn)
const toast = (message, opts) => useUI.getState().toast(message, opts)
const openSheet = render => useUI.getState().openSheet(render)

export const mealCopy = () => ({ breakfast: t('Breakfast'), lunch: t('Lunch'), dinner: t('Dinner'), snack: t('Snack') })
export const nutrientCopy = () => ({ kcal: t('Calories'), protein: t('Protein'), carbs: t('Carbs'), fat: t('Fat'), fibre: t('Fibre') })
const kcal = v => fmtNum(Math.round(Number(v) || 0))
const grams = v => fmtNum(round1(v)) + ' g'

/** The meal a new entry goes to by default: by the time of day. */
export function mealNow(at = new Date()) {
  const h = at.getHours()
  return h < 11 ? 'breakfast' : h < 15 ? 'lunch' : h < 18 ? 'snack' : 'dinner'
}

const dayLabel = d => d === todayISO() ? t('Today') : d === addDays(todayISO(), -1) ? t('Yesterday') : fmtDate(d, true)

/** kcal · P · C · F of a nutrient set, the short line under an entry and in previews. */
function MacroLine({ n, className = 'small dim' }) {
  return <span className={className}>
    {t('{0} kcal', kcal(n.kcal))} · {t('P {0}', grams(n.protein))} · {t('C {0}', grams(n.carbs))} · {t('F {0}', grams(n.fat))}
  </span>
}

// A target's bar: under it grey, near it green; over it orange for what one should not overshoot.
const toneOf = (k, pct) => pct == null ? 'neutral' : pct > 105 && (k === 'kcal' || k === 'carbs' || k === 'fat') ? 'above' : pct >= 90 ? 'in' : 'below'

// ---------------------------------------------------------------- add food --

function AddFood({ d, meal: meal0, close }) {
  const S = useStore(s => s.S)
  const [q, setQ] = useState('')
  const [meal, setMeal] = useState(meal0 || mealNow())
  const [food, setFood] = useState(null)
  const [g, setG] = useState(null)
  const foods = S.foods || []
  const byId = useMemo(() => new Map(foods.map(f => [f.id, f])), [foods])
  const recent = useMemo(() => recentFoodIds(S.foodLog).map(id => byId.get(id)).filter(Boolean), [S.foodLog, byId])
  const favs = foods.filter(f => f.favourite)
  const hits = q.trim() ? searchFoods(foods, q) : null

  const pick = f => { setFood(f); setG(f.servings?.[0]?.g ?? 100) }
  const add = () => {
    const e = makeLogEntry({ food, grams: g, meal, d, id: uid() })
    if (!e) { toast(t('Enter an amount in grams')); return }
    update(s => { s.foodLog = [...(s.foodLog || []), e] })
    close()
    // The coach's check-in (components/NutritionCoach.jsx): the added food plus its first tip.
    coachToast(useStore.getState().S, e)
  }

  if (food) {
    const n = nutrientsFor(food, g)
    return <>
      <div className="row" style={{ gap: 8, marginBottom: 10 }}>
        <button className="iconbtn" onClick={() => setFood(null)} aria-label={t('Back')}><Icon name="chevronLeft" /></button>
        <h3 style={{ margin: 0, flex: 1 }}>{food.name}</h3>
      </div>
      <Segmented className="nut-meals" value={meal} onChange={setMeal} options={MEALS.map(m => ({ value: m, label: mealCopy()[m] }))} />
      <div style={{ height: 12 }} />
      <GramsInput value={g} onChange={v => setG(v)} servings={food.servings} autoFocus />
      <div className="card nut-preview" aria-live="polite">
        <div className="big">{kcal(n.kcal)} <span className="muted" style={{ fontSize: 'var(--fs-callout)' }}>kcal</span></div>
        <div className="nut-preview-m">
          {MACROS.map(k => <span key={k}>{nutrientCopy()[k]} <b>{grams(n[k])}</b></span>)}
        </div>
      </div>
      <Button variant="primary" onClick={add} disabled={cleanGrams(g) == null}>{t('Add to {0}', mealCopy()[meal])}</Button>
    </>
  }

  const row = f => <button type="button" key={f.id} className="lrow tap nut-food" onClick={() => pick(f)}>
    <span className="lrow-m"><span className="lrow-t">{f.name}{f.favourite && <Icon name="starFill" className="nut-star" />}</span>
      <span className="lrow-s">{t('{0} kcal', kcal(f.kcal))} · {t('P {0}', grams(f.protein))} · {t('per 100 g')}</span></span>
    <Icon name="plus" className="lrow-k" />
  </button>
  const group = (title, list) => list.length > 0 && <Section title={title} key={title}>{list.map(row)}</Section>

  return <>
    <h3>{t('Add food')}</h3>
    <SearchField value={q} onChange={e => setQ(e.target.value)} onClear={() => setQ('')} placeholder={t('Search foods')} autoFocus />
    <div style={{ height: 10 }} />
    {hits ? (hits.length ? <div className="sect-b">{hits.map(row)}</div> : <div className="empty small">{t('No food matches “{0}”.', q.trim())}</div>)
      : foods.length ? <>
        {group(t('Favourites'), favs)}
        {group(t('Recent'), recent.filter(f => !f.favourite))}
        {group(t('All foods'), searchFoods(foods, '').filter(f => !f.favourite && !recent.includes(f)))}
      </> : <div className="empty small">{t('No foods yet. Add the foods you eat, with their values per 100 g from the label.')}</div>}
    <div style={{ height: 12 }} />
    <Button icon="plus" onClick={() => foodFormSheet(null, { name: q.trim(), onSaved: pick })}>{t('New food')}</Button>
  </>
}

export function addFoodSheet(d = todayISO(), meal) {
  return openSheet(close => <AddFood d={d} meal={meal} close={close} />)
}

// ------------------------------------------------------------- edit entry --

function removeEntry(entry) {
  update(s => { s.foodLog = (s.foodLog || []).filter(e => e.id !== entry.id) })
  toast(t('{0} removed', entry.name), {
    action: t('Undo'),
    onAction: () => update(s => { if (!(s.foodLog || []).some(e => e.id === entry.id)) s.foodLog = [...(s.foodLog || []), entry] }),
  })
}

function EditEntry({ id, close }) {
  const entry = useStore(s => (s.S.foodLog || []).find(e => e.id === id))
  const food = useStore(s => (s.S.foods || []).find(f => f.id === entry?.foodId))
  const [g, setG] = useState(entry?.grams ?? null)
  const [meal, setMeal] = useState(entry?.meal || 'snack')
  if (!entry) return <><div className="empty small">{t('This entry was removed.')}</div><Button onClick={close}>{t('Close')}</Button></>
  const next = regram(entry, g)
  const save = () => {
    if (!next) { toast(t('Enter an amount in grams')); return }
    update(s => { s.foodLog = (s.foodLog || []).map(e => (e.id === id ? { ...next, meal } : e)) })
    close()
  }
  return <>
    <h3>{entry.name}</h3>
    <div className="muted small" style={{ marginBottom: 12 }}>{t('The values are the ones from when you logged it. Editing the food later does not change them.')}</div>
    <Segmented className="nut-meals" value={meal} onChange={setMeal} options={MEALS.map(m => ({ value: m, label: mealCopy()[m] }))} />
    <div style={{ height: 12 }} />
    <GramsInput value={g} onChange={v => setG(v)} servings={food?.servings} />
    <div className="card nut-preview" aria-live="polite"><MacroLine n={(next || entry).n} className="" /></div>
    <Button variant="primary" onClick={save} disabled={!next}>{t('Save')}</Button>
    <div style={{ height: 8 }} />
    <Button variant="ghost" className="danger" icon="trash" onClick={() => { close(); removeEntry(entry) }}>{t('Delete')}</Button>
  </>
}

const editEntrySheet = id => openSheet(close => <EditEntry id={id} close={close} />)

// -------------------------------------------------------------- food form --

const PROBLEM = () => ({
  name: t('Give the food a name.'),
  kcal: t('Calories must be between 0 and 900 per 100 g.'),
  protein: t('Protein must be between 0 and 100 g per 100 g.'),
  carbs: t('Carbs must be between 0 and 100 g per 100 g.'),
  fat: t('Fat must be between 0 and 100 g per 100 g.'),
  fibre: t('Fibre must be between 0 and 100 g per 100 g.'),
  sum: t('Protein, carbs and fat add up to more than 100 g per 100 g.'),
  servings: t('Each serving needs a name and its grams.'),
})

function FoodForm({ id, init, onSaved, close }) {
  const was = useStore(s => (id ? (s.S.foods || []).find(f => f.id === id) : null))
  const [f, setF] = useState(() => was ? { ...was, servings: [...(was.servings || [])] }
    : { name: init?.name || '', kcal: null, protein: null, carbs: null, fat: null, fibre: null, servings: [], favourite: false })
  const [tried, setTried] = useState(false)
  const problems = foodProblems(f)
  const set = (k, v) => setF(x => ({ ...x, [k]: v }))
  const setServing = (i, k, v) => setF(x => ({ ...x, servings: x.servings.map((s, j) => (j === i ? { ...s, [k]: v } : s)) }))
  const save = () => {
    if (problems.length) { setTried(true); return }
    const food = cleanFood({ ...f, id: id || uid(), isCustom: was ? was.isCustom : true })
    update(s => {
      const list = s.foods || []
      const merged = x => { const out = { ...x, ...food }; if (!food.servings) delete out.servings; return out }
      s.foods = id ? list.map(x => (x.id === id ? merged(x) : x)) : [...list, food]
    })
    close()
    toast(id ? t('Food saved') : t('{0} added to your foods', food.name))
    onSaved?.(food)
  }
  const remove = () => confirmSheet({
    title: t('Delete {0}?', was.name),
    message: t('What you already logged stays as it is.'),
    confirmText: t('Delete'), danger: true,
    onConfirm: () => { close(); removeFood(was) },
  })
  const copy = PROBLEM()
  return <>
    <h3>{id ? t('Edit food') : t('New food')}</h3>
    {was?.seed && <div className="muted small nut-seed-note" style={{ marginBottom: 10 }}>
      {STARTER_VARIES.includes(was.id)
        ? t('A starter food with approximate values. This one differs a lot between brands, so copy the numbers from your packaging.')
        : t('A starter food with approximate values from USDA FoodData Central. Change them to match what you buy.')}
    </div>}
    <TextField value={f.name} maxLength={NAME_MAX} placeholder={t('Name')} aria-label={t('Name')} onChange={e => set('name', e.target.value)} />
    <div className="muted small" style={{ margin: '12px 2px 8px' }}>{t('Per 100 g, as on the label.')}</div>
    <div className="measure-form nut-form">
      {NUTRIENTS.map(k => <label className="measure-field" key={k}>
        <span>{nutrientCopy()[k]}</span>
        <span className="measure-input"><NumberField nullable value={f[k]} onChange={v => set(k, v)} /><i>{k === 'kcal' ? 'kcal' : 'g'}</i></span>
      </label>)}
    </div>
    <h4 className="sec">{t('Servings')}</h4>
    <div className="muted small" style={{ margin: '0 2px 8px' }}>{t('Optional amounts to pick with one tap, like 1 egg = 50 g.')}</div>
    {f.servings.map((s, i) => <div className="row nut-serving" key={i} style={{ gap: 8, marginBottom: 8 }}>
      <TextField value={s.label} maxLength={40} placeholder={t('Serving')} aria-label={t('Serving')} onChange={e => setServing(i, 'label', e.target.value)} />
      <span className="measure-input"><NumberField nullable value={s.g} onChange={v => setServing(i, 'g', v)} aria-label={t('Grams')} /><i>g</i></span>
      <button className="iconbtn" style={{ color: 'var(--red)' }} aria-label={t('Remove')} onClick={() => setF(x => ({ ...x, servings: x.servings.filter((_, j) => j !== i) }))}><Icon name="xmark" /></button>
    </div>)}
    {f.servings.length < SERVINGS_MAX && <Button size="sm" variant="ghost" icon="plus" onClick={() => setF(x => ({ ...x, servings: [...x.servings, { label: '', g: null }] }))}>{t('Add serving')}</Button>}
    <div className="lrow" style={{ marginTop: 8 }}>
      <span className="lrow-m"><span className="lrow-t">{t('Favourite')}</span><span className="lrow-s">{t('Shown first when you add food.')}</span></span>
      <Switch checked={!!f.favourite} onChange={v => set('favourite', v)} />
    </div>
    {tried && problems.length > 0 && <div className="nut-problems" role="alert">{problems.map(p => <div key={p}>{copy[p]}</div>)}</div>}
    <div style={{ height: 14 }} />
    <Button variant="primary" onClick={save}>{t('Save')}</Button>
    {was && <><div style={{ height: 8 }} /><Button variant="ghost" className="danger" icon="trash" onClick={remove}>{t('Delete food')}</Button></>}
  </>
}

export function foodFormSheet(id = null, { name, onSaved } = {}) {
  return openSheet(close => <FoodForm id={id} init={{ name }} onSaved={onSaved} close={close} />)
}

function removeFood(food) {
  update(s => { s.foods = (s.foods || []).filter(f => f.id !== food.id) })
  toast(t('{0} deleted', food.name), {
    action: t('Undo'),
    onAction: () => update(s => { if (!(s.foods || []).some(f => f.id === food.id)) s.foods = [...(s.foods || []), food] }),
  })
}

const toggleFavourite = food => update(s => { s.foods = (s.foods || []).map(f => (f.id === food.id ? { ...f, favourite: !f.favourite } : f)) })

// ------------------------------------------------------------------ Today --

// The targets right here, without leaving the Nutrition tab: the same rows as Settings →
// Nutrition targets (views/NutritionTargets.jsx).
export function targetsSheet() {
  return openSheet(close => <>
    <h3>{t('Daily targets')}</h3>
    <NutritionTargetsPage />
    <div style={{ height: 10 }} />
    <Button variant="primary" onClick={close}>{t('Done')}</Button>
  </>)
}

// `back`: the page one level up; Today is a tab of its own (components/TabBar.jsx) and has none.
function Header({ title, sub, back, backLabel, children }) {
  const nav = useNavigate()
  return <div className="hdr">
    {back && <button className="iconbtn" data-back={back} onClick={() => nav(back)} aria-label={backLabel ?? t('Back')}><Icon name="chevronLeft" /></button>}
    <div style={{ flex: 1, marginInlineStart: back ? 12 : 0 }}><h1>{title}</h1>{sub && <div className="sub">{sub}</div>}</div>
    {children && <div className="hdr-actions">{children}</div>}
  </div>
}

/** The day's totals against the targets: calories big, one bar per nutrient. */
export function TargetBars({ totals, targets }) {
  const p = progress(totals, targets)
  const names = nutrientCopy()
  return <div className="nut-bars">
    {NUTRIENTS.map(k => {
      const x = p[k]
      const unit = k === 'kcal' ? '' : ' g'
      return <BarRow key={k} label={names[k]} tone={toneOf(k, x.pct)} fill={x.target ? x.eaten / x.target : 0}
        value={(k === 'kcal' ? kcal(x.eaten) : fmtNum(round1(x.eaten))) + ' / ' + fmtNum(x.target) + unit}
        ariaLabel={t('{0}: {1} of {2}', names[k], fmtNum(round1(x.eaten)) + unit, fmtNum(x.target) + unit)} />
    })}
  </div>
}

export default function Nutrition() {
  const nav = useNavigate()
  const [params, setParams] = useSearchParams()
  const S = useStore(s => s.S)
  const today = todayISO()
  const raw = params.get('d')
  const d = raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) && raw <= today ? raw : today
  const go = to => setParams(to === today ? {} : { d: to }, { replace: true })
  const totals = dailyTotals(S.foodLog, d)
  const targets = targetsOf(S)
  const left = Math.round(targets.kcal - totals.kcal)
  const byMeal = entriesByMeal(S.foodLog, d)
  const meals = mealCopy()

  // The starter foods (lib/nutrition-seed.js) go in on the first visit, so Add food is not empty.
  // Never again once they are there or any of them was deleted.
  const seedNow = shouldSeed(S)
  useEffect(() => {
    if (seedNow) update(s => { if (shouldSeed(s)) s.foods = [...(s.foods || []), ...starterFoodsToAdd(s)] })
  }, [seedNow])

  // /nutrition?add=1 (the Home card's Log button) opens Add food once.
  useEffect(() => {
    if (params.get('add') !== '1') return
    const next = new URLSearchParams(params); next.delete('add')
    setParams(next, { replace: true })
    addFoodSheet(d)
  }, [params, setParams, d])

  return <div className="narrow">
    <Header title={t('Nutrition')}>
      <button className="iconbtn" onClick={() => nav('/nutrition/history')} aria-label={t('History')}><Icon name="chartLine" /></button>
      <button className="iconbtn" onClick={() => nav('/nutrition/foods')} aria-label={t('Foods')}><Icon name="list" /></button>
      <button className="iconbtn" onClick={targetsSheet} aria-label={t('Daily targets')}><Icon name="target" /></button>
    </Header>

    <div className="nut-day row between">
      <button className="iconbtn" onClick={() => go(addDays(d, -1))} aria-label={t('Previous day')}><Icon name="chevronLeft" /></button>
      <b className="nut-day-t">{dayLabel(d)}</b>
      <button className="iconbtn" onClick={() => go(addDays(d, 1))} disabled={d >= today} aria-label={t('Next day')}><Icon name="chevronRight" /></button>
    </div>

    <div className="card nut-today">
      <div className="row between" style={{ marginBottom: 10 }}>
        <div>
          <div className="big">{kcal(totals.kcal)} <span className="muted" style={{ fontSize: 'var(--fs-callout)' }}>kcal</span></div>
          <div className="small" style={{ color: 'var(--label-2)', marginTop: 3 }}>
            {left >= 0 ? t('{0} kcal left', fmtNum(left)) : t('{0} kcal over', fmtNum(-left))}
          </div>
        </div>
        <Button size="sm" icon="plus" onClick={() => addFoodSheet(d)}>{t('Add food')}</Button>
      </div>
      <TargetBars totals={totals} targets={targets} />
    </div>

    <NutritionCoachCard d={d} />

    {MEALS.map(m => {
      const list = byMeal[m]
      const sum = list.reduce((s, e) => s + (Number(e.n?.kcal) || 0), 0)
      return <div className="nut-meal" key={m}>
        <div className="row between nut-meal-h">
          <h4 className="sec" style={{ margin: 0 }}>{meals[m]}{list.length > 0 && <span className="dim"> · {t('{0} kcal', kcal(sum))}</span>}</h4>
          <button className="iconbtn" onClick={() => addFoodSheet(d, m)} aria-label={t('Add to {0}', meals[m])}><Icon name="plus" /></button>
        </div>
        {list.length > 0 && <div className="list">{list.map(e => <SwipeRow key={e.id} className="swrow-item" onDelete={() => removeEntry(e)} deleteLabel={t('Delete')}>
          <button type="button" className="lrow tap nut-entry" onClick={() => editEntrySheet(e.id)}>
            <span className="lrow-m"><span className="lrow-t">{e.name}</span><MacroLine n={e.n || {}} className="lrow-s" /></span>
            <span className="lrow-v">{grams(e.grams)}</span>
          </button>
        </SwipeRow>)}</div>}
      </div>
    })}
  </div>
}

// ------------------------------------------------------------------ Foods --

export function NutritionFoods() {
  const S = useStore(s => s.S)
  const [q, setQ] = useState('')
  const foods = searchFoods(S.foods, q, 1000)
  const missing = starterFoodsToAdd(S, { restoreDeleted: true }).length
  const addStarters = () => {
    let n = 0
    update(s => { const add = starterFoodsToAdd(s, { restoreDeleted: true }); n = add.length; s.foods = [...(s.foods || []), ...add] })
    toast(t(n === 1 ? '{0} starter food added' : '{0} starter foods added', n))
  }
  return <div className="narrow">
    <Header title={t('Foods')} sub={t('{0} foods', (S.foods || []).length)} back="/nutrition" backLabel={t('Nutrition')}>
      <Button size="sm" icon="plus" onClick={() => foodFormSheet(null, { name: q.trim() })}>{t('New')}</Button>
    </Header>
    <SearchField value={q} onChange={e => setQ(e.target.value)} onClear={() => setQ('')} placeholder={t('Search foods')} />
    <div style={{ height: 10 }} />
    {foods.length ? <div className="list">{foods.map(f => <SwipeRow key={f.id} className="swrow-item" onDelete={() => removeFood(f)} deleteLabel={t('Delete')}>
      <div className="lrow nut-food">
        <button type="button" className="lrow-m nut-food-open" onClick={() => foodFormSheet(f.id)}>
          <span className="lrow-t">{f.name}</span>
          <span className="lrow-s">{t('{0} kcal', kcal(f.kcal))} · {t('P {0}', grams(f.protein))} · {t('C {0}', grams(f.carbs))} · {t('F {0}', grams(f.fat))} · {t('per 100 g')}{f.seed && !NUTRIENTS.some(k => f._f?.[k]) ? ' · ' + t('approximate') : ''}</span>
        </button>
        <button type="button" className="iconbtn" onClick={() => toggleFavourite(f)} aria-pressed={!!f.favourite}
          aria-label={f.favourite ? t('Remove from favourites') : t('Add to favourites')} style={f.favourite ? { color: 'var(--yellow)' } : undefined}>
          <Icon name={f.favourite ? 'starFill' : 'star'} />
        </button>
      </div>
    </SwipeRow>)}</div>
      : <div className="empty small">{q.trim() ? t('No food matches “{0}”.', q.trim()) : t('No foods yet. Add the foods you eat, with their values per 100 g from the label.')}</div>}
    {!q.trim() && missing > 0 && <>
      <div style={{ height: 12 }} />
      <Button variant="ghost" icon="plus" onClick={addStarters}>{t(missing === 1 ? 'Add {0} starter food' : 'Add {0} starter foods', missing)}</Button>
      <div className="small dim" style={{ marginTop: 4, textAlign: 'center' }}>{t('Common foods with approximate USDA values. Edit or delete any of them.')}</div>
    </>}
  </div>
}

// ---------------------------------------------------------------- History --

export function NutritionHistory() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const today = todayISO()
  const targets = targetsOf(S)
  const week = weeklySeries(S.foodLog, today)
  const avg = averageDay(week)
  const max = Math.max(targets.kcal, ...week.map(x => x.kcal)) || 1
  const days = dailySeries(S.foodLog, today, 60).filter(x => x.entries > 0).reverse()
  return <div className="narrow">
    <Header title={t('Nutrition history')} back="/nutrition" backLabel={t('Nutrition')} />
    <div className="card">
      <div className="muted small">{t('Last 7 days')}</div>
      <div className="big" style={{ marginTop: 3 }}>{avg ? <>{kcal(avg.kcal)} <span className="muted" style={{ fontSize: 'var(--fs-callout)' }}>{t('kcal a day')}</span></> : '–'}</div>
      {avg && <div className="small dim" style={{ marginTop: 3 }}>{t('Average of the {0} days you logged', avg.days)} · {t('P {0}', grams(avg.protein))} · {t('C {0}', grams(avg.carbs))} · {t('F {0}', grams(avg.fat))}</div>}
      <div className="nut-bars" style={{ marginTop: 12 }}>
        {week.map(x => <BarRow key={x.d} label={fmtDate(x.d)} fill={x.kcal / max} tick={targets.kcal / max}
          tone={x.entries ? toneOf('kcal', targets.kcal ? x.kcal / targets.kcal * 100 : null) : 'neutral'}
          value={x.entries ? kcal(x.kcal) : '–'} onClick={() => nav('/nutrition?d=' + x.d)}
          ariaLabel={t('{0}: {1} kcal', fmtDate(x.d, true), kcal(x.kcal))} />)}
      </div>
      <div className="small dim" style={{ marginTop: 6 }}>{t('The mark is your daily target of {0} kcal.', fmtNum(targets.kcal))}</div>
    </div>
    <h4 className="sec">{t('Daily totals')}</h4>
    {days.length ? <div className="sect-b">{days.map(x => <button type="button" key={x.d} className="lrow tap" onClick={() => nav('/nutrition?d=' + x.d)}>
      <span className="lrow-m"><span className="lrow-t">{dayLabel(x.d)}</span><MacroLine n={x} className="lrow-s" /></span>
      <Icon name="chevronRight" className="lrow-c" />
    </button>)}</div> : <div className="empty small">{t('Nothing logged yet.')}</div>}
  </div>
}
