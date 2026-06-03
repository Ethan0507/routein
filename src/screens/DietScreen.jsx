import { useState, useEffect, useCallback } from 'react'
import { Plus, Trash2, ChevronDown, ChevronUp, Loader2 } from 'lucide-react'
import Modal from '../components/Modal'
import { getDietEntriesForDate, getDietEntriesForRange, addDietEntry, deleteDietEntry } from '../lib/db'
import { useAuth } from '../contexts/AuthContext'
import { todayStr, formatTime, nowHHmm, uid, lastNDays, shortDate } from '../lib/utils'

const MEAL_TYPES = ['Breakfast', 'Mid-morning', 'Lunch', 'Pre-workout', 'Post-workout', 'Dinner', 'Before bed', 'Snack', 'Other']

function macroSum(meals, key) {
  return meals.reduce((s, m) => s + (Number(m[key]) || 0), 0)
}

export default function DietScreen() {
  const today = todayStr()
  const { user } = useAuth()
  const [meals, setMeals]       = useState([])
  const [history, setHistory]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [saving, setSaving]     = useState(false)
  const [form, setForm] = useState({ name: '', type: 'Breakfast', time: nowHHmm(), calories: '', protein: '', carbs: '', fat: '' })

  const reload = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      const [todayMeals, rangeMeals] = await Promise.all([
        getDietEntriesForDate(user.id, today),
        getDietEntriesForRange(user.id, lastNDays(7)[0], today),
      ])
      setMeals(todayMeals)
      setHistory(rangeMeals.filter(m => m.date !== today))
    } finally {
      setLoading(false)
    }
  }, [user, today])

  useEffect(() => { reload() }, [reload])

  function openAdd() {
    setForm({ name: '', type: 'Breakfast', time: nowHHmm(), calories: '', protein: '', carbs: '', fat: '' })
    setModalOpen(true)
  }

  async function handleAdd() {
    if (!form.name.trim() || saving) return
    setSaving(true)
    try {
      await addDietEntry(user.id, {
        date:     today,
        name:     form.name.trim(),
        type:     form.type,
        time:     form.time,
        calories: form.calories ? Number(form.calories) : null,
        protein:  form.protein  ? Number(form.protein)  : null,
        carbs:    form.carbs    ? Number(form.carbs)    : null,
        fat:      form.fat      ? Number(form.fat)      : null,
      })
      setModalOpen(false)
      await reload()
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id) {
    await deleteDietEntry(user.id, id)
    await reload()
  }

  const totalCal  = macroSum(meals, 'calories')
  const totalPro  = macroSum(meals, 'protein')
  const totalCarb = macroSum(meals, 'carbs')
  const totalFat  = macroSum(meals, 'fat')

  // Group history by date
  const historyByDate = {}
  for (const m of history) {
    if (!historyByDate[m.date]) historyByDate[m.date] = []
    historyByDate[m.date].push(m)
  }
  const pastDays = Object.keys(historyByDate).sort().reverse()

  return (
    <div className="flex flex-col min-h-full">
      {/* Header */}
      <div className="bg-white border-b border-border px-4 pt-10 pb-4">
        <h1 className="text-xl font-bold text-textPrimary">Diet Tracker</h1>
        <p className="text-sm text-textSecondary mt-0.5">
          {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </p>
      </div>

      <div className="flex-1 px-4 py-4 space-y-4">
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 size={24} className="animate-spin text-teal-500" />
          </div>
        ) : (
          <>
            {/* Macro totals */}
            {meals.length > 0 && (
              <div className="bg-white rounded-xl border border-border p-4">
                <p className="text-xs font-semibold text-textSecondary uppercase tracking-wide mb-3">Today's totals</p>
                <div className="grid grid-cols-4 gap-2 text-center">
                  {[
                    { label: 'Calories', val: totalCal,  unit: 'kcal', color: 'text-teal-500' },
                    { label: 'Protein',  val: totalPro,  unit: 'g',    color: 'text-blue-500' },
                    { label: 'Carbs',    val: totalCarb, unit: 'g',    color: 'text-warning' },
                    { label: 'Fat',      val: totalFat,  unit: 'g',    color: 'text-textSecondary' },
                  ].map(({ label, val, unit, color }) => (
                    <div key={label}>
                      <p className={`text-lg font-bold ${color}`}>{val || 0}</p>
                      <p className="text-[10px] text-textSecondary">{unit}</p>
                      <p className="text-[10px] text-textSecondary">{label}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Today's meals */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold text-textPrimary">Today's meals</p>
                <button
                  onClick={openAdd}
                  className="flex items-center gap-1 bg-teal-500 text-white text-xs font-medium px-3 py-1.5 rounded-lg active:bg-teal-600"
                >
                  <Plus size={14} />
                  Add meal
                </button>
              </div>

              {meals.length === 0 ? (
                <div className="bg-white rounded-xl border border-border p-6 text-center">
                  <p className="text-textSecondary text-sm">No meals logged yet</p>
                  <button onClick={openAdd} className="mt-3 text-teal-500 text-sm font-medium">
                    + Log your first meal
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {meals.map(meal => (
                    <MealCard key={meal.id} meal={meal} onDelete={handleDelete} />
                  ))}
                </div>
              )}
            </div>

            {/* History */}
            <div>
              <button
                onClick={() => setHistoryOpen(h => !h)}
                className="flex items-center gap-1.5 text-sm font-semibold text-textPrimary w-full"
              >
                Past 7 days
                {historyOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>

              {historyOpen && (
                <div className="mt-2 space-y-2">
                  {pastDays.length === 0 ? (
                    <p className="text-sm text-textSecondary py-2">No history yet.</p>
                  ) : pastDays.map(day => (
                    <div key={day} className="bg-white rounded-xl border border-border p-3">
                      <p className="text-xs font-semibold text-textSecondary mb-2">{shortDate(day)}</p>
                      {historyByDate[day].map(m => (
                        <div key={m.id} className="flex justify-between items-center py-1 border-b border-border/60 last:border-0">
                          <div>
                            <p className="text-sm font-medium text-textPrimary">{m.name}</p>
                            <p className="text-xs text-textSecondary">{m.type} · {formatTime(m.time)}</p>
                          </div>
                          {m.calories && (
                            <p className="text-sm font-semibold text-teal-500">{m.calories} kcal</p>
                          )}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Add meal modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Log meal">
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-textSecondary block mb-1">Meal name *</label>
            <input
              className="w-full border border-border rounded-lg px-3 py-2 text-sm text-textPrimary focus:outline-none focus:border-teal-500"
              placeholder="e.g. Oats with banana"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-textSecondary block mb-1">Type</label>
              <select
                className="w-full border border-border rounded-lg px-3 py-2 text-sm text-textPrimary focus:outline-none focus:border-teal-500 bg-white"
                value={form.type}
                onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
              >
                {MEAL_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-textSecondary block mb-1">Time</label>
              <input
                type="time"
                className="w-full border border-border rounded-lg px-3 py-2 text-sm text-textPrimary focus:outline-none focus:border-teal-500"
                value={form.time}
                onChange={e => setForm(f => ({ ...f, time: e.target.value }))}
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-textSecondary block mb-1">Calories (kcal)</label>
            <input
              type="number"
              className="w-full border border-border rounded-lg px-3 py-2 text-sm text-textPrimary focus:outline-none focus:border-teal-500"
              placeholder="Optional"
              value={form.calories}
              onChange={e => setForm(f => ({ ...f, calories: e.target.value }))}
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
                  value={form[macro]}
                  onChange={e => setForm(f => ({ ...f, [macro]: e.target.value }))}
                />
              </div>
            ))}
          </div>
          <button
            onClick={handleAdd}
            disabled={!form.name.trim() || saving}
            className="w-full bg-teal-500 text-white font-semibold py-3 rounded-xl mt-1 disabled:opacity-40 active:bg-teal-600 flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : 'Log meal'}
          </button>
        </div>
      </Modal>
    </div>
  )
}

function MealCard({ meal, onDelete }) {
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
          {meal.calories && (
            <span className="text-sm font-semibold text-teal-500">{meal.calories} kcal</span>
          )}
          {hasMacros && (expanded ? <ChevronUp size={16} className="text-textSecondary" /> : <ChevronDown size={16} className="text-textSecondary" />)}
          <button
            onClick={e => { e.stopPropagation(); onDelete(meal.id) }}
            className="p-1 text-textSecondary hover:text-red-500 active:text-red-600"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </button>
      {expanded && hasMacros && (
        <div className="px-3 pb-3 pt-0 grid grid-cols-3 gap-2 border-t border-border/60">
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
