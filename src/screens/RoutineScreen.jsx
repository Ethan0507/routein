import { useState, useEffect, useCallback, useRef } from 'react'
import { CheckCircle2, Clock, AlertCircle, Settings, X, Flame, Loader2, Utensils } from 'lucide-react'
import Modal from '../components/Modal'
import {
  getRoutineSettings, saveRoutineSettings, getRoutineLogsForDate, upsertRoutineLog, getRoutineLogsForRange,
  getActiveMealPlan, getMealLogsForDate, upsertMealLog, deleteMealLog, DIET_BLOCK_IDS,
} from '../lib/db'
import { analyzeLoggedMealDescription } from '../lib/mealRecommendation'
import { useAuth } from '../contexts/AuthContext'
import { todayStr, formatTime, nowHHmm, uid, isTimePast, lastNDays, getDayIndexForPlan } from '../lib/utils'

function blockStatus(block, log) {
  if (log?.actual_time) return 'logged'
  if (block.type === 'mandatory' && isTimePast(block.planned_time)) return 'missed'
  return 'pending'
}

function computeStreak(rangeLogsMap, mandatoryIds) {
  if (!mandatoryIds.length) return 0
  const days = lastNDays(60).reverse()
  let streak = 0
  for (const day of days) {
    if (day === todayStr()) continue
    const logs = rangeLogsMap[day] || []
    const allHit = mandatoryIds.every(id => logs.find(l => l.block_id === id && l.actual_time))
    if (allHit) streak++
    else break
  }
  return streak
}

export default function RoutineScreen() {
  const today = todayStr()
  const { user } = useAuth()
  const [settings, setSettings]   = useState(null)
  const [logs, setLogs]           = useState([])
  const [streak, setStreak]       = useState(0)
  const [loading, setLoading]     = useState(true)
  const [nowTime, setNowTime]     = useState(nowHHmm())
  const [noteModal, setNoteModal] = useState(null)
  const [noteText, setNoteText]   = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const tickRef = useRef(null)

  // Diet-linked state
  const [dayMeals, setDayMeals]   = useState(null)  // today's plan meals { breakfast, lunch, dinner, ... }
  const [mealLogs, setMealLogs]   = useState({})    // { slot: log }
  const [dietLogging, setDietLogging] = useState(null) // block.id being diet-logged

  const reload = useCallback(async () => {
    if (!user) return
    try {
      const [s, todayLogs, rangeLogs, activePlan, todayMealLogs] = await Promise.all([
        getRoutineSettings(user.id),
        getRoutineLogsForDate(user.id, today),
        getRoutineLogsForRange(user.id, lastNDays(60)[0], today),
        getActiveMealPlan(user.id),
        getMealLogsForDate(user.id, today),
      ])
      setSettings(s)
      setLogs(todayLogs)
      const mandatory = s.blocks.filter(b => b.type === 'mandatory' && b.enabled).map(b => b.id)
      setStreak(computeStreak(rangeLogs, mandatory))

      if (activePlan?.plan) {
        const dayIdx = getDayIndexForPlan(activePlan.created_at)
        setDayMeals(activePlan.plan[dayIdx] || activePlan.plan[0] || null)
      }
      setMealLogs(todayMealLogs)
    } finally {
      setLoading(false)
    }
  }, [user, today])

  useEffect(() => {
    reload()
    tickRef.current = setInterval(() => setNowTime(nowHHmm()), 30_000)
    return () => clearInterval(tickRef.current)
  }, [reload])

  if (loading || !settings) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 size={24} className="animate-spin text-teal-500" />
      </div>
    )
  }

  const enabledBlocks  = settings.blocks.filter(b => b.enabled)
  const mandatoryBlocks = enabledBlocks.filter(b => b.type === 'mandatory')
  const getLog = blockId => logs.find(l => l.block_id === blockId) || null

  async function logBlock(block) {
    const logTime = nowHHmm()
    // Log routine block
    await upsertRoutineLog(user.id, today, {
      block_id:     block.id,
      block_name:   block.name,
      block_type:   block.type,
      planned_time: block.planned_time,
      actual_time:  logTime,
      note:         getLog(block.id)?.note || null,
    })

    // For diet-linked blocks, also log in meal_logs (AI macro estimation in background)
    if (DIET_BLOCK_IDS.includes(block.id)) {
      setDietLogging(block.id)
      try {
        const meal = dayMeals?.[block.id]
        let nutrition = null
        if (meal) {
          try {
            const desc = `${meal.name}. Ingredients: ${(meal.ingredients || []).map(i => `${i.quantity} ${i.name}`).join(', ')}`
            nutrition = await analyzeLoggedMealDescription(desc)
          } catch { /* log without macros */ }
        }
        await upsertMealLog(user.id, today, block.id, {
          completed:   true,
          consumed_at: logTime,
          nutrition,
        })
      } finally {
        setDietLogging(null)
      }
    }

    await reload()
  }

  async function unlogBlock(block) {
    const existing = getLog(block.id)
    if (!existing) return
    await upsertRoutineLog(user.id, today, { ...existing, actual_time: null })
    // Also remove meal log for diet-linked blocks
    if (DIET_BLOCK_IDS.includes(block.id)) {
      await deleteMealLog(user.id, today, block.id).catch(() => {})
    }
    await reload()
  }

  function openNoteModal(block) {
    setNoteModal(block)
    setNoteText(getLog(block.id)?.note || '')
  }

  async function saveNote() {
    if (!noteModal) return
    const existing = getLog(noteModal.id)
    await upsertRoutineLog(user.id, today, {
      block_id:     noteModal.id,
      block_name:   noteModal.name,
      block_type:   noteModal.type,
      planned_time: noteModal.planned_time,
      actual_time:  existing?.actual_time || null,
      note:         noteText || null,
    })
    setNoteModal(null)
    await reload()
  }

  const loggedCount = enabledBlocks.filter(b => getLog(b.id)?.actual_time).length
  const totalCount  = enabledBlocks.length
  const scorePct    = totalCount ? Math.round((loggedCount / totalCount) * 100) : 0

  return (
    <div className="flex flex-col min-h-full">
      <div className="bg-white border-b border-border px-4 pt-10 pb-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-xl font-bold text-textPrimary">Daily Routine</h1>
            <p className="text-sm text-textSecondary mt-0.5">
              {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </p>
          </div>
          <button
            onClick={() => setSettingsOpen(true)}
            className="p-2 rounded-lg border border-border text-textSecondary active:bg-bg"
          >
            <Settings size={18} />
          </button>
        </div>

        <div className="flex items-center gap-4">
          <div className="relative flex items-center justify-center" style={{ width: 64, height: 64 }}>
            <ScoreRing pct={scorePct} />
            <div className="absolute flex flex-col items-center">
              <span className="text-base font-bold text-textPrimary leading-none">{scorePct}%</span>
              <span className="text-[9px] text-textSecondary leading-none mt-0.5">done</span>
            </div>
          </div>
          <div className="flex-1">
            <p className="text-xs text-textSecondary mb-1">{loggedCount} of {totalCount} blocks logged</p>
            <div className="flex flex-wrap gap-1.5">
              {mandatoryBlocks.map(block => (
                <MandatoryChip key={block.id} block={block} status={blockStatus(block, getLog(block.id))} />
              ))}
            </div>
          </div>
          <div className="flex flex-col items-center shrink-0">
            <div className="flex items-center gap-0.5">
              <Flame size={16} className={streak > 0 ? 'text-orange-400' : 'text-border'} />
              <span className={`text-lg font-bold ${streak > 0 ? 'text-orange-400' : 'text-textSecondary'}`}>{streak}</span>
            </div>
            <span className="text-[10px] text-textSecondary">streak</span>
          </div>
        </div>
      </div>

      <div className="flex-1 px-4 py-4">
        <div className="relative">
          <div className="absolute left-[19px] top-0 bottom-0 w-px bg-border" />
          <div className="space-y-2">
            {enabledBlocks.map(block => (
              <BlockRow
                key={block.id}
                block={block}
                log={getLog(block.id)}
                status={blockStatus(block, getLog(block.id))}
                onLog={() => logBlock(block)}
                onUnlog={() => unlogBlock(block)}
                onNote={() => openNoteModal(block)}
                planMeal={DIET_BLOCK_IDS.includes(block.id) ? dayMeals?.[block.id] : null}
                mealLog={DIET_BLOCK_IDS.includes(block.id) ? mealLogs[block.id] : null}
                isDietLogging={dietLogging === block.id}
              />
            ))}
          </div>
        </div>
      </div>

      <Modal open={!!noteModal} onClose={() => setNoteModal(null)} title={noteModal ? `Note — ${noteModal.name}` : ''}>
        <textarea
          className="w-full border border-border rounded-lg px-3 py-2 text-sm text-textPrimary focus:outline-none focus:border-teal-500 resize-none"
          rows={4}
          placeholder="Optional note..."
          value={noteText}
          onChange={e => setNoteText(e.target.value)}
          autoFocus
        />
        <button
          onClick={saveNote}
          className="w-full bg-teal-500 text-white font-semibold py-3 rounded-xl mt-3 active:bg-teal-600"
        >
          Save note
        </button>
      </Modal>

      <RoutineSettings
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        onSave={async s => { await saveRoutineSettings(user.id, s); setSettings(s); await reload() }}
      />
    </div>
  )
}

function BlockRow({ block, log, status, onLog, onUnlog, onNote, planMeal, mealLog, isDietLogging }) {
  const isLogged  = status === 'logged'
  const isMissed  = status === 'missed'
  const isDiet    = !!planMeal || DIET_BLOCK_IDS.includes(block.id)
  const nutrition = mealLog?.nutrition
  const dotBg     = isLogged ? 'bg-teal-500 border-teal-500' : isMissed ? 'bg-blue-500 border-blue-500' : 'bg-white border-border'

  return (
    <div className="flex gap-3 relative">
      <div className={`shrink-0 w-10 h-10 rounded-full border-2 flex items-center justify-center z-10 ${dotBg}`} style={{ marginLeft: -1 }}>
        {isLogged && <CheckCircle2 size={18} className="text-white" strokeWidth={2.5} />}
        {isMissed && <AlertCircle  size={18} className="text-white" strokeWidth={2.5} />}
        {status === 'pending' && <Clock size={16} className="text-border" strokeWidth={1.8} />}
      </div>
      <div className={`flex-1 mb-1 rounded-xl border p-3 ${isLogged ? 'bg-teal-50 border-teal-100' : isMissed ? 'bg-blue-50 border-blue-100' : 'bg-white border-border'}`}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <p className={`text-sm font-semibold ${isLogged ? 'text-teal-600' : isMissed ? 'text-blue-600' : 'text-textPrimary'}`}>
                {block.name}
              </p>
              {block.type === 'mandatory' && (
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${isLogged ? 'bg-teal-100 text-teal-600' : isMissed ? 'bg-blue-100 text-blue-600' : 'bg-blue-50 text-blue-500'}`}>
                  required
                </span>
              )}
              {isDiet && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-orange-50 text-orange-500 flex items-center gap-0.5">
                  <Utensils size={9} />diet
                </span>
              )}
            </div>

            {/* Planned meal name */}
            {planMeal && (
              <p className={`text-xs font-medium mt-0.5 truncate ${isLogged ? 'text-teal-600/80' : 'text-textSecondary'}`}>
                {planMeal.name}
              </p>
            )}

            <p className={`text-xs mt-0.5 ${isLogged || isMissed ? 'opacity-60' : 'text-textSecondary'}`}>
              Planned {formatTime(block.planned_time)}
              {isLogged && log?.actual_time && ` · Logged ${formatTime(log.actual_time)}`}
            </p>

            {/* Macros from diet log */}
            {isLogged && nutrition?.calories && (
              <p className="text-[10px] text-teal-600 mt-0.5">
                {nutrition.calories} kcal · {nutrition.protein}g P · {nutrition.carbs}g C · {nutrition.fat}g F
              </p>
            )}
            {isLogged && isDiet && !nutrition?.calories && !isDietLogging && (
              <p className="text-[10px] text-textSecondary/60 mt-0.5">Macros not estimated</p>
            )}
            {isDietLogging && (
              <p className="text-[10px] text-teal-500 mt-0.5 flex items-center gap-1">
                <Loader2 size={9} className="animate-spin" />Estimating macros…
              </p>
            )}

            {log?.note && (
              <p className="text-xs italic text-textSecondary mt-1 line-clamp-2">"{log.note}"</p>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={onNote}
              className={`text-xs px-2 py-1 rounded-lg border font-medium ${log?.note ? 'bg-white border-border text-teal-500' : 'border-border text-textSecondary'} active:bg-bg`}
            >
              {log?.note ? 'Edit note' : 'Note'}
            </button>
            {isLogged ? (
              <button onClick={onUnlog} className="text-xs px-2.5 py-1 rounded-lg bg-white border border-teal-200 text-teal-600 font-medium active:bg-teal-50">
                Undo
              </button>
            ) : (
              <button
                onClick={onLog}
                disabled={isDietLogging}
                className={`text-xs px-2.5 py-1 rounded-lg font-semibold disabled:opacity-50 ${isMissed ? 'bg-blue-500 text-white active:bg-blue-600' : 'bg-teal-500 text-white active:bg-teal-600'}`}
              >
                {isDietLogging ? <Loader2 size={12} className="animate-spin" /> : 'Log'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function MandatoryChip({ block, status }) {
  const isLogged = status === 'logged'
  const isMissed = status === 'missed'
  return (
    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${isLogged ? 'bg-teal-100 text-teal-600' : isMissed ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-textSecondary'}`}>
      {isLogged ? '✓ ' : isMissed ? '! ' : ''}{block.name}
    </span>
  )
}

function ScoreRing({ pct }) {
  const r = 28, circ = 2 * Math.PI * r
  return (
    <svg width="64" height="64" style={{ transform: 'rotate(-90deg)' }}>
      <circle cx="32" cy="32" r={r} fill="none" stroke="#E0E0E0" strokeWidth="5" />
      <circle cx="32" cy="32" r={r} fill="none" stroke="#1D9E75" strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray={`${(pct / 100) * circ} ${circ - (pct / 100) * circ}`}
        style={{ transition: 'stroke-dasharray 0.4s ease' }}
      />
    </svg>
  )
}

function RoutineSettings({ open, onClose, settings, onSave }) {
  const [blocks, setBlocks] = useState(settings.blocks)
  const [saving, setSaving] = useState(false)

  useEffect(() => { if (open) setBlocks(settings.blocks) }, [open, settings.blocks])

  function updateBlock(id, key, val) {
    setBlocks(bs => bs.map(b => b.id === id ? { ...b, [key]: val } : b))
  }

  async function save() {
    setSaving(true)
    try {
      await onSave({ ...settings, blocks })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-start bg-bg overflow-y-auto">
      <div className="w-full max-w-mobile">
        <div className="bg-white border-b border-border px-4 pt-10 pb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-textPrimary">Routine Settings</h2>
          <button onClick={onClose} className="p-2 text-textSecondary"><X size={20} /></button>
        </div>
        <div className="px-4 py-4 space-y-2">
          <p className="text-xs text-textSecondary mb-3">Toggle blocks on/off or edit their name and planned time.</p>
          {blocks.map(block => {
            const isDiet = DIET_BLOCK_IDS.includes(block.id)
            return (
            <div key={block.id} className={`bg-white rounded-xl border p-3 ${isDiet ? 'border-orange-200' : 'border-border'}`}>
              <div className="flex items-center gap-3 mb-2">
                {isDiet ? (
                  <div className="w-10 h-6 rounded-full bg-teal-500 relative opacity-60 cursor-not-allowed flex-shrink-0">
                    <span className="absolute top-0.5 translate-x-4 w-5 h-5 bg-white rounded-full shadow" />
                  </div>
                ) : (
                  <button
                    onClick={() => updateBlock(block.id, 'enabled', !block.enabled)}
                    className={`w-10 h-6 rounded-full relative transition-colors flex-shrink-0 ${block.enabled ? 'bg-teal-500' : 'bg-border'}`}
                  >
                    <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${block.enabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
                  </button>
                )}
                <span className={`text-xs font-semibold uppercase px-1.5 py-0.5 rounded-full ${block.type === 'mandatory' ? 'bg-blue-50 text-blue-500' : 'bg-gray-100 text-textSecondary'}`}>
                  {block.type}
                </span>
                {isDiet && (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-orange-50 text-orange-500 flex items-center gap-0.5 ml-auto">
                    <Utensils size={9} />diet linked
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-textSecondary font-medium block mb-1">Block name</label>
                  <input
                    className="w-full border border-border rounded-lg px-2 py-1.5 text-sm text-textPrimary focus:outline-none focus:border-teal-500"
                    value={block.name}
                    onChange={e => updateBlock(block.id, 'name', e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-[10px] text-textSecondary font-medium block mb-1">Planned time</label>
                  <input
                    type="time"
                    className="w-full border border-border rounded-lg px-2 py-1.5 text-sm text-textPrimary focus:outline-none focus:border-teal-500"
                    value={block.planned_time}
                    onChange={e => updateBlock(block.id, 'planned_time', e.target.value)}
                  />
                </div>
              </div>
            </div>
          )})}
        </div>
        <div className="px-4 pb-8">
          <button
            onClick={save}
            disabled={saving}
            className="w-full bg-teal-500 text-white font-semibold py-3 rounded-xl active:bg-teal-600 flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : 'Save settings'}
          </button>
        </div>
      </div>
    </div>
  )
}
