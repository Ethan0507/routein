import { useState } from 'react'
import { ChevronDown, ChevronUp, Edit3, RefreshCw, Check, Loader2, Trash2, Plus } from 'lucide-react'
import Modal from '../components/Modal'
import { saveMealPlan, upsertProfile } from '../lib/db'
import { generateMealPlanWithLLM, MEAL_SLOTS } from '../lib/mealRecommendation'
import { useAuth } from '../contexts/AuthContext'

const SLOT_LABELS = {
  breakfast:   'Breakfast',
  midMorning:  'Mid-morning',
  lunch:       'Lunch',
  preWorkout:  'Pre-workout',
  postWorkout: 'Post-workout',
  dinner:      'Dinner',
  beforeBed:   'Before bed',
}

export default function PlanReviewScreen({ planData, onAccepted }) {
  const { user } = useAuth()
  const [plan, setPlan]         = useState(planData.plan)
  const [targets]               = useState(planData.targets)
  const [profile]               = useState(planData.profile || {})
  const [selectedDay, setSelectedDay] = useState(0)
  const [editModal, setEditModal]     = useState(null)  // { dayIdx, slot, meal }
  const [regenDay, setRegenDay]       = useState(null)  // dayIdx being regenerated
  const [accepting, setAccepting]     = useState(false)
  const [error, setError]             = useState('')

  // ── Edit modal state ─────────────────────────────────────────────────────────
  const [editName, setEditName]           = useState('')
  const [editRecipe, setEditRecipe]       = useState('')
  const [editIngredients, setEditIngredients] = useState([])

  function openEdit(dayIdx, slot) {
    const meal = plan[dayIdx][slot] || {}
    setEditName(meal.name || '')
    setEditRecipe(meal.recipe || '')
    setEditIngredients(meal.ingredients ? meal.ingredients.map(i => ({ ...i })) : [])
    setEditModal({ dayIdx, slot })
  }

  function saveEdit() {
    const updated = plan.map((day, di) => {
      if (di !== editModal.dayIdx) return day
      return {
        ...day,
        [editModal.slot]: {
          ...day[editModal.slot],
          name: editName,
          recipe: editRecipe,
          ingredients: editIngredients.filter(i => i.name.trim()),
        },
      }
    })
    setPlan(updated)
    setEditModal(null)
  }

  function addIngredient() {
    setEditIngredients(i => [...i, { quantity: '', name: '' }])
  }

  function updateIngredient(idx, key, val) {
    setEditIngredients(items => items.map((item, i) => i === idx ? { ...item, [key]: val } : item))
  }

  function removeIngredient(idx) {
    setEditIngredients(items => items.filter((_, i) => i !== idx))
  }

  // ── Regenerate a day ─────────────────────────────────────────────────────────
  async function regenerateDay(dayIdx) {
    setRegenDay(dayIdx)
    setError('')
    try {
      const result = await generateMealPlanWithLLM(profile, { alternate: true, currentPlan: plan })
      const newDay = result.plan[dayIdx] || result.plan[0]
      setPlan(prev => prev.map((d, i) => i === dayIdx ? { ...newDay, day: i + 1 } : d))
    } catch (err) {
      setError(`Regenerate failed: ${err.message}`)
    } finally {
      setRegenDay(null)
    }
  }

  // ── Accept plan ──────────────────────────────────────────────────────────────
  async function acceptPlan() {
    setAccepting(true)
    setError('')
    try {
      await saveMealPlan(user.id, { plan, targets, source: planData.source })
      await upsertProfile(user.id, { plan_accepted: true })
      onAccepted()
    } catch (err) {
      setError(err.message)
      setAccepting(false)
    }
  }

  const dayData = plan[selectedDay]

  return (
    <div className="min-h-screen min-h-dvh bg-bg flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-border px-4 pt-10 pb-4">
        <h1 className="text-xl font-bold text-textPrimary">Your 7-Day Plan</h1>
        {targets && (
          <div className="flex gap-4 mt-2">
            {[
              { label: 'Calories', val: targets.maintenanceCalories, unit: 'kcal' },
              { label: 'Protein',  val: targets.proteinG,            unit: 'g' },
              { label: 'Carbs',    val: targets.carbsG,              unit: 'g' },
              { label: 'Fat',      val: targets.fatG,                unit: 'g' },
            ].map(({ label, val, unit }) => (
              <div key={label} className="text-center">
                <p className="text-sm font-bold text-teal-500">{val}<span className="text-xs font-normal text-textSecondary ml-0.5">{unit}</span></p>
                <p className="text-[10px] text-textSecondary">{label}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Day selector */}
      <div className="bg-white border-b border-border px-4 py-2 flex gap-1.5 overflow-x-auto">
        {plan.map((_, i) => (
          <button
            key={i}
            onClick={() => setSelectedDay(i)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
              selectedDay === i ? 'bg-teal-500 text-white' : 'bg-bg text-textSecondary border border-border'
            }`}
          >
            Day {i + 1}
          </button>
        ))}
      </div>

      {/* Meals for selected day */}
      <div className="flex-1 px-4 py-4 space-y-2 overflow-y-auto">
        {error && (
          <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3">
            <p className="text-xs text-red-600">{error}</p>
          </div>
        )}

        <div className="flex items-center justify-between mb-1">
          <p className="text-sm font-semibold text-textPrimary">Day {selectedDay + 1}</p>
          <button
            onClick={() => regenerateDay(selectedDay)}
            disabled={regenDay === selectedDay}
            className="flex items-center gap-1.5 text-xs text-textSecondary border border-border rounded-lg px-2.5 py-1.5 active:bg-bg disabled:opacity-50"
          >
            {regenDay === selectedDay
              ? <Loader2 size={13} className="animate-spin" />
              : <RefreshCw size={13} />}
            New suggestions
          </button>
        </div>

        {MEAL_SLOTS.map(slot => {
          const meal = dayData?.[slot]
          if (!meal) return null
          return (
            <MealCard
              key={slot}
              slot={slot}
              meal={meal}
              onEdit={() => openEdit(selectedDay, slot)}
            />
          )
        })}
      </div>

      {/* Accept button */}
      <div className="px-4 pb-8 pt-3 bg-white border-t border-border">
        <button
          onClick={acceptPlan}
          disabled={accepting}
          className="w-full bg-teal-500 text-white font-semibold py-3.5 rounded-xl flex items-center justify-center gap-2 disabled:opacity-50 active:bg-teal-600"
        >
          {accepting
            ? <Loader2 size={18} className="animate-spin" />
            : <><Check size={18} /> Start tracking this plan</>}
        </button>
        <p className="text-xs text-textSecondary text-center mt-2">You can edit any meal at any time after starting</p>
      </div>

      {/* Edit meal modal */}
      <Modal open={!!editModal} onClose={() => setEditModal(null)} title={editModal ? `Edit — ${SLOT_LABELS[editModal.slot]}` : ''}>
        <div className="space-y-3 max-h-[60vh] overflow-y-auto">
          <div>
            <label className="text-xs font-medium text-textSecondary block mb-1">Meal name</label>
            <input
              className="w-full border border-border rounded-lg px-3 py-2 text-sm text-textPrimary focus:outline-none focus:border-teal-500"
              value={editName}
              onChange={e => setEditName(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-textSecondary block mb-1">Recipe / instructions</label>
            <textarea
              className="w-full border border-border rounded-lg px-3 py-2 text-sm text-textPrimary focus:outline-none focus:border-teal-500 resize-none"
              rows={3}
              value={editRecipe}
              onChange={e => setEditRecipe(e.target.value)}
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-textSecondary">Ingredients</label>
              <button onClick={addIngredient} className="text-xs text-teal-500 flex items-center gap-0.5">
                <Plus size={12} /> Add
              </button>
            </div>
            <div className="space-y-1.5">
              {editIngredients.map((ing, idx) => (
                <div key={idx} className="flex gap-1.5 items-center">
                  <input
                    className="w-20 border border-border rounded-lg px-2 py-1.5 text-xs text-textPrimary focus:outline-none focus:border-teal-500"
                    placeholder="Qty"
                    value={ing.quantity}
                    onChange={e => updateIngredient(idx, 'quantity', e.target.value)}
                  />
                  <input
                    className="flex-1 border border-border rounded-lg px-2 py-1.5 text-xs text-textPrimary focus:outline-none focus:border-teal-500"
                    placeholder="Ingredient"
                    value={ing.name}
                    onChange={e => updateIngredient(idx, 'name', e.target.value)}
                  />
                  <button onClick={() => removeIngredient(idx)} className="text-textSecondary hover:text-red-500 p-1">
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
        <button
          onClick={saveEdit}
          className="w-full bg-teal-500 text-white font-semibold py-3 rounded-xl mt-4 active:bg-teal-600"
        >
          Save changes
        </button>
      </Modal>
    </div>
  )
}

function MealCard({ slot, meal, onEdit }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="bg-white rounded-xl border border-border overflow-hidden">
      <button className="w-full flex items-center justify-between px-4 py-3 text-left" onClick={() => setExpanded(e => !e)}>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold text-textSecondary uppercase tracking-wide">{SLOT_LABELS[slot]}</p>
          <p className="text-sm font-semibold text-textPrimary mt-0.5 truncate">{meal.name}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-2">
          <button
            onClick={e => { e.stopPropagation(); onEdit() }}
            className="p-1.5 text-textSecondary hover:text-teal-500 border border-border rounded-lg"
          >
            <Edit3 size={13} />
          </button>
          {expanded ? <ChevronUp size={16} className="text-textSecondary" /> : <ChevronDown size={16} className="text-textSecondary" />}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-border/60">
          {meal.ingredients?.length > 0 && (
            <div className="pt-3">
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
