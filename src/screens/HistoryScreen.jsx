import { useState, useEffect } from 'react'
import { X, Loader2, ChevronRight, ChevronDown, ChevronUp } from 'lucide-react'
import { getDietEntriesForRange, getMealLogsForRange, getAllMealPlans, saveMealPlan } from '../lib/db'
import { useAuth } from '../contexts/AuthContext'
import { lastNDays, shortDate, formatTime, normalizeMealSlots } from '../lib/utils'
import WeekPlanViewer from '../components/WeekPlanViewer'

// ─────────────────────────────────────────────────────────────────────────────
// Source labels for plan list
// ─────────────────────────────────────────────────────────────────────────────
const SOURCE_LABELS = {
  llm:         { label: 'AI generated', color: 'bg-teal-50 text-teal-600' },
  fallback:    { label: 'Default plan', color: 'bg-gray-100 text-textSecondary' },
  edited:      { label: 'Edited',       color: 'bg-blue-50 text-blue-600' },
  regenerated: { label: 'Regenerated',  color: 'bg-purple-50 text-purple-600' },
  restored:    { label: 'Restored',     color: 'bg-orange-50 text-orange-500' },
}

function formatDate(iso) {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

function macroSum(rows, key) {
  return Math.round(rows.reduce((s, r) => s + (Number(r[key]) || 0), 0))
}

// ─────────────────────────────────────────────────────────────────────────────
// Main screen
// ─────────────────────────────────────────────────────────────────────────────
export default function HistoryScreen({
  activePlanId, currentMealSlots, onClose, onPlanRestored,
}) {
  const { user }    = useAuth()
  const [tab, setTab] = useState('timeline') // 'timeline' | 'plans'

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-bg">
      {/* Header */}
      <div className="bg-white border-b border-border px-4 pt-10 pb-0">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold text-textPrimary">History</h2>
          <button onClick={onClose} className="p-2 text-textSecondary active:bg-bg rounded-lg">
            <X size={20} />
          </button>
        </div>
        {/* Tabs */}
        <div className="flex gap-1">
          {[
            { key: 'timeline', label: 'Timeline' },
            { key: 'plans',    label: 'Meal Plans' },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
                tab === key
                  ? 'border-teal-500 text-teal-600'
                  : 'border-transparent text-textSecondary'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'timeline'
        ? <TimelineTab userId={user?.id} />
        : <PlansTab
            userId={user?.id}
            activePlanId={activePlanId}
            currentMealSlots={currentMealSlots}
            onPlanRestored={onPlanRestored}
          />}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Timeline tab — day-by-day log of what was actually eaten
// ─────────────────────────────────────────────────────────────────────────────
function TimelineTab({ userId }) {
  const [days, setDays]       = useState([])   // [{ date, entries, mealLogs, expanded }]
  const [loading, setLoading] = useState(true)
  const [range, setRange]     = useState(30)   // days to load

  useEffect(() => {
    if (!userId) return
    setLoading(true)
    const dates = lastNDays(range)
    const start = dates[0]
    const end   = dates[dates.length - 1]

    Promise.all([
      getDietEntriesForRange(userId, start, end),
      getMealLogsForRange(userId, start, end),
    ]).then(([entries, logs]) => {
      // Group everything by date
      const map = {}
      for (const e of entries) {
        if (!map[e.date]) map[e.date] = { date: e.date, entries: [], mealLogs: [], expanded: false }
        map[e.date].entries.push(e)
      }
      for (const l of logs) {
        if (!l.completed) continue
        if (!map[l.date]) map[l.date] = { date: l.date, entries: [], mealLogs: [], expanded: false }
        map[l.date].mealLogs.push(l)
      }
      const sorted = Object.values(map).sort((a, b) => b.date.localeCompare(a.date))
      setDays(sorted)
    }).finally(() => setLoading(false))
  }, [userId, range])

  function toggleDay(date) {
    setDays(prev => prev.map(d => d.date === date ? { ...d, expanded: !d.expanded } : d))
  }

  if (loading) return (
    <div className="flex-1 flex justify-center items-center">
      <Loader2 size={24} className="animate-spin text-teal-500" />
    </div>
  )

  if (days.length === 0) return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
      <p className="text-textSecondary text-sm">No meals logged yet.</p>
      <p className="text-xs text-textSecondary mt-1">Start logging from the Diet screen.</p>
    </div>
  )

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
      {days.map(day => {
        // Combine entries + meal logs for macro total
        const allNutrition = [
          ...day.entries,
          ...day.mealLogs.filter(l => l.nutrition).map(l => l.nutrition),
        ]
        const totalCal  = macroSum(allNutrition, 'calories')
        const totalPro  = macroSum(allNutrition, 'protein')
        const totalCarb = macroSum(allNutrition, 'carbs')
        const totalFat  = macroSum(allNutrition, 'fat')

        const allItems = [
          ...day.mealLogs.map(l => ({
            id:   l.id,
            name: l.custom_description || `Logged meal (${l.meal_slot})`,
            time: l.consumed_at || '',
            type: l.meal_slot,
            calories: l.nutrition?.calories,
            protein:  l.nutrition?.protein,
            carbs:    l.nutrition?.carbs,
            fat:      l.nutrition?.fat,
            fromPlan: true,
          })),
          ...day.entries.map(e => ({ ...e, fromPlan: false })),
        ].sort((a, b) => (a.time || '').localeCompare(b.time || ''))

        return (
          <div key={day.date} className="bg-white rounded-xl border border-border overflow-hidden">
            {/* Day header */}
            <div
              className="flex items-center justify-between px-4 py-3 cursor-pointer select-none"
              onClick={() => toggleDay(day.date)}
            >
              <div className="flex-1">
                <p className="text-sm font-semibold text-textPrimary">{shortDate(day.date)}</p>
                {totalCal > 0 && (
                  <p className="text-xs text-textSecondary mt-0.5">
                    {totalCal} kcal · {totalPro}g P · {totalCarb}g C · {totalFat}g F
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[11px] text-textSecondary">{allItems.length} meal{allItems.length !== 1 ? 's' : ''}</span>
                {day.expanded
                  ? <ChevronUp size={15} className="text-textSecondary" />
                  : <ChevronDown size={15} className="text-textSecondary" />}
              </div>
            </div>

            {/* Expanded meals */}
            {day.expanded && allItems.length > 0 && (
              <div className="border-t border-border/60 divide-y divide-border/60">
                {allItems.map((item, i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-textPrimary truncate">{item.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {item.time && <p className="text-xs text-textSecondary">{formatTime(item.time)}</p>}
                        {item.fromPlan && (
                          <span className="text-[9px] font-semibold px-1 py-0.5 rounded bg-teal-50 text-teal-600">plan</span>
                        )}
                      </div>
                    </div>
                    {item.calories && (
                      <div className="text-right shrink-0">
                        <p className="text-sm font-semibold text-teal-500">{item.calories} kcal</p>
                        {(item.protein || item.carbs || item.fat) && (
                          <p className="text-[10px] text-textSecondary">
                            {item.protein}g P · {item.carbs}g C · {item.fat}g F
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}

      {/* Load more */}
      <button
        onClick={() => setRange(r => r + 30)}
        className="w-full text-sm text-textSecondary py-3 active:opacity-70"
      >
        Load older entries ↓
      </button>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Meal Plans tab — library of all unique saved plans
// ─────────────────────────────────────────────────────────────────────────────
function PlansTab({ userId, activePlanId, currentMealSlots, onPlanRestored }) {
  const [plans, setPlans]         = useState([])
  const [loading, setLoading]     = useState(true)
  const [previewPlan, setPreviewPlan] = useState(null)
  const [restoring, setRestoring] = useState(false)

  useEffect(() => {
    if (!userId) return
    getAllMealPlans(userId).then(setPlans).finally(() => setLoading(false))
  }, [userId])

  async function handleRestore() {
    if (!previewPlan || restoring) return
    setRestoring(true)
    try {
      const row = await saveMealPlan(userId, {
        plan:    previewPlan.plan,
        targets: previewPlan.targets,
        name:    previewPlan.name || null,
        tags:    previewPlan.tags || [],
        source:  'restored',
      })
      onPlanRestored?.({ ...previewPlan, id: row?.id, created_at: row?.created_at, source: 'restored' })
    } finally {
      setRestoring(false)
    }
  }

  if (previewPlan) {
    return (
      <WeekPlanViewer
        plan={previewPlan.plan}
        planId={previewPlan.id}
        planName={previewPlan.name || ''}
        planTags={previewPlan.tags || []}
        targets={previewPlan.targets}
        mealSlots={currentMealSlots}
        planCreatedAt={previewPlan.created_at}
        mode="history"
        onClose={() => setPreviewPlan(null)}
        onRestore={restoring ? undefined : handleRestore}
      />
    )
  }

  if (loading) return (
    <div className="flex-1 flex justify-center items-center">
      <Loader2 size={24} className="animate-spin text-teal-500" />
    </div>
  )

  if (plans.length === 0) return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
      <p className="text-textSecondary text-sm">No plans saved yet.</p>
    </div>
  )

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
      {plans.map((p, idx) => {
        const src      = SOURCE_LABELS[p.source] || SOURCE_LABELS.llm
        const isActive = p.id === activePlanId || idx === 0
        const tags     = p.tags || []

        return (
          <button
            key={p.id}
            onClick={() => setPreviewPlan(p)}
            className="w-full bg-white rounded-xl border border-border p-4 text-left flex items-center gap-3 active:bg-bg"
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-textPrimary truncate">
                {p.name || formatDate(p.created_at)}
              </p>
              {p.name && (
                <p className="text-[11px] text-textSecondary">{formatDate(p.created_at)}</p>
              )}
              <div className="flex items-center gap-1.5 flex-wrap mt-1">
                {isActive && (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-teal-100 text-teal-600">
                    Active
                  </span>
                )}
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${src.color}`}>
                  {src.label}
                </span>
                {tags.map(t => (
                  <span key={t} className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-bg border border-border text-textSecondary">
                    {t}
                  </span>
                ))}
              </div>
              {p.targets && (
                <p className="text-xs text-textSecondary mt-1">
                  {p.targets.maintenanceCalories} kcal · {p.targets.proteinG}g P · {p.targets.carbsG}g C · {p.targets.fatG}g F
                </p>
              )}
            </div>
            <ChevronRight size={16} className="text-textSecondary shrink-0" />
          </button>
        )
      })}
    </div>
  )
}
