import { useState, useEffect, useCallback } from 'react'
import { TrendingUp, Flame, Clock, Loader2 } from 'lucide-react'
import { getRoutineLogsForRange, getRoutineSettings, getDietEntriesForRange } from '../lib/db'
import { useAuth } from '../contexts/AuthContext'
import { lastNDays, shortDate, formatTime, todayStr } from '../lib/utils'

export default function InsightsScreen() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState(null)

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      const days = lastNDays(7)
      const start = days[0]
      const end   = todayStr()

      const [settings, rangeLogs, dietEntries] = await Promise.all([
        getRoutineSettings(user.id),
        getRoutineLogsForRange(user.id, start, end),
        getDietEntriesForRange(user.id, start, end),
      ])

      // Streak for any exercise-section block
      const exerciseBlockIds = settings.sections
        ? (settings.sections.find(s => s.id === 'exercise')?.blocks || []).map(b => b.id)
        : ['workout']
      const streakDays = lastNDays(60).reverse()
      let workoutStreak = 0
      for (const day of streakDays) {
        if (day === todayStr()) continue
        const hit = (rangeLogs[day] || []).find(l => exerciseBlockIds.includes(l.block_id) && l.actual_time)
        if (hit) workoutStreak++
        else break
      }

      // Flatten sections → blocks (handles both old flat format and new sections format)
      const enabledBlocks = settings.sections
        ? settings.sections.flatMap(s => s.blocks || []).filter(b => b.enabled !== false)
        : (settings.blocks || []).filter(b => b.enabled)

      // Per-block completion over 7 days
      const blockStats = enabledBlocks.map(block => {
        const logged = days.filter(d => (rangeLogs[d] || []).find(l => l.block_id === block.id && l.actual_time)).length
        return { block, logged, pct: Math.round((logged / days.length) * 100) }
      }).sort((a, b) => b.pct - a.pct)

      // Daily completion %
      const dailyCompletions = days.map(d => {
        const dayLogs = rangeLogs[d] || []
        const logged  = enabledBlocks.filter(b => dayLogs.find(l => l.block_id === b.id && l.actual_time)).length
        const pct     = enabledBlocks.length ? Math.round((logged / enabledBlocks.length) * 100) : 0
        return { date: d, logged, total: enabledBlocks.length, pct }
      })

      const avgCompletion = dailyCompletions.length
        ? Math.round(dailyCompletions.reduce((s, d) => s + d.pct, 0) / dailyCompletions.length)
        : 0

      // Meal type stats
      const byType = {}
      for (const m of dietEntries) {
        if (!byType[m.type]) byType[m.type] = []
        byType[m.type].push(m.time)
      }
      const mealTypeStats = Object.entries(byType)
        .map(([type, times]) => ({ type, count: times.length, avgTime: avgHHmm(times) }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5)

      // Mandatory blocks
      const mandatoryBlocks = enabledBlocks.filter(b => b.type === 'mandatory')

      setData({ blockStats, dailyCompletions, avgCompletion, workoutStreak, mealTypeStats, mandatoryBlocks, rangeLogs, days })
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => { load() }, [load])

  if (loading || !data) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 size={24} className="animate-spin text-teal-500" />
      </div>
    )
  }

  const { blockStats, dailyCompletions, avgCompletion, workoutStreak, mealTypeStats, mandatoryBlocks, rangeLogs, days } = data

  return (
    <div className="flex flex-col min-h-full">
      <div className="bg-white border-b border-border px-4 pt-10 pb-4">
        <h1 className="text-xl font-bold text-textPrimary">Insights</h1>
        <p className="text-sm text-textSecondary mt-0.5">Last 7 days</p>
      </div>

      <div className="flex-1 px-4 py-4 space-y-4">
        {/* Summary cards */}
        <div className="grid grid-cols-2 gap-3">
          <StatCard label="Workout streak" value={workoutStreak} unit="days"
            icon={<Flame size={18} className="text-orange-400" />} color="text-orange-400" />
          <StatCard label="Avg completion" value={`${avgCompletion}%`} unit="this week"
            icon={<TrendingUp size={18} className="text-teal-500" />} color="text-teal-500" />
        </div>

        {/* 7-day bar chart */}
        <section className="bg-white rounded-xl border border-border p-4">
          <p className="text-sm font-semibold text-textPrimary mb-3">Daily completion</p>
          <div className="flex items-end gap-1.5" style={{ height: 96 }}>
            {dailyCompletions.map(d => (
              <div key={d.date} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full flex items-end" style={{ height: 72 }}>
                  <div
                    className="w-full rounded-t-md transition-all duration-300"
                    style={{
                      height: `${Math.max(4, d.pct)}%`,
                      background: d.pct >= 80 ? '#1D9E75' : d.pct >= 50 ? '#F9A825' : '#E0E0E0',
                    }}
                  />
                </div>
                <p className="text-[9px] text-textSecondary text-center leading-none">
                  {shortDate(d.date).split(' ')[0]}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Block completion rates */}
        <section className="bg-white rounded-xl border border-border p-4">
          <p className="text-sm font-semibold text-textPrimary mb-3">Block completion (7 days)</p>
          {blockStats.length === 0 ? (
            <p className="text-sm text-textSecondary">No blocks configured.</p>
          ) : (
            <div className="space-y-2.5">
              {blockStats.map(({ block, logged, pct }) => (
                <div key={block.id}>
                  <div className="flex justify-between items-center mb-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm text-textPrimary">{block.name}</span>
                      {block.type === 'mandatory' && (
                        <span className="text-[9px] bg-blue-50 text-blue-500 font-semibold px-1 py-0.5 rounded-full">req</span>
                      )}
                    </div>
                    <span className="text-xs font-semibold text-textSecondary">{logged}/7</span>
                  </div>
                  <div className="h-1.5 bg-border rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{ width: `${pct}%`, background: pct >= 80 ? '#1D9E75' : pct >= 50 ? '#F9A825' : '#378ADD' }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Meal timing */}
        <section className="bg-white rounded-xl border border-border p-4">
          <p className="text-sm font-semibold text-textPrimary mb-3">Meal timing (7 days)</p>
          {mealTypeStats.length === 0 ? (
            <p className="text-sm text-textSecondary">No meals logged this week.</p>
          ) : (
            <div className="space-y-2">
              {mealTypeStats.map(({ type, count, avgTime }) => (
                <div key={type} className="flex items-center justify-between py-1 border-b border-border/60 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-textPrimary">{type}</p>
                    <p className="text-xs text-textSecondary">{count} logged this week</p>
                  </div>
                  {avgTime && (
                    <div className="flex items-center gap-1 text-textSecondary">
                      <Clock size={13} />
                      <span className="text-sm font-medium">{formatTime(avgTime)}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Mandatory blocks 7-day grid */}
        {mandatoryBlocks.length > 0 && (
          <section className="bg-white rounded-xl border border-border p-4">
            <p className="text-sm font-semibold text-textPrimary mb-3">Required blocks (7 days)</p>
            <div className="space-y-2">
              {mandatoryBlocks.map(block => (
                <div key={block.id} className="flex items-center justify-between">
                  <p className="text-sm text-textPrimary flex-1">{block.name}</p>
                  <div className="flex gap-1">
                    {days.map(d => {
                      const hit = (rangeLogs[d] || []).find(l => l.block_id === block.id && l.actual_time)
                      return (
                        <div key={d} title={shortDate(d)}
                          className={`w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold ${hit ? 'bg-teal-500 text-white' : 'bg-border text-textSecondary'}`}
                        >
                          {shortDate(d)[0]}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}

function StatCard({ label, value, unit, icon, color }) {
  return (
    <div className="bg-white rounded-xl border border-border p-4">
      <div className="flex items-start justify-between mb-2">
        <p className="text-xs text-textSecondary font-medium">{label}</p>
        {icon}
      </div>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      <p className="text-xs text-textSecondary">{unit}</p>
    </div>
  )
}

function avgHHmm(times) {
  const valid = (times || []).filter(Boolean)
  if (!valid.length) return null
  const total = valid.reduce((s, t) => {
    const [h, m] = t.split(':').map(Number)
    return s + h * 60 + m
  }, 0)
  const avg = Math.round(total / valid.length)
  return `${String(Math.floor(avg / 60)).padStart(2, '0')}:${String(avg % 60).padStart(2, '0')}`
}
