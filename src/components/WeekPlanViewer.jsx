import { useState } from 'react'
import { X, ChevronDown, ChevronUp } from 'lucide-react'
import { getActiveSlots, normalizeMealSlots } from '../lib/utils'

// Day label from plan creation date + day index (1-based)
function dayLabel(planCreatedAt, dayIndex) {
  if (!planCreatedAt) return `Day ${dayIndex}`
  const d = new Date(planCreatedAt)
  d.setDate(d.getDate() + dayIndex - 1)
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

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

export default function WeekPlanViewer({ plan, targets, mealSlots, planCreatedAt, onClose }) {
  const [selectedDay, setSelectedDay] = useState(0)

  const slots       = getActiveSlots(normalizeMealSlots(mealSlots))
  const dayData     = plan?.[selectedDay] || {}
  const dayTotals   = sumNutrition(dayData, slots)

  if (!plan) return null

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-bg">
      {/* Header */}
      <div className="bg-white border-b border-border px-4 pt-10 pb-3 flex items-start justify-between">
        <div>
          <h2 className="text-lg font-bold text-textPrimary">Week Plan</h2>
          {targets && (
            <p className="text-xs text-textSecondary mt-0.5">
              Target {targets.maintenanceCalories} kcal · {targets.proteinG}g P · {targets.carbsG}g C · {targets.fatG}g F
            </p>
          )}
        </div>
        <button onClick={onClose} className="p-2 text-textSecondary active:bg-bg rounded-lg mt-1">
          <X size={20} />
        </button>
      </div>

      {/* Day tabs */}
      <div className="bg-white border-b border-border px-3 py-2 flex gap-1.5 overflow-x-auto shrink-0">
        {plan.map((_, i) => (
          <button
            key={i}
            onClick={() => setSelectedDay(i)}
            className={`shrink-0 flex flex-col items-center px-3 py-1.5 rounded-xl text-center transition-colors ${
              selectedDay === i
                ? 'bg-teal-500 text-white'
                : 'bg-bg text-textSecondary border border-border'
            }`}
          >
            <span className="text-[10px] font-semibold uppercase tracking-wide leading-none">
              {new Date(new Date(planCreatedAt || Date.now()).getTime() + i * 86400000)
                .toLocaleDateString('en-US', { weekday: 'short' })}
            </span>
            <span className="text-sm font-bold mt-0.5 leading-none">
              {new Date(new Date(planCreatedAt || Date.now()).getTime() + i * 86400000).getDate()}
            </span>
          </button>
        ))}
      </div>

      {/* Day macro summary */}
      {dayTotals.cal > 0 && (
        <div className="bg-white border-b border-border px-4 py-2.5 grid grid-cols-4 gap-2 text-center shrink-0">
          {[
            { label: 'Cal',    val: dayTotals.cal,  unit: 'kcal', target: targets?.maintenanceCalories, color: 'text-teal-500' },
            { label: 'Protein', val: dayTotals.pro, unit: 'g',    target: targets?.proteinG,            color: 'text-blue-500' },
            { label: 'Carbs',  val: dayTotals.carb, unit: 'g',    target: targets?.carbsG,              color: 'text-orange-400' },
            { label: 'Fat',    val: dayTotals.fat,  unit: 'g',    target: targets?.fatG,                color: 'text-textSecondary' },
          ].map(({ label, val, unit, target, color }) => (
            <div key={label}>
              <p className={`text-sm font-bold ${color}`}>{val}<span className="text-[9px] font-normal ml-0.5">{unit}</span></p>
              {target ? <p className="text-[9px] text-textSecondary">/ {target}</p> : <p className="text-[9px] text-textSecondary">{label}</p>}
              {target && (
                <div className="mt-0.5 h-1 bg-border rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${color.replace('text-', 'bg-')}`}
                    style={{ width: `${Math.min(100, (val / target) * 100)}%` }} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Meal list */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {slots.map(slotObj => {
          const meal = dayData[slotObj.key]
          if (!meal) return null
          return (
            <MealCard key={slotObj.key} slotLabel={slotObj.label} meal={meal} />
          )
        })}
      </div>
    </div>
  )
}

function MealCard({ slotLabel, meal }) {
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
        <div className="shrink-0 ml-2">
          {expanded
            ? <ChevronUp size={16} className="text-textSecondary" />
            : <ChevronDown size={16} className="text-textSecondary" />}
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 border-t border-border/60 space-y-3">
          {/* Macro grid */}
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

          {/* Ingredients */}
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

          {/* Recipe */}
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
