// The set check-in (Settings: "Coach check-in after each set"): a work set ticked in a live session
// asks "How did that feel?", and answers like a coach beside the rack would. The rules are local and
// instant (lib/set-checkin.js); the rest timer keeps running underneath. Nothing changes until
// Apply, and only the sets still to do. "Something hurt" stops there and, when the AI Coach is set
// up, hands over to Ask the Coach (components/WorkoutCoachSheet.jsx) with the reason filled in.
import { useMemo, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t } from '../lib/i18n.js'
import { fmtNum } from '../lib/format.js'
import { exTitle } from '../lib/coach.js'
import { rirOf } from '../lib/effort.js'
import { exView } from '../lib/ex-unit.js'
import { checkinAdvice, applyCheckin, hasOpenWork, FEELS } from '../lib/set-checkin.js'
import { workoutCoachSheet } from './WorkoutCoachSheet.jsx'
import Icon from './Icon.jsx'
import { Button } from './ui.jsx'
import '../coach.css'

const FEEL_LABEL = {
  easy: () => t('Easy'),
  solid: () => t('Solid'),
  hard: () => t('Hard'),
  max: () => t('All I had'),
}

// One line a tired person reads between sets. Keyed by checkinAdvice's `tip`.
const TIPS = {
  easy: () => t('Moving well. Add a little weight and keep the reps clean.'),
  easyReps: () => t('Too easy. Add two reps to the next set.'),
  easyMissed: () => t('Felt easy, but the reps fell short. Keep the weight and finish every rep.'),
  solid: () => t('Right where you want it. Same weight, same focus.'),
  solidMissed: () => t('Good effort. Keep the weight and chase the full reps next set.'),
  hard: () => t('Tough set. Hold the weight and own the reps.'),
  hardMissed: () => t('That one fought back. Take a little off so the next set stays clean.'),
  hardMissedReps: () => t('Match what you just did. Clean reps beat grinding.'),
  max: () => t('All you had. Take a little off so the rest of the sets go well.'),
  maxMissed: () => t('You hit your limit. Drop the weight and finish strong.'),
  maxMissedReps: () => t('You hit your limit. Aim for what you just managed.'),
  maxReps: () => t('All you had. Take your full rest before the next one.'),
  form: () => t('Form comes first. Lighter weight, clean reps.'),
  formReps: () => t('Form comes first. Fewer reps, done well.'),
  formLast: () => t('Form slipped at the end. Start a little lighter next time.'),
  lastEasy: () => t('Exercise done, with reps to spare. Your progression will pick that up.'),
  lastDone: () => t('Exercise done. Nice work.'),
  pain: () => t('Stop this exercise for now. Pain is a signal, not a challenge. If it does not settle, see a professional.'),
}

// A saved rating picks the matching answer, so a set rated with the effort picker opens on it.
const feelOf = rir => rir == null ? null : rir >= 4 ? 'easy' : rir >= 2 ? 'solid' : rir >= 1 ? 'hard' : 'max'

export function SetCheckin({ entryIdx, setIdx, activeId, canAskCoach = false, close }) {
  const S = useStore(s => s.S)
  const update = useStore(s => s.update)
  const live = S.active?.id === activeId
  const entry = S.active?.entries?.[entryIdx]
  const row = entry?.sets?.[setIdx]
  const [feel, setFeel] = useState(() => feelOf(rirOf(row)))
  const [flag, setFlag] = useState(null)

  const V = entry ? exView(S, entry.id) : S
  const shown = V?.active?.entries?.[entryIdx]?.sets?.[setIdx] || row
  const unit = V?.unit || S.unit
  const target = entry?.target?.reps ?? null
  const advice = (feel || flag === 'pain') && row
    ? checkinAdvice({ feel: feel || 'solid', flag, reps: row.r ?? null, targetReps: target, weight: row.w ?? null, hasNext: hasOpenWork(S.active, entryIdx) })
    : null

  // What Apply would do, worked out on a copy so the line can name the new numbers.
  const preview = useMemo(() => {
    if (!advice || !live) return null
    const a = advice.action
    if (a.type !== 'weight' && a.type !== 'reps') return null
    const copy = structuredClone(S)
    const r = applyCheckin(copy, entryIdx, setIdx, advice)
    if (!r.changed) return null
    return a.type === 'weight' ? t('Next sets: {0}', fmtNum(r.to) + ' ' + unit) : t('Next sets: {0} reps', r.reps)
  }, [advice?.tip, advice?.action?.type, advice?.action?.pct, advice?.action?.reps, live, S, entryIdx, setIdx, unit])

  if (!entry || !row) return null

  const save = (withChange) => {
    if (live && advice) update(s => { applyCheckin(s, entryIdx, setIdx, withChange ? advice : { rir: advice.rir, action: { type: 'hold' } }) })
    close()
  }
  const askCoach = () => {
    save(false)
    workoutCoachSheet(entryIdx, { reason: 'pain' })
  }

  const what = row.w > 0 ? t('{0} × {1}', fmtNum(shown.w) + ' ' + unit, row.r ?? '?') : t('{0} reps', row.r ?? '?')
  return <div className="workout-coach set-checkin">
    <div className="pcard-eyebrow"><Icon name="sparkles" /> {t('Coach check-in')}</div>
    <h2 className="pcard-h" style={{ margin: '4px 0 2px' }}>{t('How did that feel?')}</h2>
    <p className="small dim" style={{ marginBottom: 12 }}>{exTitle(entry.id)} · {what}</p>

    <div className="adapt-reasons" role="group" aria-label={t('How did that feel?')}>
      {FEELS.map(k => <button key={k} type="button" className={'chip' + (feel === k ? ' on' : '')} aria-pressed={feel === k} onClick={() => setFeel(k)}>
        {FEEL_LABEL[k]()}
      </button>)}
    </div>
    <div className="adapt-reasons" role="group" aria-label={t('Anything wrong?')}>
      <button type="button" className={'chip' + (flag === 'form' ? ' on' : '')} aria-pressed={flag === 'form'} onClick={() => setFlag(f => f === 'form' ? null : 'form')}>
        <Icon name="warning" /> {t('Form broke down')}
      </button>
      <button type="button" className={'chip' + (flag === 'pain' ? ' on' : '')} aria-pressed={flag === 'pain'} onClick={() => setFlag(f => f === 'pain' ? null : 'pain')}>
        <Icon name="warning" /> {t('Something hurt')}
      </button>
    </div>

    {advice && <div className="pcard-chg" role="status">
      <div className="grow">
        <div className="pcard-chg-t">{TIPS[advice.tip]?.() || ''}</div>
        {preview && <div className="pcard-chg-w">{preview}</div>}
      </div>
    </div>}

    <div className="pcard-ft" style={{ paddingInline: 0 }}>
      {advice?.askCoach && canAskCoach && live
        ? <Button variant="primary" icon="sparkles" onClick={askCoach}>{t('Ask the Coach')}</Button>
        : preview
          ? <Button variant="primary" icon="check" onClick={() => save(true)}>{t('Apply')}</Button>
          : <Button variant="primary" icon="check" onClick={() => save(false)} disabled={!advice}>{t('Got it')}</Button>}
      <Button onClick={advice ? () => save(false) : close}>{advice && preview ? t('Keep as planned') : t('Skip')}</Button>
    </div>
  </div>
}

/** Opens the check-in for set `setIdx` of the exercise at `entryIdx` in the running session. */
export function setCheckinSheet(entryIdx, setIdx, { canAskCoach = false } = {}) {
  const activeId = useStore.getState().S.active?.id
  return useUI.getState().openSheet(close => <SetCheckin entryIdx={entryIdx} setIdx={setIdx} activeId={activeId} canAskCoach={canAskCoach} close={close} />)
}
