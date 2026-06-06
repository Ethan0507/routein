import { useState, useEffect } from 'react'
import { X, ChevronRight, Loader2, Clock } from 'lucide-react'
import { getAllMealPlans, saveMealPlan } from '../lib/db'
import { useAuth } from '../contexts/AuthContext'
import WeekPlanViewer from '../components/WeekPlanViewer'

const SOURCE_LABELS = {
  llm:          { label: 'AI generated',  color: 'bg-teal-50 text-teal-600' },
  fallback:     { label: 'Default plan',  color: 'bg-gray-100 text-textSecondary' },
  edited:       { label: 'Edited',        color: 'bg-blue-50 text-blue-600' },
  regenerated:  { label: 'Regenerated',   color: 'bg-purple-50 text-purple-600' },
  restored:     { label: 'Restored',      color: 'bg-orange-50 text-orange-500' },
}

function formatPlanDate(iso) {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

export default function PlanHistoryScreen({ activePlanId, currentMealSlots, onClose, onPlanRestored }) {
  const { user } = useAuth()
  const [plans, setPlans]         = useState([])
  const [loading, setLoading]     = useState(true)
  const [previewPlan, setPreviewPlan] = useState(null) // full plan row to preview
  const [restoring, setRestoring]  = useState(false)

  useEffect(() => {
    if (!user) return
    getAllMealPlans(user.id)
      .then(setPlans)
      .finally(() => setLoading(false))
  }, [user])

  async function handleRestore() {
    if (!previewPlan || restoring) return
    setRestoring(true)
    try {
      const row = await saveMealPlan(user.id, {
        plan:    previewPlan.plan,
        targets: previewPlan.targets,
        source:  'restored',
      })
      onPlanRestored({ ...previewPlan, id: row?.id, created_at: row?.created_at, source: 'restored' })
    } finally {
      setRestoring(false)
    }
  }

  // ── Preview a plan ──────────────────────────────────────────────────────────
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

  // ── Plan list ───────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-bg">
      <div className="bg-white border-b border-border px-4 pt-10 pb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock size={18} className="text-teal-500" />
          <h2 className="text-lg font-bold text-textPrimary">Plan History</h2>
        </div>
        <button onClick={onClose} className="p-2 text-textSecondary active:bg-bg rounded-lg">
          <X size={20} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 size={24} className="animate-spin text-teal-500" />
          </div>
        ) : plans.length === 0 ? (
          <div className="bg-white rounded-xl border border-border p-8 text-center mt-4">
            <p className="text-textSecondary text-sm">No plans saved yet.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {plans.map((p, idx) => {
              const src      = SOURCE_LABELS[p.source] || SOURCE_LABELS.llm
              const isActive = p.id === activePlanId || idx === 0
              const macros   = p.targets
              const tags     = p.tags || []

              return (
                <button
                  key={p.id}
                  onClick={() => setPreviewPlan(p)}
                  className="w-full bg-white rounded-xl border border-border p-4 text-left flex items-center gap-3 active:bg-bg transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    {/* Name or date */}
                    <p className="text-sm font-bold text-textPrimary truncate">
                      {p.name || formatPlanDate(p.created_at)}
                    </p>
                    {p.name && (
                      <p className="text-[11px] text-textSecondary">{formatPlanDate(p.created_at)}</p>
                    )}

                    {/* Badges */}
                    <div className="flex items-center gap-1.5 flex-wrap mt-1">
                      {isActive && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-teal-100 text-teal-600">Active</span>
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

                    {macros && (
                      <p className="text-xs text-textSecondary mt-1">
                        {macros.maintenanceCalories} kcal · {macros.proteinG}g P · {macros.carbsG}g C · {macros.fatG}g F
                      </p>
                    )}
                  </div>
                  <ChevronRight size={16} className="text-textSecondary shrink-0" />
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
