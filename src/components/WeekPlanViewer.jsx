import { useState } from 'react'
import { X, ChevronDown, ChevronUp, Edit3, RefreshCw, Loader2, Plus, Trash2, Sparkles } from 'lucide-react'
import Modal from './Modal'
import { getActiveSlots, normalizeMealSlots } from '../lib/utils'
import { generateMealPlanWithLLM } from '../lib/mealRecommendation'
import { updateMealPlan, saveMealPlan, updatePlanMeta } from '../lib/db'

function sumNutrition(meals, slots) {
  let cal = 0, pro = 0, carb = 0, fat = 0
  for (const s of slots) {
    const n = meals[s.key]?.nutrition
    if (!n) continue
    cal  += n.calories || 0
    pro  += n.protein  || 0
    carb += n.carbs    || 0
    fat  += n.fat      || 0
  }
  return { cal: Math.round(cal), pro: Math.round(pro), carb: Math.round(carb), fat: Math.round(fat) }
}

export default function WeekPlanViewer({
  plan: initialPlan, planId: initialPlanId, targets,
  planName: initialName = '', planTags: initialTags = [],
  mealSlots, planCreatedAt,
  profile, userId, onClose, onPlanUpdate, onNewPlanCreated,
  mode = 'edit', onRestore,
}) {
  const [plan, setPlan]             = useState(initialPlan || [])
  const [planId, setPlanId]         = useState(initialPlanId)
  const [selectedDay, setSelectedDay] = useState(0)
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState('')
  const isReadOnly = mode === 'history'

  // ── Plan name + tags ─────────────────────────────────────────────────────────
  const [planName, setPlanName]     = useState(initialName)
  const [planTags, setPlanTags]     = useState(initialTags || [])
  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput]   = useState(initialName)
  const [tagInput, setTagInput]     = useState('')

  async function saveName() {
    setEditingName(false)
    const trimmed = nameInput.trim()
    setPlanName(trimmed)
    if (planId) await updatePlanMeta(planId, { name: trimmed || null, tags: planTags }).catch(() => {})
  }

  async function addTag(tag) {
    const t = tag.trim().toLowerCase()
    if (!t || planTags.includes(t)) return
    const next = [...planTags, t]
    setPlanTags(next)
    if (planId) await updatePlanMeta(planId, { name: planName || null, tags: next }).catch(() => {})
  }

  async function removeTag(tag) {
    const next = planTags.filter(t => t !== tag)
    setPlanTags(next)
    if (planId) await updatePlanMeta(planId, { name: planName || null, tags: next }).catch(() => {})
  }

  // ── Edit meal modal ──────────────────────────────────────────────────────────
  const [editModal, setEditModal]           = useState(null) // { dayIdx, slotKey }
  const [editName, setEditName]             = useState('')
  const [editRecipe, setEditRecipe]         = useState('')
  const [editIngredients, setEditIngredients] = useState([])
  const [editNutrition, setEditNutrition]   = useState({ calories: '', protein: '', carbs: '', fat: '', fibre: '' })

  // ── Regen modal (day or full plan) ───────────────────────────────────────────
  const [regenModal, setRegenModal]   = useState(null) // 'day' | 'plan'
  const [regenPrompt, setRegenPrompt] = useState('')
  const [regening, setRegening]       = useState(false)
  // After AI returns: pending result waiting for user review
  const [pendingResult, setPendingResult] = useState(null) // { newPlan, newTargets, kind }
  // diffItems: [{ dayIdx, slotKey, slotLabel, dayLabel, oldName, newMeal, accepted }]
  const [diffItems, setDiffItems]     = useState([])

  const slots    = getActiveSlots(normalizeMealSlots(mealSlots))
  const dayData  = plan[selectedDay] || {}
  const dayTotals = sumNutrition(dayData, slots)

  // ── Save helpers ─────────────────────────────────────────────────────────────
  // Update the current plan row (meal edits, single-day regen)
  async function persistEdit(updated) {
    setPlan(updated)
    onPlanUpdate?.(updated)
    if (!planId) return
    setSaving(true)
    try {
      await updateMealPlan(planId, { plan: updated, targets, source: 'edited' })
    } catch (e) {
      setError(`Save failed: ${e.message}`)
    } finally {
      setSaving(false)
    }
  }

  // Insert a brand-new plan row (full regen → new history entry)
  async function persistNewPlan(updated, newTargets) {
    if (!userId) return
    setSaving(true)
    try {
      const row = await saveMealPlan(userId, { plan: updated, targets: newTargets || targets, source: 'regenerated' })
      setPlan(updated)
      setPlanId(row?.id)
      onNewPlanCreated?.({ id: row?.id, created_at: row?.created_at, plan: updated, targets: newTargets || targets })
    } catch (e) {
      setError(`Save failed: ${e.message}`)
    } finally {
      setSaving(false)
    }
  }

  // ── Edit meal ────────────────────────────────────────────────────────────────
  function openEdit(dayIdx, slotKey) {
    const meal = plan[dayIdx]?.[slotKey] || {}
    setEditName(meal.name || '')
    setEditRecipe(meal.recipe || '')
    setEditIngredients((meal.ingredients || []).map(i => ({ ...i })))
    const n = meal.nutrition || {}
    setEditNutrition({
      calories: n.calories ?? '',
      protein:  n.protein  ?? '',
      carbs:    n.carbs    ?? '',
      fat:      n.fat      ?? '',
      fibre:    n.fibre    ?? '',
    })
    setEditModal({ dayIdx, slotKey })
  }

  async function saveEdit() {
    const updated = plan.map((day, di) => {
      if (di !== editModal.dayIdx) return day
      const nutrition = {
        calories: editNutrition.calories !== '' ? Number(editNutrition.calories) : null,
        protein:  editNutrition.protein  !== '' ? Number(editNutrition.protein)  : null,
        carbs:    editNutrition.carbs    !== '' ? Number(editNutrition.carbs)    : null,
        fat:      editNutrition.fat      !== '' ? Number(editNutrition.fat)      : null,
        fibre:    editNutrition.fibre    !== '' ? Number(editNutrition.fibre)    : null,
      }
      return {
        ...day,
        [editModal.slotKey]: {
          ...day[editModal.slotKey],
          name:        editName,
          recipe:      editRecipe,
          ingredients: editIngredients.filter(i => i.name.trim()),
          nutrition,
        },
      }
    })
    setEditModal(null)
    await persistEdit(updated)
  }

  // ── Regenerate ───────────────────────────────────────────────────────────────
  async function confirmRegen() {
    if (!profile) return
    const kind = regenModal  // capture before closing
    setRegening(true)
    setError('')
    try {
      const profileForAI = {
        age:               profile.age,
        sex:               profile.sex,
        height:            profile.height,
        weight:            profile.weight,
        exerciseFrequency: profile.exercise_frequency,
        allergies:         profile.allergies,
      }
      const result = await generateMealPlanWithLLM(profileForAI, {
        slots:       slots,
        alternate:   true,
        currentPlan: plan,
        userPrompt:  regenPrompt.trim() || undefined,
      })

      setRegenModal(null)
      setRegenPrompt('')

      // Build the proposed plan (not yet applied)
      let proposedPlan
      if (kind === 'day') {
        const newDay = result.plan[selectedDay] || result.plan[0]
        proposedPlan = plan.map((d, i) => i === selectedDay ? { ...newDay, day: i + 1 } : d)
      } else {
        proposedPlan = result.plan
      }

      // Compute diff — only meals whose name actually changed
      const baseDate = new Date(planCreatedAt || Date.now())
      const items = []
      proposedPlan.forEach((newDay, di) => {
        const dayDate = new Date(baseDate.getTime() + di * 86400000)
        const dayLbl  = dayDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
        slots.forEach(slot => {
          const oldName = plan[di]?.[slot.key]?.name
          const newMeal = newDay[slot.key]
          if (newMeal && oldName !== newMeal.name) {
            items.push({ dayIdx: di, slotKey: slot.key, slotLabel: slot.label, dayLabel: dayLbl, oldName: oldName || '—', newMeal, accepted: true })
          }
        })
      })

      if (items.length === 0) {
        // Nothing changed (shouldn't happen often) — save immediately
        if (kind === 'day') await persistEdit(proposedPlan)
        else                await persistNewPlan(proposedPlan, result.targets)
      } else {
        setDiffItems(items)
        setPendingResult({ proposedPlan, newTargets: result.targets, kind })
      }
    } catch (e) {
      setError(`Regeneration failed: ${e.message}`)
    } finally {
      setRegening(false)
    }
  }

  // ── Apply diff ───────────────────────────────────────────────────────────────
  async function applyDiff() {
    if (!pendingResult) return
    const { proposedPlan, newTargets, kind } = pendingResult
    const accepted = diffItems.filter(d => d.accepted)

    // Start from the current plan; overlay accepted changes
    const merged = plan.map((day, di) => {
      const acceptedForDay = accepted.filter(d => d.dayIdx === di)
      if (acceptedForDay.length === 0) return day
      const patched = { ...day }
      acceptedForDay.forEach(d => { patched[d.slotKey] = d.newMeal })
      return patched
    })

    setDiffItems([])
    setPendingResult(null)

    if (kind === 'day') {
      await persistEdit(merged)
    } else {
      await persistNewPlan(merged, newTargets)
    }
  }

  function discardDiff() {
    setDiffItems([])
    setPendingResult(null)
  }

  if (!plan.length) return null

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-bg">
      {/* Header */}
      <div className="bg-white border-b border-border px-4 pt-10 pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0 mr-2">
            {/* Editable plan name */}
            {!isReadOnly && editingName ? (
              <input
                className="text-lg font-bold text-textPrimary border-b-2 border-teal-500 outline-none bg-transparent w-full"
                value={nameInput}
                onChange={e => setNameInput(e.target.value)}
                onBlur={saveName}
                onKeyDown={e => { if (e.key === 'Enter') saveName() }}
                autoFocus
                maxLength={60}
                placeholder="Plan name…"
              />
            ) : (
              <div
                className={`flex items-center gap-1.5 ${!isReadOnly ? 'cursor-pointer group' : ''}`}
                onClick={() => { if (!isReadOnly) { setNameInput(planName); setEditingName(true) } }}
              >
                <h2 className="text-lg font-bold text-textPrimary truncate">
                  {planName || 'Week Plan'}
                </h2>
                {!isReadOnly && (
                  <span className="text-textSecondary opacity-0 group-hover:opacity-100 transition-opacity">
                    <Edit3 size={13} />
                  </span>
                )}
              </div>
            )}

            {targets && (
              <p className="text-xs text-textSecondary mt-0.5">
                Target {targets.maintenanceCalories} kcal · {targets.proteinG}g P · {targets.carbsG}g C · {targets.fatG}g F
              </p>
            )}

            {/* Tag chips */}
            <div className="flex flex-wrap gap-1.5 mt-2">
              {planTags.map(tag => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 border border-teal-200"
                >
                  {tag}
                  {!isReadOnly && (
                    <button onClick={() => removeTag(tag)} className="hover:text-red-500 leading-none">&times;</button>
                  )}
                </span>
              ))}
              {!isReadOnly && (
                <form onSubmit={e => { e.preventDefault(); addTag(tagInput); setTagInput('') }}>
                  <input
                    className="text-[11px] font-medium px-2 py-0.5 rounded-full border border-dashed border-border text-textSecondary bg-transparent focus:outline-none focus:border-teal-400 w-20"
                    placeholder="+ tag"
                    value={tagInput}
                    onChange={e => setTagInput(e.target.value)}
                    onBlur={() => { if (tagInput.trim()) { addTag(tagInput); setTagInput('') } }}
                  />
                </form>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {saving && <Loader2 size={14} className="text-teal-500 animate-spin" />}
            {!isReadOnly && (
              <button
                onClick={() => { setRegenPrompt(''); setRegenModal('plan') }}
                className="flex items-center gap-1 text-xs text-textSecondary border border-border rounded-lg px-2.5 py-1.5 active:bg-bg"
              >
                <Sparkles size={12} /> Regenerate plan
              </button>
            )}
            <button onClick={onClose} className="p-1.5 text-textSecondary active:bg-bg rounded-lg">
              <X size={20} />
            </button>
          </div>
        </div>
        {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
      </div>

      {/* Day tabs */}
      <div className="bg-white border-b border-border px-3 py-2 flex gap-1.5 overflow-x-auto shrink-0">
        {plan.map((_, i) => {
          const d = new Date(new Date(planCreatedAt || Date.now()).getTime() + i * 86400000)
          return (
            <button
              key={i}
              onClick={() => setSelectedDay(i)}
              className={`shrink-0 flex flex-col items-center px-3 py-1.5 rounded-xl text-center transition-colors ${
                selectedDay === i ? 'bg-teal-500 text-white' : 'bg-bg text-textSecondary border border-border'
              }`}
            >
              <span className="text-[10px] font-semibold uppercase tracking-wide leading-none">
                {d.toLocaleDateString('en-US', { weekday: 'short' })}
              </span>
              <span className="text-sm font-bold mt-0.5 leading-none">{d.getDate()}</span>
            </button>
          )
        })}
      </div>

      {/* Day macro bar + Regenerate day */}
      <div className="bg-white border-b border-border px-4 py-2.5 flex items-center gap-3 shrink-0">
        {dayTotals.cal > 0 ? (
          <div className="flex-1 grid grid-cols-4 gap-2 text-center">
            {[
              { label: 'Cal',    val: dayTotals.cal,  unit: 'kcal', target: targets?.maintenanceCalories, color: 'text-teal-500' },
              { label: 'Protein', val: dayTotals.pro, unit: 'g',    target: targets?.proteinG,            color: 'text-blue-500' },
              { label: 'Carbs',  val: dayTotals.carb, unit: 'g',    target: targets?.carbsG,              color: 'text-orange-400' },
              { label: 'Fat',    val: dayTotals.fat,  unit: 'g',    target: targets?.fatG,                color: 'text-textSecondary' },
            ].map(({ label, val, unit, target, color }) => (
              <div key={label}>
                <p className={`text-sm font-bold ${color}`}>{val}<span className="text-[9px] font-normal ml-0.5">{unit}</span></p>
                {target
                  ? <p className="text-[9px] text-textSecondary">/ {target}</p>
                  : <p className="text-[9px] text-textSecondary">{label}</p>}
                {target && (
                  <div className="mt-0.5 h-0.5 bg-border rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${color.replace('text-', 'bg-')}`}
                      style={{ width: `${Math.min(100, (val / target) * 100)}%` }} />
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : <div className="flex-1" />}

        {!isReadOnly && (
          <button
            onClick={() => { setRegenPrompt(''); setRegenModal('day') }}
            className="shrink-0 flex items-center gap-1 text-xs text-textSecondary border border-border rounded-lg px-2.5 py-1.5 active:bg-bg"
          >
            <RefreshCw size={11} /> New day
          </button>
        )}
      </div>

      {/* Meal list */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {slots.map(slotObj => {
          const meal = dayData[slotObj.key]
          if (!meal) return null
          return (
            <MealCard
              key={slotObj.key}
              slotLabel={slotObj.label}
              meal={meal}
              onEdit={isReadOnly ? null : () => openEdit(selectedDay, slotObj.key)}
            />
          )
        })}
      </div>

      {/* Restore button (history mode only) */}
      {isReadOnly && onRestore && (
        <div className="px-4 pb-8 pt-3 bg-white border-t border-border shrink-0">
          <button
            onClick={onRestore}
            className="w-full bg-teal-500 text-white font-semibold py-3.5 rounded-xl active:bg-teal-600"
          >
            Restore this plan
          </button>
          <p className="text-[11px] text-textSecondary text-center mt-2">
            This will become your active plan. Your current plan is still saved in history.
          </p>
        </div>
      )}

      {/* ── Edit meal modal ── */}
      <Modal
        open={!!editModal}
        onClose={() => setEditModal(null)}
        title={editModal ? `Edit — ${slots.find(s => s.key === editModal.slotKey)?.label || editModal.slotKey}` : ''}
      >
        <div className="space-y-3 max-h-[65vh] overflow-y-auto">
          <div>
            <label className="text-xs font-medium text-textSecondary block mb-1">Meal name</label>
            <input
              className="w-full border border-border rounded-lg px-3 py-2 text-sm text-textPrimary focus:outline-none focus:border-teal-500"
              value={editName}
              onChange={e => setEditName(e.target.value)}
              autoFocus
            />
          </div>
          <div>
            <label className="text-xs font-medium text-textSecondary block mb-1">Recipe / instructions</label>
            <textarea
              className="w-full border border-border rounded-lg px-3 py-2 text-sm text-textPrimary focus:outline-none focus:border-teal-500 resize-none"
              rows={2}
              value={editRecipe}
              onChange={e => setEditRecipe(e.target.value)}
            />
          </div>

          {/* Ingredients */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-textSecondary">Ingredients</label>
              <button
                type="button"
                onClick={() => setEditIngredients(i => [...i, { quantity: '', name: '' }])}
                className="text-xs text-teal-500 flex items-center gap-0.5"
              >
                <Plus size={12} /> Add
              </button>
            </div>
            <div className="space-y-1.5">
              {editIngredients.map((ing, idx) => (
                <div key={idx} className="flex gap-1.5 items-center">
                  <input
                    className="w-20 border border-border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-teal-500"
                    placeholder="Qty"
                    value={ing.quantity}
                    onChange={e => setEditIngredients(items => items.map((item, i) => i === idx ? { ...item, quantity: e.target.value } : item))}
                  />
                  <input
                    className="flex-1 border border-border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-teal-500"
                    placeholder="Ingredient"
                    value={ing.name}
                    onChange={e => setEditIngredients(items => items.map((item, i) => i === idx ? { ...item, name: e.target.value } : item))}
                  />
                  <button
                    type="button"
                    onClick={() => setEditIngredients(items => items.filter((_, i) => i !== idx))}
                    className="text-textSecondary hover:text-red-500 p-1"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Nutrition */}
          <div>
            <label className="text-xs font-medium text-textSecondary block mb-1">Nutrition (optional)</label>
            <div className="grid grid-cols-5 gap-1.5">
              {[
                { key: 'calories', label: 'kcal' },
                { key: 'protein',  label: 'P (g)' },
                { key: 'carbs',    label: 'C (g)' },
                { key: 'fat',      label: 'F (g)' },
                { key: 'fibre',    label: 'Fi (g)' },
              ].map(({ key, label }) => (
                <div key={key}>
                  <p className="text-[10px] text-textSecondary text-center mb-0.5">{label}</p>
                  <input
                    type="number"
                    className="w-full border border-border rounded-lg px-1.5 py-1.5 text-xs text-textPrimary focus:outline-none focus:border-teal-500 text-center"
                    value={editNutrition[key]}
                    onChange={e => setEditNutrition(n => ({ ...n, [key]: e.target.value }))}
                    placeholder="—"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
        <button
          onClick={saveEdit}
          disabled={saving}
          className="w-full bg-teal-500 text-white font-semibold py-3 rounded-xl mt-4 active:bg-teal-600 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {saving ? <Loader2 size={15} className="animate-spin" /> : 'Save changes'}
        </button>
      </Modal>

      {/* ── Diff review modal ── */}
      <Modal
        open={diffItems.length > 0}
        onClose={discardDiff}
        title={`Review changes (${diffItems.filter(d => d.accepted).length} of ${diffItems.length} selected)`}
      >
        <div className="space-y-2 max-h-[55vh] overflow-y-auto">
          <p className="text-xs text-textSecondary pb-1">
            Toggle individual meals on/off, then apply only the ones you want.
          </p>
          {diffItems.map((item, idx) => (
            <div
              key={idx}
              onClick={() => setDiffItems(prev => prev.map((d, i) => i === idx ? { ...d, accepted: !d.accepted } : d))}
              className={`rounded-xl border p-3 cursor-pointer transition-colors select-none ${
                item.accepted ? 'border-teal-300 bg-teal-50/40' : 'border-border bg-white opacity-50'
              }`}
            >
              <div className="flex items-start gap-2">
                {/* Checkbox */}
                <div className={`mt-0.5 w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${
                  item.accepted ? 'border-teal-500 bg-teal-500' : 'border-border bg-white'
                }`}>
                  {item.accepted && <svg width="8" height="6" viewBox="0 0 8 6" fill="none"><path d="M1 3l2 2 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-semibold text-textSecondary uppercase tracking-wide">
                    {item.slotLabel} · {item.dayLabel}
                  </p>
                  {/* Old → New */}
                  <div className="mt-1 space-y-0.5">
                    <div className="flex items-center gap-1.5 text-xs">
                      <span className="text-[10px] font-semibold text-red-400 bg-red-50 px-1.5 py-0.5 rounded shrink-0">was</span>
                      <span className="text-textSecondary line-through truncate">{item.oldName}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs">
                      <span className="text-[10px] font-semibold text-teal-600 bg-teal-50 px-1.5 py-0.5 rounded shrink-0">new</span>
                      <span className="text-textPrimary font-medium truncate">{item.newMeal.name}</span>
                    </div>
                    {item.newMeal.nutrition?.calories && (
                      <p className="text-[10px] text-textSecondary pl-8">
                        {item.newMeal.nutrition.calories} kcal · {item.newMeal.nutrition.protein}g P · {item.newMeal.nutrition.carbs}g C · {item.newMeal.nutrition.fat}g F
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 space-y-2">
          {/* Select all / none */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setDiffItems(prev => prev.map(d => ({ ...d, accepted: true })))}
              className="flex-1 text-xs font-medium py-2 rounded-lg border border-border text-textSecondary active:bg-bg"
            >
              Select all
            </button>
            <button
              type="button"
              onClick={() => setDiffItems(prev => prev.map(d => ({ ...d, accepted: false })))}
              className="flex-1 text-xs font-medium py-2 rounded-lg border border-border text-textSecondary active:bg-bg"
            >
              Select none
            </button>
          </div>

          <button
            onClick={applyDiff}
            disabled={saving || diffItems.filter(d => d.accepted).length === 0}
            className="w-full bg-teal-500 text-white font-semibold py-3 rounded-xl disabled:opacity-40 active:bg-teal-600 flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 size={15} className="animate-spin" /> : `Apply ${diffItems.filter(d => d.accepted).length} change${diffItems.filter(d => d.accepted).length !== 1 ? 's' : ''}`}
          </button>
          <button
            onClick={discardDiff}
            className="w-full text-sm text-textSecondary py-2 active:opacity-70"
          >
            Discard all suggestions
          </button>
        </div>
      </Modal>

      {/* ── Regenerate modal ── */}
      <Modal
        open={!!regenModal}
        onClose={() => { setRegenModal(null); setRegenPrompt('') }}
        title={regenModal === 'day'
          ? `New suggestions — Day ${selectedDay + 1}`
          : 'Regenerate entire plan'}
      >
        <div className="space-y-3">
          <p className="text-xs text-textSecondary">
            {regenModal === 'day'
              ? 'Optionally tell the AI what to change for this day.'
              : 'Optionally give the AI extra instructions for the new plan.'}
            {' '}Leave blank for a random refresh.
          </p>
          <textarea
            className="w-full border border-border rounded-xl px-3 py-2.5 text-sm text-textPrimary focus:outline-none focus:border-teal-500 resize-none"
            rows={3}
            placeholder='e.g. "More vegetarian options" or "Higher protein breakfast"'
            value={regenPrompt}
            onChange={e => setRegenPrompt(e.target.value)}
            autoFocus
          />
          {error && <p className="text-xs text-red-500">{error}</p>}
          <button
            onClick={confirmRegen}
            disabled={regening || !profile}
            className="w-full bg-teal-500 text-white font-semibold py-3 rounded-xl disabled:opacity-40 active:bg-teal-600 flex items-center justify-center gap-2"
          >
            {regening ? <><Loader2 size={15} className="animate-spin" /> Generating…</> : 'Generate'}
          </button>
        </div>
      </Modal>
    </div>
  )
}

function MealCard({ slotLabel, meal, onEdit }) {
  const [expanded, setExpanded] = useState(false)
  const n = meal.nutrition

  return (
    <div className="bg-white rounded-xl border border-border overflow-hidden">
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer select-none"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-semibold text-textSecondary uppercase tracking-wide">{slotLabel}</p>
          <p className="text-sm font-semibold text-textPrimary mt-0.5 truncate">{meal.name}</p>
          {n?.calories ? (
            <p className="text-[11px] text-textSecondary mt-0.5">
              {n.calories} kcal · {n.protein}g P · {n.carbs}g C · {n.fat}g F{n.fibre ? ` · ${n.fibre}g fibre` : ''}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-1.5 shrink-0 ml-2">
          {onEdit && (
            <button
              onClick={e => { e.stopPropagation(); onEdit() }}
              className="p-1.5 text-textSecondary hover:text-teal-500 border border-border rounded-lg"
            >
              <Edit3 size={13} />
            </button>
          )}
          {expanded ? <ChevronUp size={16} className="text-textSecondary" /> : <ChevronDown size={16} className="text-textSecondary" />}
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 border-t border-border/60 space-y-3">
          {n?.calories && (
            <div className="pt-3 grid grid-cols-4 gap-1 text-center">
              {[
                { label: 'Calories', val: n.calories, unit: 'kcal', color: 'text-teal-600' },
                { label: 'Protein',  val: n.protein,  unit: 'g',    color: 'text-blue-500' },
                { label: 'Carbs',    val: n.carbs,    unit: 'g',    color: 'text-orange-400' },
                { label: 'Fat',      val: n.fat,      unit: 'g',    color: 'text-textSecondary' },
              ].map(({ label, val, unit, color }) => (
                <div key={label} className="bg-bg rounded-lg py-1.5">
                  <p className={`text-sm font-bold ${color}`}>{val}<span className="text-[9px] font-normal ml-0.5">{unit}</span></p>
                  <p className="text-[9px] text-textSecondary">{label}</p>
                </div>
              ))}
            </div>
          )}
          {meal.ingredients?.length > 0 && (
            <div className={n?.calories ? '' : 'pt-3'}>
              <p className="text-xs font-semibold text-textSecondary mb-1.5">Ingredients</p>
              <div className="space-y-1">
                {meal.ingredients.map((ing, i) => (
                  <div key={i} className="flex gap-2 text-xs">
                    <span className="text-teal-600 font-medium w-16 shrink-0">{ing.quantity}</span>
                    <span className="text-textPrimary">{ing.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {meal.recipe && (
            <div>
              <p className="text-xs font-semibold text-textSecondary mb-1">Recipe</p>
              <p className="text-xs text-textPrimary leading-relaxed">{meal.recipe}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
