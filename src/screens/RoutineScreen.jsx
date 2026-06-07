import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle2, Clock, AlertCircle, Flame, Loader2, Utensils, ChevronDown, ChevronUp, Sparkles, Library } from 'lucide-react'
import Modal from '../components/Modal'
import {
  getActiveRoutine, updateRoutineInPlace, createRoutine, diffRoutineSections,
  getRoutineLogsForDate, upsertRoutineLog, getRoutineLogsForRange,
  getActiveMealPlan, getMealLogsForDate, upsertMealLog, deleteMealLog, DIET_BLOCK_IDS,
  getGroceryHaveState, saveGroceryHaveState,
} from '../lib/db'
import { getProfile } from '../lib/db'
import { analyzeLoggedMealDescription } from '../lib/mealRecommendation'
import { computeMealDeductions, applyDeductions } from '../lib/groceryUtils'
import { useAuth } from '../contexts/AuthContext'
import { todayStr, formatTime, nowHHmm, isTimePast, lastNDays, getDayIndexForPlan } from '../lib/utils'
import RoutineOnboardingScreen from './RoutineOnboardingScreen'

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function isDietLinked(block) {
  return block._dietLinked === true || DIET_BLOCK_IDS.includes(block.id)
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function RoutineScreen() {
  const today = todayStr()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [settings, setSettings]   = useState(null)
  const [mealSlots, setMealSlots] = useState([])
  const [logs, setLogs]           = useState([])
  const [streak, setStreak]       = useState(0)
  const [loading, setLoading]     = useState(true)
  const [nowTime, setNowTime]     = useState(nowHHmm())
  const [noteModal, setNoteModal] = useState(null)
  const [noteText, setNoteText]   = useState('')
  const [scheduleOpen, setScheduleOpen] = useState(true)
  const [editingRoutine, setEditingRoutine] = useState(false)
  const tickRef = useRef(null)

  // Diet-linked state
  const [dayMeals, setDayMeals]   = useState(null)
  const [mealLogs, setMealLogs]   = useState({})
  const [dietLogging, setDietLogging] = useState(null)

  const reload = useCallback(async () => {
    if (!user) return
    try {
      const [s, profile, todayLogs, rangeLogs, activePlan, todayMealLogs] = await Promise.all([
        getActiveRoutine(user.id),
        getProfile(user.id),
        getRoutineLogsForDate(user.id, today),
        getRoutineLogsForRange(user.id, lastNDays(60)[0], today),
        getActiveMealPlan(user.id),
        getMealLogsForDate(user.id, today),
      ])
      setSettings(s)
      setMealSlots(profile?.meal_slots || [])
      setLogs(todayLogs)

      const allBlocks = buildAllBlocks(s, profile?.meal_slots || [])
      const mandatory = allBlocks.filter(b => b.type === 'mandatory' && b.enabled).map(b => b.id)
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

  // ── Build merged block list ───────────────────────────────────────────────
  // Flattens sections into a time-sorted list, injecting diet blocks when synced

  function buildAllBlocks(s, slots) {
    if (!s) return []

    // Fallback for saved routines restored without sections
    if (!s.sections?.length) {
      return (s.blocks || [])
        .filter(b => b.enabled !== false)
        .sort((a, b) => a.planned_time.localeCompare(b.planned_time))
    }

    const all = []
    for (const section of s.sections) {
      if (section.id === 'nutrition' && s.syncDiet && slots?.length) {
        for (const slot of slots) {
          all.push({
            id:           slot.key,
            name:         slot.label,
            planned_time: s.dietBlockTimes?.[slot.key] || slot.time || '12:00',
            type:         'mandatory',
            enabled:      true,
            _dietLinked:  true,
            _sectionId:   'nutrition',
            _sectionEmoji: '🥗',
          })
        }
      } else {
        for (const block of (section.blocks || []).filter(b => b.enabled !== false)) {
          all.push({ ...block, _sectionId: section.id, _sectionEmoji: section.emoji })
        }
      }
    }
    return all.sort((a, b) => a.planned_time.localeCompare(b.planned_time))
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 size={24} className="animate-spin text-teal-500" />
      </div>
    )
  }

  function goToDiet() {
    setEditingRoutine(false)
    navigate('/diet')
  }

  // Show onboarding if no active routine exists
  if (!settings) {
    return (
      <RoutineOnboardingScreen
        existingSettings={null}
        mealSlots={mealSlots}
        onSave={async (newSettings) => {
          await createRoutine(user.id, { ...newSettings, isActive: true })
          await reload()
        }}
        onCancel={null}
        onGoToDiet={goToDiet}
      />
    )
  }

  if (editingRoutine) {
    return (
      <RoutineOnboardingScreen
        existingSettings={settings}
        mealSlots={mealSlots}
        onSave={async (newSettings) => {
          const diff = diffRoutineSections(settings.sections, newSettings.sections, settings.syncDiet, newSettings.syncDiet)
          await updateRoutineInPlace(settings.id, newSettings, diff || 'Settings updated')
          setEditingRoutine(false)
          await reload()
        }}
        onCancel={() => setEditingRoutine(false)}
        onGoToDiet={goToDiet}
      />
    )
  }

  const allBlocks     = buildAllBlocks(settings, mealSlots)
  const mandatoryBlocks = allBlocks.filter(b => b.type === 'mandatory')
  const getLog = blockId => logs.find(l => l.block_id === blockId) || null

  const loggedCount = allBlocks.filter(b => getLog(b.id)?.actual_time).length
  const totalCount  = allBlocks.length
  const scorePct    = totalCount ? Math.round((loggedCount / totalCount) * 100) : 0
  const allDone     = loggedCount === totalCount && totalCount > 0

  const nextBlock = allBlocks
    .filter(b => !getLog(b.id)?.actual_time)
    .sort((a, b) => a.planned_time.localeCompare(b.planned_time))[0] || null

  // ── Log / unlog ───────────────────────────────────────────────────────────

  async function logBlock(block) {
    const logTime = nowHHmm()
    await upsertRoutineLog(user.id, today, {
      block_id:     block.id,
      block_name:   block.name,
      block_type:   block.type,
      planned_time: block.planned_time,
      actual_time:  logTime,
      note:         getLog(block.id)?.note || null,
      routine_id:   settings?.id || null,
    })

    const linked = block._dietLinked || isDietLinked(block)
    if (linked) {
      setDietLogging(block.id)
      try {
        const meal = dayMeals?.[block.id]
        let nutrition = meal?.nutrition || null
        if (!nutrition && meal) {
          try {
            const desc = `${meal.name}. Ingredients: ${(meal.ingredients || []).map(i => `${i.quantity} ${i.name}`).join(', ')}`
            nutrition = await analyzeLoggedMealDescription(desc)
          } catch { /* log without macros */ }
        }
        await upsertMealLog(user.id, today, block.id, { completed: true, consumed_at: logTime, nutrition })

        if (meal?.ingredients?.length) {
          getGroceryHaveState(user.id).then(current => {
            const updated = applyDeductions(current, computeMealDeductions(meal.ingredients))
            saveGroceryHaveState(user.id, updated).catch(() => {})
          }).catch(() => {})
        }
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
    const linked = block._dietLinked || isDietLinked(block)
    if (linked) await deleteMealLog(user.id, today, block.id).catch(() => {})
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
      routine_id:   settings?.id || null,
    })
    setNoteModal(null)
    await reload()
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col min-h-full">
      {/* Header */}
      <div className="bg-white border-b border-border px-4 pt-10 pb-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-textPrimary">Daily Routine</h1>
            <p className="text-sm text-textSecondary mt-0.5">
              {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </p>
          </div>
          <button
            onClick={() => navigate('/library')}
            className="flex items-center gap-1.5 text-xs font-medium text-textSecondary border border-border px-3 py-1.5 rounded-lg active:bg-bg"
          >
            <Library size={13} />
            Library
          </button>
        </div>
      </div>

      <div className="flex-1 px-4 py-5 space-y-4">

        {/* Progress hero */}
        <div className="bg-white rounded-2xl border border-border p-4 flex items-center gap-4">
          <div className="relative flex items-center justify-center shrink-0" style={{ width: 72, height: 72 }}>
            <ScoreRing pct={scorePct} />
            <div className="absolute flex flex-col items-center">
              <span className="text-lg font-bold text-textPrimary leading-none">{scorePct}%</span>
              <span className="text-[9px] text-textSecondary leading-none mt-0.5">done</span>
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-textPrimary">{loggedCount} / {totalCount} blocks logged</p>
            <div className="w-full h-1.5 bg-gray-100 rounded-full mt-2 overflow-hidden">
              <div className="h-full bg-teal-500 rounded-full transition-all duration-500" style={{ width: `${scorePct}%` }} />
            </div>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {mandatoryBlocks.map(block => (
                <MandatoryChip key={block.id} block={block} status={blockStatus(block, getLog(block.id))} />
              ))}
            </div>
          </div>

          <div className="flex flex-col items-center shrink-0">
            <div className="flex items-center gap-0.5">
              <Flame size={18} className={streak > 0 ? 'text-orange-400' : 'text-border'} />
              <span className={`text-xl font-bold ${streak > 0 ? 'text-orange-400' : 'text-textSecondary'}`}>{streak}</span>
            </div>
            <span className="text-[10px] text-textSecondary">streak</span>
          </div>
        </div>

        {/* Next up / All done */}
        {allDone ? (
          <div className="bg-teal-50 border border-teal-100 rounded-2xl p-5 flex flex-col items-center gap-2 text-center">
            <Sparkles size={28} className="text-teal-500" />
            <p className="text-base font-bold text-teal-700">All done for today!</p>
            <p className="text-sm text-teal-600/80">Great work — see you tomorrow.</p>
          </div>
        ) : nextBlock ? (
          <div className="bg-white rounded-2xl border border-border overflow-hidden">
            <div className="px-4 pt-3 pb-1">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-textSecondary">Next up</p>
            </div>
            <BlockRow
              block={nextBlock}
              log={getLog(nextBlock.id)}
              status={blockStatus(nextBlock, getLog(nextBlock.id))}
              onLog={() => logBlock(nextBlock)}
              onUnlog={() => unlogBlock(nextBlock)}
              onNote={() => openNoteModal(nextBlock)}
              planMeal={isDietLinked(nextBlock) ? dayMeals?.[nextBlock.id] : null}
              mealLog={isDietLinked(nextBlock) ? mealLogs[nextBlock.id] : null}
              isDietLogging={dietLogging === nextBlock.id}
              isLinked={isDietLinked(nextBlock)}
              featured
            />
          </div>
        ) : null}

        {/* Full schedule */}
        <div className="bg-white rounded-2xl border border-border overflow-hidden">
          <button
            onClick={() => setScheduleOpen(o => !o)}
            className="w-full flex items-center justify-between px-4 py-3 active:bg-bg"
          >
            <span className="text-sm font-semibold text-textPrimary">Full schedule</span>
            <div className="flex items-center gap-2 text-textSecondary">
              <span className="text-xs">{loggedCount}/{totalCount}</span>
              {scheduleOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </div>
          </button>

          {scheduleOpen && (
            <div className="border-t border-border px-4 pt-3 pb-4">
              <div className="relative">
                <div className="absolute left-[19px] top-0 bottom-0 w-px bg-border" />
                <div className="space-y-2">
                  {allBlocks.map(block => (
                    <BlockRow
                      key={block.id}
                      block={block}
                      log={getLog(block.id)}
                      status={blockStatus(block, getLog(block.id))}
                      onLog={() => logBlock(block)}
                      onUnlog={() => unlogBlock(block)}
                      onNote={() => openNoteModal(block)}
                      planMeal={isDietLinked(block) ? dayMeals?.[block.id] : null}
                      mealLog={isDietLinked(block) ? mealLogs[block.id] : null}
                      isDietLogging={dietLogging === block.id}
                      isLinked={isDietLinked(block)}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Edit routine */}
        <button
          onClick={() => setEditingRoutine(true)}
          className="w-full text-sm text-textSecondary py-2 active:text-teal-500 transition-colors"
        >
          Edit routine
        </button>
      </div>

      {/* Note modal */}
      <Modal open={!!noteModal} onClose={() => setNoteModal(null)} title={noteModal ? `Note — ${noteModal.name}` : ''}>
        <textarea
          className="w-full border border-border rounded-lg px-3 py-2 text-sm text-textPrimary focus:outline-none focus:border-teal-500 resize-none"
          rows={4}
          placeholder="Optional note..."
          value={noteText}
          onChange={e => setNoteText(e.target.value)}
          autoFocus
        />
        <button onClick={saveNote} className="w-full bg-teal-500 text-white font-semibold py-3 rounded-xl mt-3 active:bg-teal-600">
          Save note
        </button>
      </Modal>

    </div>
  )
}

// ── BlockRow ──────────────────────────────────────────────────────────────────

function BlockRow({ block, log, status, onLog, onUnlog, onNote, planMeal, mealLog, isDietLogging, isLinked, featured = false }) {
  const isLogged  = status === 'logged'
  const isMissed  = status === 'missed'
  const nutrition = mealLog?.nutrition
  const dotBg     = isLogged ? 'bg-teal-500 border-teal-500' : isMissed ? 'bg-blue-500 border-blue-500' : 'bg-white border-border'

  const badges = (
    <div className="flex items-center gap-1.5 flex-wrap">
      {block._sectionEmoji && (
        <span className="text-sm leading-none opacity-70">{block._sectionEmoji}</span>
      )}
      <p className={`text-${featured ? 'base' : 'sm'} font-${featured ? 'bold' : 'semibold'} ${isLogged ? 'text-teal-600' : isMissed ? 'text-blue-600' : 'text-textPrimary'}`}>
        {block.name}
      </p>
      {block.type === 'mandatory' && (
        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${isLogged ? 'bg-teal-100 text-teal-600' : isMissed ? 'bg-blue-100 text-blue-600' : 'bg-blue-50 text-blue-500'}`}>
          required
        </span>
      )}
      {isLinked && (
        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-orange-50 text-orange-500 flex items-center gap-0.5">
          <Utensils size={9} />diet
        </span>
      )}
    </div>
  )

  const meta = (
    <>
      {planMeal && (
        <p className={`text-${featured ? 'sm' : 'xs'} font-medium truncate ${isLogged ? 'text-teal-600/80' : 'text-textSecondary'}`}>
          {planMeal.name}
        </p>
      )}
      <p className={`text-xs mt-0.5 ${isLogged || isMissed ? 'opacity-60' : 'text-textSecondary'}`}>
        Planned {formatTime(block.planned_time)}
        {isLogged && log?.actual_time && ` · Logged ${formatTime(log.actual_time)}`}
      </p>
      {isLogged && nutrition?.calories && (
        <p className="text-[10px] text-teal-600 mt-0.5">
          {nutrition.calories} kcal · {nutrition.protein}g P · {nutrition.carbs}g C · {nutrition.fat}g F
        </p>
      )}
      {isDietLogging && (
        <p className="text-[10px] text-teal-500 mt-0.5 flex items-center gap-1">
          <Loader2 size={9} className="animate-spin" />Estimating macros…
        </p>
      )}
      {log?.note && (
        <p className="text-xs italic text-textSecondary mt-1 line-clamp-2">"{log.note}"</p>
      )}
    </>
  )

  if (featured) {
    return (
      <div className={`mx-4 mb-4 rounded-xl border p-4 ${isLogged ? 'bg-teal-50 border-teal-100' : isMissed ? 'bg-blue-50 border-blue-100' : 'bg-gray-50 border-border'}`}>
        <div className="mb-0.5">{badges}</div>
        {meta}
        <div className="flex items-center gap-2 mt-3">
          <button
            onClick={onNote}
            className={`text-sm px-3 py-2 rounded-xl border font-medium flex-1 ${log?.note ? 'bg-white border-border text-teal-500' : 'border-border text-textSecondary'} active:bg-bg`}
          >
            {log?.note ? 'Edit note' : 'Add note'}
          </button>
          {isLogged ? (
            <button onClick={onUnlog} className="text-sm px-4 py-2 rounded-xl bg-white border border-teal-200 text-teal-600 font-semibold active:bg-teal-50 flex-1">
              Undo
            </button>
          ) : (
            <button
              onClick={onLog}
              disabled={isDietLogging}
              className={`text-sm px-4 py-2 rounded-xl font-bold disabled:opacity-50 flex-1 flex items-center justify-center gap-1.5 ${isMissed ? 'bg-blue-500 text-white active:bg-blue-600' : 'bg-teal-500 text-white active:bg-teal-600'}`}
            >
              {isDietLogging ? <Loader2 size={14} className="animate-spin" /> : 'Log it'}
            </button>
          )}
        </div>
      </div>
    )
  }

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
            <div className="mb-0.5">{badges}</div>
            {meta}
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

// ── MandatoryChip ─────────────────────────────────────────────────────────────

function MandatoryChip({ block, status }) {
  const isLogged = status === 'logged'
  const isMissed = status === 'missed'
  return (
    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${isLogged ? 'bg-teal-100 text-teal-600' : isMissed ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-textSecondary'}`}>
      {isLogged ? '✓ ' : isMissed ? '! ' : ''}{block.name}
    </span>
  )
}

// ── ScoreRing ─────────────────────────────────────────────────────────────────

function ScoreRing({ pct }) {
  const r = 30, circ = 2 * Math.PI * r
  return (
    <svg width="72" height="72" style={{ transform: 'rotate(-90deg)' }}>
      <circle cx="36" cy="36" r={r} fill="none" stroke="#E0E0E0" strokeWidth="5" />
      <circle cx="36" cy="36" r={r} fill="none" stroke="#1D9E75" strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray={`${(pct / 100) * circ} ${circ - (pct / 100) * circ}`}
        style={{ transition: 'stroke-dasharray 0.4s ease' }}
      />
    </svg>
  )
}

