import { NumberField } from './ui.jsx'
import { t } from '../lib/i18n.js'
import { fmtNum } from '../lib/format.js'
import { GRAMS_MAX, cleanGrams } from '../lib/nutrition.js'

// How many grams of a food (Nutrition, docs/NUTRITION.md). Controlled and nothing else: the value
// comes in through `value` and every change leaves through `onChange(grams, how)`, where `how` says
// what set it ('typed', 'quick', 'serving'). Nothing here keeps grams of its own, so a kitchen
// scale can drive it later by calling the same onChange with ('scale') and its reading; the
// screen then logs the entry with source 'scale' (lib/nutrition.js SOURCES).
//
// `servings` are the food's own amounts ([{ label, g }], "1 egg" = 50 g), offered beside the quick
// amounts; `quick` overrides the quick amounts in grams.
export const QUICK_GRAMS = [50, 100, 150, 200]

export default function GramsInput({ value, onChange, servings = [], quick = QUICK_GRAMS, label, autoFocus = false, className = '' }) {
  const g = cleanGrams(value)
  const set = (v, how) => onChange?.(v, how)
  return <div className={'grams-in' + (className ? ' ' + className : '')}>
    <label className="grams-field">
      <span>{label ?? t('Amount')}</span>
      <span className="grams-input">
        <NumberField nullable value={value ?? null} autoFocus={autoFocus} aria-label={label ?? t('Amount')}
          onChange={v => set(v == null ? null : Math.min(GRAMS_MAX, v), 'typed')} />
        <i>g</i>
      </span>
    </label>
    <div className="chips grams-chips" role="group" aria-label={t('Quick amounts')}>
      {(servings || []).map(s => <button type="button" key={'s' + s.label + s.g} className={'chip' + (g === s.g ? ' on' : '')}
        onClick={() => set(s.g, 'serving')}>{s.label} <span className="dim">{fmtNum(s.g)} g</span></button>)}
      {quick.map(q => <button type="button" key={q} className={'chip' + (g === q ? ' on' : '')}
        onClick={() => set(q, 'quick')}>{fmtNum(q)} g</button>)}
    </div>
  </div>
}
