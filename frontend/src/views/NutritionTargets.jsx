import { useStore } from '../store/useStore.js'
import { t } from '../lib/i18n.js'
import { DEFAULT_TARGETS, NUTRIENTS, TARGET_MAX, targetsOf } from '../lib/nutrition.js'
import { fmtNum } from '../lib/format.js'
import { Button, NumberField, Row, Section } from '../components/ui.jsx'

// Settings → Nutrition targets (views/settings-pages.js `nutrition`, the Nutrition module's page).
// One row per nutrient, each saved on its own: S.nutritionTargets syncs per key (lib/sync-merge.js
// PER_KEY), so protein set on the phone and calories on the laptop both hold. An empty field goes
// back to the default (null, kept, so the reset itself syncs per key).
const titles = () => ({ kcal: t('Calories'), protein: t('Protein'), carbs: t('Carbs'), fat: t('Fat'), fibre: t('Fibre') })

export default function NutritionTargetsPage() {
  const S = useStore(s => s.S)
  const update = useStore(s => s.update)
  const now = targetsOf(S)
  const set = (k, v) => update(s => {
    const next = { ...(s.nutritionTargets || {}) }
    if (v == null) next[k] = null                  // null, not a missing key: the reset syncs per key too
    else next[k] = Math.max(0, Math.min(TARGET_MAX[k], Math.round(v)))
    s.nutritionTargets = next
  })
  const custom = NUTRIENTS.some(k => S.nutritionTargets?.[k] != null)
  const names = titles()
  return <>
    <Section footer={t('What you aim to eat in a day. The bars on the Nutrition screen fill toward these.')}>
      {NUTRIENTS.map(k => <Row key={k} title={names[k]} subtitle={t('Default {0}', fmtNum(DEFAULT_TARGETS[k]) + (k === 'kcal' ? ' kcal' : ' g'))}>
        <span className="measure-input nut-target">
          <NumberField nullable decimal={false} value={S.nutritionTargets?.[k] != null ? now[k] : null} placeholder={String(DEFAULT_TARGETS[k])}
            aria-label={names[k]} onChange={v => set(k, v)} />
          <i>{k === 'kcal' ? 'kcal' : 'g'}</i>
        </span>
      </Row>)}
    </Section>
    {custom && <Button variant="ghost" onClick={() => update(s => { s.nutritionTargets = Object.fromEntries(NUTRIENTS.map(k => [k, null])) })}>{t('Back to the defaults')}</Button>}
  </>
}
