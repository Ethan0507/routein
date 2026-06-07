import { useState, useEffect, useCallback } from 'react'
import { Plus, Trash2, ChevronDown, Loader2, CheckCircle2, Circle, Pencil, CalendarDays, Clock } from 'lucide-react'
import Modal from '../components/Modal'
import WeekPlanViewer from '../components/WeekPlanViewer'
import HistoryScreen from './HistoryScreen'
import {
  getDietEntriesForDate, addDietEntry, deleteDietEntry,
  getMealLogsForDate, upsertMealLog, deleteMealLog,
  getActiveMealPlan, getProfile, upsertProfile, updateMealPlan,
  getGroceryHaveState, saveGroceryHaveState,
  saveCustomMeal,
} from '../lib/db'
import { analyzeLoggedMealDescription } from '../lib/mealRecommendation'
import { computeMealDeductions, applyDeductions } from '../lib/groceryUtils'
import { useAuth } from '../contexts/AuthContext'
import { todayStr, formatTime, nowHHmm, getDayIndexForPlan, DEFAULT_MEAL_SLOTS, normalizeMealSlots, getActiveSlots } from '../lib/utils'

const MEAL_TYPES = ['Breakfast', 'Mid-morning', 'Lunch', 'Pre-workout', 'Post-workout', 'Dinner', 'Before bed', 'Snack', 'Other']

function macroSum(entries, key) {
  return Math.round(entries.reduce((s, m) => s + (Number(m[key]) || 0), 0))
}

export default function DietScreen() {
  const today = todayStr()
  const { user } = useAuth()

  // Plan state
  const [plan, setPlan]             = useState(null)   // active meal plan row
  const [dayMeals, setDayMeals]     = useState(null)   // today's meal objects from plan
  const [targets, setTargets]       = useState(null)   // { maintenanceCalories, proteinG, carbsG, fatG }
  const [mealLogs, setMealLogs]         = useState({})
  const [weekPlanOpen, setWeekPlanOpen]     = useState(false)
  const [planHistoryOpen, setPlanHistoryOpen] = useState(false)
  const [userProfile, setUserProfile]       = useState(null)
  // All slot objects (with enabled flags) from the user's profile
  const [allSlots, setAllSlots]         = useState(DEFAULT_MEAL_SLOTS)
  const [slotsModalOpen, setSlotsModalOpen] = useState(false)
  const [slotsDraft, setSlotsDraft]         = useState([])
  const [slotsSaving, setSlotsSaving]       = useState(false)

  // Free-form entries (today only)
  const [entries, setEntries]   = useState([])

  const [loading, setLoading]   = useState(true)

  // "Log this meal" state
  const [loggingSlot, setLoggingSlot] = useState(null) // slot key being logged
  const [unloggingSlot, setUnloggingSlot] = useState(null)

  // Custom override modal — 2-phase: describe → preview + save
  const [customModal, setCustomModal]   = useState(null)  // { slot, mealName }
  const [customDesc, setCustomDesc]     = useState('')
  const [customPhase, setCustomPhase]   = useState('input') // 'input' | 'preview'
  const [customNutrition, setCustomNutrition] = useState({ calories: '', protein: '', carbs: '', fat: '', fibre: '' })
  const [estimating, setEstimating]     = useState(false)
  const [customError, setCustomError]   = useState('')
  // Save-as-custom-meal
  const [savingCustom, setSavingCustom] = useState(false)
  const [saveAsCustom, setSaveAsCustom] = useState(false)
  const [customMealName, setCustomMealName] = useState('')
  const [savedConfirm, setSavedConfirm] = useState(false)

  // Free-form add modal
  const [freeModal, setFreeModal]     = useState(false)
  const [freeForm, setFreeForm]       = useState({ name: '', type: 'Breakfast', time: nowHHmm(), calories: '', protein: '', carbs: '', fat: '' })
  const [freeSaving, setFreeSaving]   = useState(false)

  const reload = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      const [activePlan, profile, todayLogs, todayEntries] = await Promise.all([
        getActiveMealPlan(user.id),
        getProfile(user.id),
        getMealLogsForDate(user.id, today),
        getDietEntriesForDate(user.id, today),
      ])

      if (activePlan) {
        const dayIdx = getDayIndexForPlan(activePlan.created_at)
        const day    = activePlan.plan?.[dayIdx] || activePlan.plan?.[0]
        setPlan(activePlan)
        setDayMeals(day || null)
        setTargets(activePlan.targets || null)
      }

      setAllSlots(normalizeMealSlots(profile?.meal_slots))
      setUserProfile(profile)

      setMealLogs(todayLogs)
      setEntries(todayEntries)
    } finally {
      setLoading(false)
    }
  }, [user, today])

  useEffect(() => { reload() }, [reload])

  // ── Save enabled slots ────────────────────────────────────────────────────────
  async function saveSlots() {
    setSlotsSaving(true)
    try {
      await upsertProfile(user.id, { meal_slots: slotsDraft })
      setAllSlots(slotsDraft)
      setSlotsModalOpen(false)
    } finally {
      setSlotsSaving(false)
    }
  }

  function openSlotsModal() {
    setSlotsDraft(allSlots.map(s => ({ ...s })))
    setSlotsModalOpen(true)
  }

  // ── Log a planned meal ────────────────────────────────────────────────────────
  async function logPlannedMeal(slot) {
    const meal = dayMeals?.[slot]
    if (!meal) return
    setLoggingSlot(slot)
    try {
      // Use the nutrition already embedded in the plan by the AI.
      // Fall back to a live estimate only if the plan pre-dates this feature.
      let nutrition = meal.nutrition || null
      if (!nutrition) {
        try {
          const desc = `${meal.name}. Ingredients: ${(meal.ingredients || []).map(i => `${i.quantity} ${i.name}`).join(', ')}`
          nutrition = await analyzeLoggedMealDescription(desc)
        } catch { /* log without macros */ }
      }
      await upsertMealLog(user.id, today, slot, {
        completed:   true,
        consumed_at: nowHHmm(),
        nutrition,
      })
      setMealLogs(prev => ({
        ...prev,
        [slot]: { meal_slot: slot, completed: true, consumed_at: nowHHmm(), nutrition },
      }))

      // Deduct ingredients from grocery have-state (fire-and-forget)
      if (meal.ingredients?.length) {
        getGroceryHaveState(user.id).then(current => {
          const deductions = computeMealDeductions(meal.ingredients)
          const updated    = applyDeductions(current, deductions)
          saveGroceryHaveState(user.id, updated).catch(() => {})
        }).catch(() => {})
      }
    } finally {
      setLoggingSlot(null)
    }
  }

  // ── Unlog a planned meal ─────────────────────────────────────────────────────
  async function unlogMeal(slot) {
    setUnloggingSlot(slot)
    try {
      await deleteMealLog(user.id, today, slot)
      setMealLogs(prev => {
        const next = { ...prev }
        delete next[slot]
        return next
      })
    } finally {
      setUnloggingSlot(null)
    }
  }

  // ── Custom override modal helpers ────────────────────────────────────────────
  function openCustomModal(slot) {
    const meal = dayMeals?.[slot]
    const slotLabel = allSlots.find(s => s.key === slot)?.label || slot
    setCustomModal({ slot, mealName: meal?.name || slotLabel })
    setCustomDesc('')
    setCustomPhase('input')
    setCustomNutrition({ calories: '', protein: '', carbs: '', fat: '', fibre: '' })
    setCustomError('')
    setSaveAsCustom(false)
    setCustomMealName('')
    setSavedConfirm(false)
  }

  async function estimateCustom() {
    if (!customDesc.trim() || estimating) return
    setEstimating(true)
    setCustomError('')
    try {
      const n = await analyzeLoggedMealDescription(customDesc.trim())
      setCustomNutrition({
        calories: n.calories ?? '',
        protein:  n.protein  ?? '',
        carbs:    n.carbs    ?? '',
        fat:      n.fat      ?? '',
        fibre:    n.fibre    ?? '',
      })
      setCustomMealName(customDesc.trim().slice(0, 50))
      setCustomPhase('preview')
    } catch (err) {
      setCustomError(err.message || 'Estimation failed. You can still log without macros.')
      setCustomPhase('preview')
      setCustomNutrition({ calories: '', protein: '', carbs: '', fat: '', fibre: '' })
    } finally {
      setEstimating(false)
    }
  }

  async function logCustom() {
    const slot = customModal?.slot
    if (!slot) return
    const nutrition = {
      calories: customNutrition.calories !== '' ? Number(customNutrition.calories) : null,
      protein:  customNutrition.protein  !== '' ? Number(customNutrition.protein)  : null,
      carbs:    customNutrition.carbs    !== '' ? Number(customNutrition.carbs)    : null,
      fat:      customNutrition.fat      !== '' ? Number(customNutrition.fat)      : null,
      fibre:    customNutrition.fibre    !== '' ? Number(customNutrition.fibre)    : null,
    }

    // Optionally save as custom meal first
    if (saveAsCustom && customMealName.trim()) {
      setSavingCustom(true)
      try {
        await saveCustomMeal(user.id, {
          meal_name:          customMealName.trim(),
          source_description: customDesc.trim(),
          nutrition,
        })
        setSavedConfirm(true)
      } catch { /* non-fatal */ } finally {
        setSavingCustom(false)
      }
    }

    await upsertMealLog(user.id, today, slot, {
      completed:          true,
      consumed_at:        nowHHmm(),
      custom_description: customDesc.trim(),
      nutrition,
    })
    setMealLogs(prev => ({
      ...prev,
      [slot]: { meal_slot: slot, completed: true, consumed_at: nowHHmm(), custom_description: customDesc.trim(), nutrition },
    }))
    setCustomModal(null)
  }

  // ── Free-form meal add ────────────────────────────────────────────────────────
  async function handleFreeAdd() {
    if (!freeForm.name.trim() || freeSaving) return
    setFreeSaving(true)
    try {
      await addDietEntry(user.id, {
        date:     today,
        name:     freeForm.name.trim(),
        type:     freeForm.type,
        time:     freeForm.time,
        calories: freeForm.calories ? Number(freeForm.calories) : null,
        protein:  freeForm.protein  ? Number(freeForm.protein)  : null,
        carbs:    freeForm.carbs    ? Number(freeForm.carbs)    : null,
        fat:      freeForm.fat      ? Number(freeForm.fat)      : null,
      })
      setFreeModal(false)
      await reload()
    } finally {
      setFreeSaving(false)
    }
  }

  async function handleDeleteEntry(id) {
    await deleteDietEntry(user.id, id)
    setEntries(prev => prev.filter(e => e.id !== id))
  }

  // ── Macro totals from plan logs + free entries ────────────────────────────────
  const loggedNutritions = Object.values(mealLogs)
    .filter(l => l.nutrition)
    .map(l => l.nutrition)
  const allNutritionRows = [
    ...loggedNutritions.map(n => ({ calories: n.calories, protein: n.protein, carbs: n.carbs, fat: n.fat })),
    ...entries,
  ]
  const totalCal  = macroSum(allNutritionRows, 'calories')
  const totalPro  = macroSum(allNutritionRows, 'protein')
  const totalCarb = macroSum(allNutritionRows, 'carbs')
  const totalFat  = macroSum(allNutritionRows, 'fat')

  return (
    <div className="flex flex-col min-h-full">
      {/* Header */}
      <div className="bg-white border-b border-border px-4 pt-10 pb-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-textPrimary">Diet Tracker</h1>
            <p className="text-sm text-textSecondary mt-0.5">
              {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </p>
          </div>
          <div className="flex gap-2">
            {plan && (
              <button
                onClick={() => setWeekPlanOpen(true)}
                className="flex items-center gap-1.5 text-xs font-medium text-teal-600 bg-teal-50 border border-teal-200 px-3 py-1.5 rounded-lg active:bg-teal-100"
              >
                <CalendarDays size={13} />
                Week plan
              </button>
            )}
            <button
              onClick={() => setPlanHistoryOpen(true)}
              className="flex items-center gap-1.5 text-xs font-medium text-textSecondary border border-border px-3 py-1.5 rounded-lg active:bg-bg"
            >
              <Clock size={13} />
              History
            </button>
          </div>
        </div>

        {/* Macro progress vs targets */}
        {targets && (
          <div className="mt-3 grid grid-cols-4 gap-2 text-center">
            {[
              { label: 'Cal',     val: totalCal,  target: targets.maintenanceCalories, unit: 'kcal', color: 'text-teal-500' },
              { label: 'Protein', val: totalPro,  target: targets.proteinG,            unit: 'g',    color: 'text-blue-500' },
              { label: 'Carbs',   val: totalCarb, target: targets.carbsG,              unit: 'g',    color: 'text-warning' },
              { label: 'Fat',     val: totalFat,  target: targets.fatG,                unit: 'g',    color: 'text-textSecondary' },
            ].map(({ label, val, target, unit, color }) => (
              <div key={label}>
                <p className={`text-base font-bold ${color}`}>{val}<span className="text-[10px] font-normal text-textSecondary ml-0.5">{unit}</span></p>
                <p className="text-[10px] text-textSecondary">/ {target} {label}</p>
                <div className="mt-1 h-1 bg-border rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${color.replace('text-', 'bg-')}`}
                    style={{ width: `${Math.min(100, target ? (val / target) * 100 : 0)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 px-4 py-4 space-y-4">
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 size={24} className="animate-spin text-teal-500" />
          </div>
        ) : (
          <>
            {/* ── Plan-based meal slots ── */}
            {dayMeals ? (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-semibold text-textPrimary">Today's meal plan</p>
                  <button
                    onClick={openSlotsModal}
                    className="flex items-center gap-1 text-xs text-textSecondary border border-border rounded-lg px-2.5 py-1.5 active:bg-bg"
                  >
                    <Pencil size={11} />
                    Edit slots
                  </button>
                </div>
                <div className="space-y-2">
                  {getActiveSlots(allSlots).map(slotObj => {
                    const slot    = slotObj.key
                    const meal    = dayMeals[slot]
                    if (!meal) return null
                    const log     = mealLogs[slot]
                    const isLogged   = !!log?.completed
                    const isLogging  = loggingSlot === slot
                    const isUnlogging = unloggingSlot === slot
                    const nutrition  = log?.nutrition

                    return (
                      <div key={slot} className={`bg-white rounded-xl border overflow-hidden transition-colors ${isLogged ? 'border-teal-200 bg-teal-50/30' : 'border-border'}`}>
                        <div className="flex items-center gap-3 px-3 py-3">
                          <button
                            onClick={() => isLogged ? unlogMeal(slot) : logPlannedMeal(slot)}
                            disabled={isLogging || isUnlogging}
                            className="shrink-0"
                          >
                            {isLogging || isUnlogging
                              ? <Loader2 size={20} className="text-teal-500 animate-spin" />
                              : isLogged
                                ? <CheckCircle2 size={20} className="text-teal-500" />
                                : <Circle size={20} className="text-border" />}
                          </button>

                          <div className="flex-1 min-w-0">
                            <p className="text-[10px] font-semibold text-textSecondary uppercase tracking-wide">{slotObj.label}</p>
                            <p className={`text-sm font-medium mt-0.5 truncate ${isLogged ? 'text-teal-700' : 'text-textPrimary'}`}>
                              {log?.custom_description ? log.custom_description : meal.name}
                            </p>
                            {isLogged && nutrition?.calories && (
                              <p className="text-[10px] text-teal-600 mt-0.5">
                                {nutrition.calories} kcal · {nutrition.protein}g P · {nutrition.carbs}g C · {nutrition.fat}g F
                              </p>
                            )}
                          </div>

                          {/* Override button */}
                          {!isLogged && (
                            <button
                              onClick={() => openCustomModal(slot)}
                              className="shrink-0 p-1.5 text-textSecondary border border-border rounded-lg"
                              title="Log something different"
                            >
                              <Pencil size={13} />
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-border p-6 text-center">
                <p className="text-sm text-textSecondary">No active meal plan. Complete onboarding to get a plan.</p>
              </div>
            )}

            {/* ── Extra / unlisted meals ── */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold text-textPrimary">Extra meals</p>
                <button
                  onClick={() => { setFreeForm({ name: '', type: 'Breakfast', time: nowHHmm(), calories: '', protein: '', carbs: '', fat: '' }); setFreeModal(true) }}
                  className="flex items-center gap-1 bg-teal-500 text-white text-xs font-medium px-3 py-1.5 rounded-lg active:bg-teal-600"
                >
                  <Plus size={14} />
                  Add meal
                </button>
              </div>

              {entries.length === 0 ? (
                <p className="text-xs text-textSecondary py-1">Snacks, drinks, or anything not in your plan</p>
              ) : (
                <div className="space-y-2">
                  {entries.map(meal => (
                    <FreeEntryCard key={meal.id} meal={meal} onDelete={handleDeleteEntry} />
                  ))}
                </div>
              )}
            </div>

            {/* ── History link ── */}
            <button
              onClick={() => setPlanHistoryOpen(true)}
              className="w-full flex items-center justify-between bg-white rounded-xl border border-border px-4 py-3 text-left active:bg-bg"
            >
              <div>
                <p className="text-sm font-semibold text-textPrimary">History</p>
                <p className="text-xs text-textSecondary mt-0.5">Timeline of meals eaten · saved plans</p>
              </div>
              <ChevronDown size={16} className="text-textSecondary -rotate-90" />
            </button>
          </>
        )}
      </div>

      {/* Custom override modal — 2-phase */}
      <Modal
        open={!!customModal}
        onClose={() => setCustomModal(null)}
        title={customModal ? `Log ${allSlots.find(s => s.key === customModal.slot)?.label || customModal.slot}` : ''}
      >
        {customPhase === 'input' ? (
          <div className="space-y-3">
            <p className="text-xs text-textSecondary">
              Planned: <span className="font-medium text-textPrimary">{customModal?.mealName}</span>
            </p>
            <div>
              <label className="text-xs font-medium text-textSecondary block mb-1">What did you eat?</label>
              <textarea
                className="w-full border border-border rounded-xl px-3 py-2.5 text-sm text-textPrimary focus:outline-none focus:border-teal-500 resize-none"
                rows={3}
                placeholder='e.g. "2 scrambled eggs on wholegrain toast with butter"'
                value={customDesc}
                onChange={e => setCustomDesc(e.target.value)}
                autoFocus
              />
              <p className="text-[11px] text-textSecondary mt-1">Describe what you ate including quantities. AI will estimate macros.</p>
            </div>
            {customError && <p className="text-xs text-red-500">{customError}</p>}
            <button
              onClick={estimateCustom}
              disabled={!customDesc.trim() || estimating}
              className="w-full bg-teal-500 text-white font-semibold py-3 rounded-xl disabled:opacity-40 active:bg-teal-600 flex items-center justify-center gap-2"
            >
              {estimating ? <><Loader2 size={16} className="animate-spin" /> Estimating…</> : 'Estimate macros →'}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {/* What they ate */}
            <div className="bg-bg rounded-xl px-3 py-2.5">
              <p className="text-[10px] font-semibold text-textSecondary uppercase tracking-wide mb-0.5">You ate</p>
              <p className="text-sm text-textPrimary">{customDesc}</p>
            </div>

            {/* Estimated macros — all editable */}
            <div>
              <p className="text-xs font-semibold text-textSecondary uppercase tracking-wide mb-2">Estimated macros <span className="normal-case font-normal">(tap to adjust)</span></p>
              <div className="grid grid-cols-5 gap-1.5">
                {[
                  { key: 'calories', label: 'kcal',    color: 'text-teal-600' },
                  { key: 'protein',  label: 'P (g)',   color: 'text-blue-500' },
                  { key: 'carbs',    label: 'C (g)',   color: 'text-orange-400' },
                  { key: 'fat',      label: 'F (g)',   color: 'text-textSecondary' },
                  { key: 'fibre',    label: 'Fi (g)',  color: 'text-green-600' },
                ].map(({ key, label, color }) => (
                  <div key={key} className="text-center">
                    <input
                      type="number"
                      className={`w-full border border-border rounded-lg px-1 py-2 text-sm font-bold text-center focus:outline-none focus:border-teal-500 ${color}`}
                      value={customNutrition[key]}
                      onChange={e => setCustomNutrition(n => ({ ...n, [key]: e.target.value }))}
                      placeholder="—"
                    />
                    <p className="text-[9px] text-textSecondary mt-0.5">{label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Save as custom meal toggle */}
            <div className="border border-border rounded-xl p-3 space-y-2">
              <div
                className="flex items-center justify-between cursor-pointer"
                onClick={() => setSaveAsCustom(s => !s)}
              >
                <div>
                  <p className="text-sm font-medium text-textPrimary">Save as custom meal</p>
                  <p className="text-xs text-textSecondary">Reuse this meal when logging in future</p>
                </div>
                <div className={`w-10 h-6 rounded-full relative transition-colors ${saveAsCustom ? 'bg-teal-500' : 'bg-border'}`}>
                  <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${saveAsCustom ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </div>
              </div>
              {saveAsCustom && (
                <input
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm text-textPrimary focus:outline-none focus:border-teal-500"
                  placeholder="Meal name (e.g. Eggs on toast)"
                  value={customMealName}
                  onChange={e => setCustomMealName(e.target.value)}
                  autoFocus
                />
              )}
            </div>

            {customError && <p className="text-xs text-red-500">{customError}</p>}

            <div className="flex gap-2">
              <button
                onClick={() => setCustomPhase('input')}
                className="px-3 py-2.5 rounded-xl border border-border text-sm text-textSecondary active:bg-bg"
              >
                ← Edit
              </button>
              <button
                onClick={logCustom}
                disabled={savingCustom || (saveAsCustom && !customMealName.trim())}
                className="flex-1 bg-teal-500 text-white font-semibold py-2.5 rounded-xl disabled:opacity-40 active:bg-teal-600 flex items-center justify-center gap-2"
              >
                {savingCustom ? <Loader2 size={15} className="animate-spin" /> : 'Log meal'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Free-form add meal modal */}
      <Modal open={freeModal} onClose={() => setFreeModal(false)} title="Log extra meal">
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-textSecondary block mb-1">Meal name *</label>
            <input
              className="w-full border border-border rounded-lg px-3 py-2 text-sm text-textPrimary focus:outline-none focus:border-teal-500"
              placeholder="e.g. Protein bar"
              value={freeForm.name}
              onChange={e => setFreeForm(f => ({ ...f, name: e.target.value }))}
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-textSecondary block mb-1">Type</label>
              <select
                className="w-full border border-border rounded-lg px-3 py-2 text-sm text-textPrimary focus:outline-none focus:border-teal-500 bg-white"
                value={freeForm.type}
                onChange={e => setFreeForm(f => ({ ...f, type: e.target.value }))}
              >
                {MEAL_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-textSecondary block mb-1">Time</label>
              <input
                type="time"
                className="w-full border border-border rounded-lg px-3 py-2 text-sm text-textPrimary focus:outline-none focus:border-teal-500"
                value={freeForm.time}
                onChange={e => setFreeForm(f => ({ ...f, time: e.target.value }))}
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-textSecondary block mb-1">Calories (kcal)</label>
            <input
              type="number"
              className="w-full border border-border rounded-lg px-3 py-2 text-sm text-textPrimary focus:outline-none focus:border-teal-500"
              placeholder="Optional"
              value={freeForm.calories}
              onChange={e => setFreeForm(f => ({ ...f, calories: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            {['protein', 'carbs', 'fat'].map(macro => (
              <div key={macro}>
                <label className="text-xs font-medium text-textSecondary block mb-1 capitalize">{macro} (g)</label>
                <input
                  type="number"
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm text-textPrimary focus:outline-none focus:border-teal-500"
                  placeholder="0"
                  value={freeForm[macro]}
                  onChange={e => setFreeForm(f => ({ ...f, [macro]: e.target.value }))}
                />
              </div>
            ))}
          </div>
          <button
            onClick={handleFreeAdd}
            disabled={!freeForm.name.trim() || freeSaving}
            className="w-full bg-teal-500 text-white font-semibold py-3 rounded-xl mt-1 disabled:opacity-40 active:bg-teal-600 flex items-center justify-center gap-2"
          >
            {freeSaving ? <Loader2 size={16} className="animate-spin" /> : 'Log meal'}
          </button>
        </div>
      </Modal>

      {/* Edit meal slots modal */}
      <Modal open={slotsModalOpen} onClose={() => setSlotsModalOpen(false)} title="Meal slots">
        <div className="space-y-3">
          <p className="text-xs text-textSecondary">Rename, reorder by time, or remove any slot. Changes here only affect display — to regenerate the plan with new slots, use the onboarding flow.</p>
          <div className="space-y-2 max-h-[50vh] overflow-y-auto">
            {[...slotsDraft].sort((a, b) => a.time.localeCompare(b.time)).map(slot => (
              <div key={slot.key} className="flex items-center gap-2 bg-white rounded-xl border border-border p-2">
                <div className="flex-1 grid grid-cols-[1fr_80px] gap-1.5">
                  <input
                    className="border border-border rounded-lg px-2.5 py-1.5 text-sm text-textPrimary focus:outline-none focus:border-teal-500"
                    value={slot.label}
                    onChange={e => setSlotsDraft(d => d.map(s => s.key === slot.key ? { ...s, label: e.target.value } : s))}
                    placeholder="Meal name"
                  />
                  <input
                    type="time"
                    className="border border-border rounded-lg px-2 py-1.5 text-xs text-textPrimary focus:outline-none focus:border-teal-500"
                    value={slot.time}
                    onChange={e => setSlotsDraft(d => d.map(s => s.key === slot.key ? { ...s, time: e.target.value } : s))}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setSlotsDraft(d => d.filter(s => s.key !== slot.key))}
                  className="shrink-0 p-1.5 text-textSecondary hover:text-red-500 rounded-lg hover:bg-red-50"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
          <button
            onClick={saveSlots}
            disabled={slotsSaving}
            className="w-full bg-teal-500 text-white font-semibold py-3 rounded-xl disabled:opacity-40 active:bg-teal-600 flex items-center justify-center gap-2"
          >
            {slotsSaving ? <Loader2 size={16} className="animate-spin" /> : 'Save'}
          </button>
        </div>
      </Modal>

      {/* Week plan full-screen viewer */}
      {weekPlanOpen && (
        <WeekPlanViewer
          plan={plan?.plan}
          planId={plan?.id}
          planName={plan?.name || ''}
          planTags={plan?.tags || []}
          targets={targets}
          mealSlots={allSlots}
          planCreatedAt={plan?.created_at}
          profile={userProfile}
          userId={user?.id}
          onClose={() => setWeekPlanOpen(false)}
          onPlanUpdate={updatedPlan => {
            setPlan(prev => ({ ...prev, plan: updatedPlan }))
            const dayIdx = getDayIndexForPlan(plan?.created_at)
            setDayMeals(updatedPlan[dayIdx] || updatedPlan[0] || null)
          }}
          onNewPlanCreated={newRow => {
            // Full regen created a new plan row — switch the active plan
            setPlan(prev => ({ ...prev, ...newRow }))
            const dayIdx = getDayIndexForPlan(newRow.created_at)
            setDayMeals(newRow.plan?.[dayIdx] || newRow.plan?.[0] || null)
            setTargets(newRow.targets || targets)
          }}
        />
      )}

      {/* History (timeline + meal plans) */}
      {planHistoryOpen && (
        <HistoryScreen
          activePlanId={plan?.id}
          currentMealSlots={allSlots}
          onClose={() => setPlanHistoryOpen(false)}
          onPlanRestored={newRow => {
            setPlan(newRow)
            const dayIdx = getDayIndexForPlan(newRow.created_at)
            setDayMeals(newRow.plan?.[dayIdx] || newRow.plan?.[0] || null)
            setTargets(newRow.targets || targets)
            setPlanHistoryOpen(false)
            setWeekPlanOpen(false)
          }}
        />
      )}
    </div>
  )
}

function FreeEntryCard({ meal, onDelete }) {
  const [expanded, setExpanded] = useState(false)
  const hasMacros = meal.calories || meal.protein || meal.carbs || meal.fat
  return (
    <div className="bg-white rounded-xl border border-border overflow-hidden">
      <button
        className="w-full flex items-center justify-between p-3 text-left"
        onClick={() => hasMacros && setExpanded(e => !e)}
      >
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-textPrimary truncate">{meal.name}</p>
          <p className="text-xs text-textSecondary mt-0.5">{meal.type} · {formatTime(meal.time)}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-2">
          {meal.calories && <span className="text-sm font-semibold text-teal-500">{meal.calories} kcal</span>}
          {hasMacros && (expanded ? <ChevronUp size={16} className="text-textSecondary" /> : <ChevronDown size={16} className="text-textSecondary" />)}
          <button onClick={e => { e.stopPropagation(); onDelete(meal.id) }} className="p-1 text-textSecondary hover:text-red-500">
            <Trash2 size={14} />
          </button>
        </div>
      </button>
      {expanded && hasMacros && (
        <div className="px-3 pb-3 grid grid-cols-3 gap-2 border-t border-border/60">
          {[
            { label: 'Protein', val: meal.protein, color: 'text-blue-500' },
            { label: 'Carbs',   val: meal.carbs,   color: 'text-warning' },
            { label: 'Fat',     val: meal.fat,     color: 'text-textSecondary' },
          ].filter(({ val }) => val != null).map(({ label, val, color }) => (
            <div key={label} className="text-center pt-2">
              <p className={`text-sm font-bold ${color}`}>{val}g</p>
              <p className="text-[10px] text-textSecondary">{label}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
