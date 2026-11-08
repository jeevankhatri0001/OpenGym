// The set check-in: after a work set is ticked, "How did that feel?", and an answer like a coach
// standing next to you would give. All of it runs on the device, instantly and offline. The AI
// Coach is only suggested when something is wrong (pain), through the existing Ask the Coach.
//
// Two halves, both pure:
//   - checkinAdvice: the answer (feel + optional flag) and the set's numbers → what to do next.
//   - applyCheckin: that advice applied to the open work sets of the same exercise, in S.active.
//
// The rules follow the logged set, not a guess: a rep target missed counts, an easy set that hit
// its reps earns weight, a set at the limit gives some back. A logged set is never changed, only
// rows still to do (same rule as lib/coach-adapt.js). Nothing is applied without a tap.
import { isWarmupRow, hasCompletedWork, isSideSet, syncSideAggregate } from './workout-model.js'
import { modeOf, barFloor, liveReramp, effortOf } from './history.js'
import { dropGrid } from './plates.js'
import { snapDown } from './warmup-snap.js'
import { exView, inEntryUnit } from './ex-unit.js'
import { isAssisted } from './exercises.js'

export const FEELS = ['easy', 'solid', 'hard', 'max']
export const FLAGS = ['form', 'pain']
// Reps left in the tank for each answer. "Easy" is 4 or more; 4 is the honest floor of that.
export const FEEL_RIR = { easy: 4, solid: 2, hard: 1, max: 0 }

// How far one check-in may move the weight. Small on purpose: this is between sets, not a plan.
export const UP_PCT = 5
export const DOWN_PCT = 5
export const FORM_PCT = 10
export const MISS_PCT = 10

/**
 * What to do after a set. `reps` is what was logged, `targetReps` what the set asked for (null
 * when it had no target), `weight` the set's load (0 or null for bodyweight), `hasNext` whether a
 * work set of this exercise is still open.
 *
 * Returns { rir, action, tip, askCoach }:
 *   action: { type: 'weight', pct } | { type: 'reps', reps } | { type: 'hold' } | { type: 'stop' }
 *   tip:    an id the UI turns into one line of coaching (CHECKIN_TIPS in the sheet)
 */
export function checkinAdvice({ feel, flag = null, reps = null, targetReps = null, weight = null, hasNext = true } = {}) {
  const rir = FEEL_RIR[feel] ?? null
  const loaded = weight > 0
  const missed = targetReps > 0 && reps != null && reps < targetReps
  const missedBy = missed ? targetReps - reps : 0
  const out = (action, tip, askCoach = false) => ({ rir, action, tip, askCoach })

  // Pain outranks everything else: no number change from here, the lifter stops and may ask.
  if (flag === 'pain') return out({ type: 'stop' }, 'pain', true)
  if (!hasNext) return out({ type: 'hold' }, flag === 'form' ? 'formLast' : feel === 'easy' ? 'lastEasy' : 'lastDone')
  if (flag === 'form') return loaded ? out({ type: 'weight', pct: -FORM_PCT }, 'form') : out({ type: 'reps', reps: Math.max(1, (reps ?? targetReps ?? 2) - 2) }, 'formReps')

  switch (feel) {
    case 'easy':
      if (missed) return out({ type: 'hold' }, 'easyMissed')
      return loaded ? out({ type: 'weight', pct: UP_PCT }, 'easy') : out({ type: 'reps', reps: (reps ?? targetReps ?? 0) + 2 }, 'easyReps')
    case 'solid':
      return out({ type: 'hold' }, missed ? 'solidMissed' : 'solid')
    case 'hard':
      if (missedBy >= 2) return loaded ? out({ type: 'weight', pct: -DOWN_PCT }, 'hardMissed') : out({ type: 'reps', reps }, 'hardMissedReps')
      return out({ type: 'hold' }, 'hard')
    case 'max':
      if (missed) return loaded ? out({ type: 'weight', pct: -MISS_PCT }, 'maxMissed') : out({ type: 'reps', reps }, 'maxMissedReps')
      return loaded ? out({ type: 'weight', pct: -DOWN_PCT }, 'max') : out({ type: 'hold' }, 'maxReps')
    default:
      return out({ type: 'hold' }, 'solid')
  }
}

const openWorkIdx = entry => (entry?.sets || []).map((s, i) => (!isWarmupRow(s) && !hasCompletedWork(s) ? i : -1)).filter(i => i >= 0)

/** Whether the exercise at `idx` still has a work set to do. */
export const hasOpenWork = (active, idx) => openWorkIdx(active?.entries?.[idx]).length > 0

/** The set's effort in the profile's own scale: RPE when it logs RPE, RIR otherwise. */
export function effortFields(S, rir) {
  if (rir == null) return {}
  return effortOf(S) === 'rpe' ? { rpe: 10 - rir } : { rir }
}

// Up to the next weight the gym can actually load, never more than 15% over: a bump that the
// plates cannot make (61.5 kg from 60 on 2.5 kg steps) goes to the next real step, 62.5.
function snapUp(w, factor, grid) {
  const want = w * factor
  for (let x = want; x <= w * 1.15 + 1e-9; x += 0.25) {
    const v = snapDown(x, grid)
    if (v > w + 1e-9) return v
  }
  return w
}

/**
 * Applies `action` to the open work sets of the exercise at `idx` of the running session, and
 * writes the rated effort onto the logged set `setIdx` when it has none yet. Mutates `s` (call it
 * inside a store update). Returns what changed: { changed: boolean, from, to } for weight,
 * { changed, reps } for reps.
 */
export function applyCheckin(s, idx, setIdx, { rir = null, action } = {}) {
  const entry = s?.active?.entries?.[idx]
  if (!entry) return { changed: false }
  const logged = entry.sets[setIdx]
  if (logged && rir != null && logged.rir == null && logged.rpe == null) Object.assign(logged, effortFields(s, rir))
  if (!action || action.type === 'hold' || action.type === 'stop') return { changed: false }

  if (action.type === 'reps') {
    const reps = Math.max(1, Math.round(action.reps))
    let changed = false
    for (const i of openWorkIdx(entry)) {
      const row = entry.sets[i]
      if (isSideSet(row)) continue
      if (row.r != null && row.r !== reps) { entry.sets[i] = { ...row, r: reps }; changed = true }
    }
    return { changed, reps }
  }

  if (action.type === 'weight') {
    const factor = 1 + action.pct / 100
    let from = null, to = null
    inEntryUnit(s, idx, e => {
      const cfg = { ...(e.target || {}), id: e.id }
      const V = exView(s, e.id)
      const grid = dropGrid(V, cfg)
      const floor = barFloor(V, e.id)
      const move = w => {
        if (!(w > 0)) return w
        return action.pct > 0 ? snapUp(w, factor, grid) : Math.max(floor, snapDown(w * factor, grid))
      }
      for (const i of openWorkIdx(e)) {
        const row = e.sets[i]
        if (isSideSet(row)) {
          e.sets[i] = syncSideAggregate({ ...row, sides: { L: { ...row.sides.L, w: move(row.sides.L.w) }, R: { ...row.sides.R, w: move(row.sides.R.w) } } })
        } else {
          const nw = move(row.w)
          if (from == null) { from = row.w; to = nw }
          e.sets[i] = { ...row, w: nw }
        }
      }
      if (modeOf(cfg) === 'reps') e.sets = liveReramp(e.sets, grid, floor, isAssisted(cfg))
    })
    return { changed: from != null && to !== from, from, to }
  }
  return { changed: false }
}
