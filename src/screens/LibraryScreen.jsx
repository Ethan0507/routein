import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Plus, Trash2, Loader2, ChevronDown, ChevronUp, CheckCircle2, Circle,
  Pencil, Clock, CalendarDays, History, UtensilsCrossed, X,
} from 'lucide-react'
import {
  getAllRoutines, createRoutine, updateRoutineInPlace, activateRoutine,
  deactivateAllRoutines, deleteRoutine, diffRoutineSections,
  getAllMealPlans, activateMealPlan, deactivateMealPlan, deleteMealPlan,
  getCustomMeals, saveCustomMeal, updateCustomMeal, deleteCustomMeal,
  getProfile,
} from '../lib/db'
import { normalizeMealSlots } from '../lib/utils'
import { useAuth } from '../contexts/AuthContext'
import Modal from '../components/Modal'
import RoutineOnboardingScreen from './RoutineOnboardingScreen'
import WeekPlanViewer from '../components/WeekPlanViewer'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtDateTime(iso) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function LibraryScreen() {
  const [tab, setTab] = useState('routines')

  return (
    <div className="flex flex-col min-h-full">
      <div className="bg-white border-b border-border px-4 pt-10 pb-4">
        <h1 className="text-xl font-bold text-textPrimary">Library</h1>
        <p className="text-sm text-textSecondary mt-0.5">Routines, meal plans &amp; catalogue</p>
      </div>

      <div className="bg-white border-b border-border flex">
        {[
          { key: 'routines', label: 'Routines' },
          { key: 'plans',    label: 'Meal Plans' },
          { key: 'meals',    label: 'Meals' },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${
              tab === key
                ? 'text-teal-500 border-b-2 border-teal-500'
                : 'text-textSecondary'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'routines' ? <RoutinesTab /> : tab === 'plans' ? <PlansTab /> : <MealsTab />}
    </div>
  )
}

// ── Routines tab ──────────────────────────────────────────────────────────────

function RoutinesTab() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [routines, setRoutines] = useState([])
  const [mealSlots, setMealSlots] = useState([])
  const [loading, setLoading]   = useState(true)
  const [mode, setMode]         = useState('list') // 'list' | 'create' | 'edit'
  const [editTarget, setEditTarget] = useState(null)
  const [acting, setActing]     = useState(null) // id of routine being acted on

  const load = useCallback(async () => {
    setLoading(true)
    const [all, profile] = await Promise.all([
      getAllRoutines(user.id),
      getProfile(user.id),
    ])
    setRoutines(all)
    setMealSlots(normalizeMealSlots(profile?.meal_slots))
    setLoading(false)
  }, [user])

  useEffect(() => { load() }, [load])

  async function handleActivate(routine) {
    setActing(routine.id)
    try {
      await activateRoutine(user.id, routine.id)
      await load()
    } finally { setActing(null) }
  }

  async function handleDeactivate() {
    setActing('deactivate')
    try {
      await deactivateAllRoutines(user.id)
      await load()
    } finally { setActing(null) }
  }

  async function handleDelete(routine) {
    if (!confirm(`Delete "${routine.name || 'Unnamed routine'}"? This cannot be undone.`)) return
    setActing(routine.id)
    try {
      await deleteRoutine(user.id, routine.id)
      await load()
    } finally { setActing(null) }
  }

  if (mode === 'create') {
    return (
      <RoutineOnboardingScreen
        existingSettings={null}
        mealSlots={mealSlots}
        onSave={async (settings) => {
          await createRoutine(user.id, { ...settings, isActive: false })
          setMode('list')
          await load()
        }}
        onCancel={() => setMode('list')}
        onGoToDiet={() => navigate('/diet')}
      />
    )
  }

  if (mode === 'edit' && editTarget) {
    return (
      <RoutineOnboardingScreen
        existingSettings={editTarget}
        mealSlots={mealSlots}
        onSave={async (settings) => {
          const diff = diffRoutineSections(
            editTarget.sections, settings.sections,
            editTarget.syncDiet, settings.syncDiet,
          )
          await updateRoutineInPlace(editTarget.id, settings, diff || 'Settings updated')
          setMode('list')
          setEditTarget(null)
          await load()
        }}
        onCancel={() => { setMode('list'); setEditTarget(null) }}
        onGoToDiet={() => navigate('/diet')}
      />
    )
  }

  const active   = routines.find(r => r.isActive) || null
  const inactive = routines.filter(r => !r.isActive)

  return (
    <div className="flex-1 px-4 py-4 space-y-4 overflow-y-auto pb-6">
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 size={20} className="animate-spin text-teal-500" />
        </div>
      ) : (
        <>
          {/* Active routine */}
          <section>
            <p className="text-xs font-semibold text-textSecondary uppercase tracking-wide mb-2">Active routine</p>
            {active ? (
              <RoutineCard
                routine={active}
                isActive
                acting={acting}
                onEdit={() => { setEditTarget(active); setMode('edit') }}
                onDeactivate={handleDeactivate}
                onDelete={() => handleDelete(active)}
              />
            ) : (
              <div className="bg-white rounded-xl border border-border p-5 text-center">
                <Circle size={28} className="text-border mx-auto mb-2" />
                <p className="text-sm font-semibold text-textPrimary">No active routine</p>
                <p className="text-xs text-textSecondary mt-1">Activate one below or create a new one.</p>
              </div>
            )}
          </section>

          {/* All routines */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-textSecondary uppercase tracking-wide">All routines</p>
              <button
                onClick={() => setMode('create')}
                className="flex items-center gap-1 text-xs font-semibold text-teal-600 bg-teal-50 border border-teal-200 px-2.5 py-1 rounded-lg active:bg-teal-100"
              >
                <Plus size={12} /> New routine
              </button>
            </div>

            {routines.length === 0 ? (
              <p className="text-sm text-textSecondary py-4 text-center">No routines yet — create one above.</p>
            ) : (
              <div className="space-y-2">
                {inactive.map(r => (
                  <RoutineCard
                    key={r.id}
                    routine={r}
                    isActive={false}
                    acting={acting}
                    onEdit={() => { setEditTarget(r); setMode('edit') }}
                    onActivate={() => handleActivate(r)}
                    onDelete={() => handleDelete(r)}
                  />
                ))}
                {inactive.length === 0 && active && (
                  <p className="text-xs text-textSecondary text-center py-2">Only one routine — create more to switch between them.</p>
                )}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}

function RoutineCard({ routine, isActive, acting, onEdit, onActivate, onDeactivate, onDelete }) {
  const [expanded, setExpanded] = useState(false)
  const blockCount = (routine.sections || []).flatMap(s => s.blocks || []).length
  const reqCount   = (routine.sections || []).flatMap(s => s.blocks || []).filter(b => b.type === 'mandatory').length
  const isActing   = acting === routine.id || (isActive && acting === 'deactivate')

  return (
    <div className={`bg-white rounded-xl border overflow-hidden ${isActive ? 'border-teal-300' : 'border-border'}`}>
      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-1">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-semibold text-textPrimary truncate">
                {routine.name || 'Unnamed routine'}
              </p>
              {isActive && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-teal-100 text-teal-600">
                  Active
                </span>
              )}
            </div>
            <p className="text-xs text-textSecondary mt-0.5">
              {blockCount} blocks · {reqCount} required
              {routine.syncDiet ? ' · 🔗 Diet sync' : ''}
              {' · '}{fmtDate(routine.createdAt)}
            </p>
          </div>
        </div>

        {routine.tags?.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {routine.tags.map(t => (
              <span key={t} className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-teal-50 text-teal-600">{t}</span>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 mt-3">
          {isActive ? (
            <>
              <button
                onClick={onEdit}
                className="flex items-center gap-1 text-xs font-medium border border-border text-textSecondary px-2.5 py-1.5 rounded-lg active:bg-bg"
              >
                <Pencil size={11} /> Edit
              </button>
              <button
                onClick={onDeactivate}
                disabled={isActing}
                className="flex items-center gap-1 text-xs font-medium border border-border text-textSecondary px-2.5 py-1.5 rounded-lg active:bg-bg disabled:opacity-50"
              >
                {isActing ? <Loader2 size={11} className="animate-spin" /> : <Circle size={11} />}
                Deactivate
              </button>
            </>
          ) : (
            <>
              <button
                onClick={onActivate}
                disabled={isActing}
                className="flex items-center gap-1.5 text-xs font-semibold bg-teal-500 text-white px-3 py-1.5 rounded-lg active:bg-teal-600 disabled:opacity-50"
              >
                {isActing ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle2 size={11} />}
                Set active
              </button>
              <button
                onClick={onEdit}
                className="flex items-center gap-1 text-xs font-medium border border-border text-textSecondary px-2.5 py-1.5 rounded-lg active:bg-bg"
              >
                <Pencil size={11} /> Edit
              </button>
              <button
                onClick={onDelete}
                className="ml-auto p-1.5 text-textSecondary active:text-red-500"
              >
                <Trash2 size={15} />
              </button>
            </>
          )}

          {routine.changelog?.length > 0 && (
            <button
              onClick={() => setExpanded(e => !e)}
              className="ml-auto flex items-center gap-0.5 text-xs text-textSecondary"
            >
              <History size={12} />
              {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
          )}
        </div>
      </div>

      {expanded && routine.changelog?.length > 0 && (
        <div className="border-t border-border px-4 py-3 bg-bg space-y-2">
          <p className="text-[10px] font-semibold text-textSecondary uppercase tracking-wide">Change history</p>
          {routine.changelog.map((entry, i) => (
            <div key={i} className="flex gap-2">
              <Clock size={11} className="text-textSecondary shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-xs text-textPrimary">{entry.summary}</p>
                <p className="text-[10px] text-textSecondary">{fmtDateTime(entry.timestamp)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Plans tab ─────────────────────────────────────────────────────────────────

function PlansTab() {
  const { user } = useAuth()
  const [plans, setPlans]       = useState([])
  const [mealSlots, setMealSlots] = useState([])
  const [userProfile, setUserProfile] = useState(null)
  const [loading, setLoading]   = useState(true)
  const [viewingPlan, setViewingPlan] = useState(null)
  const [acting, setActing]     = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [all, profile] = await Promise.all([
      getAllMealPlans(user.id),
      getProfile(user.id),
    ])
    setPlans(all)
    setMealSlots(normalizeMealSlots(profile?.meal_slots))
    setUserProfile(profile)
    setLoading(false)
  }, [user])

  useEffect(() => { load() }, [load])

  async function handleActivate(plan) {
    setActing(plan.id)
    try {
      await activateMealPlan(user.id, plan.id)
      await load()
    } finally { setActing(null) }
  }

  async function handleDeactivate() {
    setActing('deactivate')
    try {
      await deactivateMealPlan(user.id)
      await load()
    } finally { setActing(null) }
  }

  async function handleDelete(plan) {
    const label = plan.name || `Plan from ${fmtDate(plan.created_at)}`
    if (!confirm(`Delete "${label}"? This cannot be undone.`)) return
    setActing(plan.id)
    try {
      await deleteMealPlan(user.id, plan.id)
      await load()
    } finally { setActing(null) }
  }

  const active   = plans.find(p => p.is_active) || null
  const inactive = plans.filter(p => !p.is_active)

  return (
    <>
      <div className="flex-1 px-4 py-4 space-y-4 overflow-y-auto pb-6">
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 size={20} className="animate-spin text-teal-500" />
          </div>
        ) : (
          <>
            {/* Active plan */}
            <section>
              <p className="text-xs font-semibold text-textSecondary uppercase tracking-wide mb-2">Active meal plan</p>
              {active ? (
                <PlanCard
                  plan={active}
                  isActive
                  acting={acting}
                  onView={() => setViewingPlan(active)}
                  onDeactivate={handleDeactivate}
                  onDelete={() => handleDelete(active)}
                />
              ) : (
                <div className="bg-white rounded-xl border border-border p-5 text-center">
                  <Circle size={28} className="text-border mx-auto mb-2" />
                  <p className="text-sm font-semibold text-textPrimary">No active meal plan</p>
                  <p className="text-xs text-textSecondary mt-1">Activate one below or generate a new plan in the Diet tab.</p>
                </div>
              )}
            </section>

            {/* All plans */}
            <section>
              <p className="text-xs font-semibold text-textSecondary uppercase tracking-wide mb-2">All meal plans</p>
              {plans.length === 0 ? (
                <p className="text-sm text-textSecondary py-4 text-center">No plans yet. Generate one in the Diet tab.</p>
              ) : (
                <div className="space-y-2">
                  {inactive.map(p => (
                    <PlanCard
                      key={p.id}
                      plan={p}
                      isActive={false}
                      acting={acting}
                      onView={() => setViewingPlan(p)}
                      onActivate={() => handleActivate(p)}
                      onDelete={() => handleDelete(p)}
                    />
                  ))}
                  {inactive.length === 0 && active && (
                    <p className="text-xs text-textSecondary text-center py-2">Only one plan — generate more in the Diet tab.</p>
                  )}
                </div>
              )}
            </section>
          </>
        )}
      </div>

      {viewingPlan && (
        <WeekPlanViewer
          plan={viewingPlan.plan}
          planId={viewingPlan.id}
          planName={viewingPlan.name || ''}
          planTags={viewingPlan.tags || []}
          targets={viewingPlan.targets}
          mealSlots={mealSlots}
          planCreatedAt={viewingPlan.created_at}
          profile={userProfile}
          userId={user.id}
          mode={viewingPlan.is_active ? 'edit' : 'history'}
          onClose={() => { setViewingPlan(null); load() }}
          onPlanUpdate={updatedPlan => {
            setViewingPlan(prev => ({ ...prev, plan: updatedPlan }))
            load()
          }}
          onNewPlanCreated={() => { setViewingPlan(null); load() }}
        />
      )}
    </>
  )
}

function PlanCard({ plan, isActive, acting, onView, onActivate, onDeactivate, onDelete }) {
  const [expanded, setExpanded] = useState(false)
  const isActing = acting === plan.id || (isActive && acting === 'deactivate')
  const label    = plan.name || `Plan · ${fmtDate(plan.created_at)}`

  return (
    <div className={`bg-white rounded-xl border overflow-hidden ${isActive ? 'border-teal-300' : 'border-border'}`}>
      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-1">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-semibold text-textPrimary truncate">{label}</p>
              {isActive && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-teal-100 text-teal-600">
                  Active
                </span>
              )}
            </div>
            <p className="text-xs text-textSecondary mt-0.5">Created {fmtDate(plan.created_at)}</p>
          </div>
        </div>

        {plan.tags?.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {plan.tags.map(t => (
              <span key={t} className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-teal-50 text-teal-600">{t}</span>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 mt-3">
          <button
            onClick={onView}
            className="flex items-center gap-1 text-xs font-medium border border-border text-textSecondary px-2.5 py-1.5 rounded-lg active:bg-bg"
          >
            <CalendarDays size={11} /> View plan
          </button>

          {isActive ? (
            <button
              onClick={onDeactivate}
              disabled={isActing}
              className="flex items-center gap-1 text-xs font-medium border border-border text-textSecondary px-2.5 py-1.5 rounded-lg active:bg-bg disabled:opacity-50"
            >
              {isActing ? <Loader2 size={11} className="animate-spin" /> : <Circle size={11} />}
              Deactivate
            </button>
          ) : (
            <>
              <button
                onClick={onActivate}
                disabled={isActing}
                className="flex items-center gap-1.5 text-xs font-semibold bg-teal-500 text-white px-3 py-1.5 rounded-lg active:bg-teal-600 disabled:opacity-50"
              >
                {isActing ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle2 size={11} />}
                Set active
              </button>
              <button
                onClick={onDelete}
                className="ml-auto p-1.5 text-textSecondary active:text-red-500"
              >
                <Trash2 size={15} />
              </button>
            </>
          )}

          {plan.changelog?.length > 0 && (
            <button
              onClick={() => setExpanded(e => !e)}
              className="ml-auto flex items-center gap-0.5 text-xs text-textSecondary"
            >
              <History size={12} />
              {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
          )}
        </div>
      </div>

      {expanded && plan.changelog?.length > 0 && (
        <div className="border-t border-border px-4 py-3 bg-bg space-y-2">
          <p className="text-[10px] font-semibold text-textSecondary uppercase tracking-wide">Change history</p>
          {plan.changelog.map((entry, i) => (
            <div key={i} className="flex gap-2">
              <Clock size={11} className="text-textSecondary shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-xs text-textPrimary">{entry.summary}</p>
                <p className="text-[10px] text-textSecondary">{fmtDateTime(entry.timestamp)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Meals tab ─────────────────────────────────────────────────────────────────

const EMPTY_NUTRITION = { calories: '', protein: '', carbs: '', fat: '', fibre: '' }

function MealsTab() {
  const { user } = useAuth()
  const [meals, setMeals]         = useState([])
  const [loading, setLoading]     = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editTarget, setEditTarget] = useState(null)
  const [saving, setSaving]       = useState(false)
  const [deleting, setDeleting]   = useState(null)

  // Form fields
  const [formName, setFormName]         = useState('')
  const [formDesc, setFormDesc]         = useState('')
  const [formRecipe, setFormRecipe]     = useState('')
  const [formNutrition, setFormNutrition] = useState(EMPTY_NUTRITION)

  const load = useCallback(async () => {
    setLoading(true)
    try { setMeals(await getCustomMeals(user.id)) } finally { setLoading(false) }
  }, [user])

  useEffect(() => { load() }, [load])

  function openAdd() {
    setEditTarget(null)
    setFormName(''); setFormDesc(''); setFormRecipe('')
    setFormNutrition(EMPTY_NUTRITION)
    setModalOpen(true)
  }

  function openEdit(meal) {
    setEditTarget(meal)
    setFormName(meal.meal_name || '')
    setFormDesc(meal.source_description || '')
    setFormRecipe(meal.recipe || '')
    setFormNutrition({
      calories: meal.nutrition?.calories ?? '',
      protein:  meal.nutrition?.protein  ?? '',
      carbs:    meal.nutrition?.carbs    ?? '',
      fat:      meal.nutrition?.fat      ?? '',
      fibre:    meal.nutrition?.fibre    ?? '',
    })
    setModalOpen(true)
  }

  async function handleSave() {
    if (!formName.trim()) return
    setSaving(true)
    try {
      const nutrition = Object.fromEntries(
        Object.entries(formNutrition).map(([k, v]) => [k, v !== '' ? Number(v) : null])
      )
      const data = {
        meal_name:          formName.trim(),
        source_description: formDesc.trim() || null,
        recipe:             formRecipe.trim() || null,
        nutrition,
      }
      if (editTarget) {
        await updateCustomMeal(editTarget.id, data)
      } else {
        await saveCustomMeal(user.id, data)
      }
      setModalOpen(false)
      await load()
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(meal) {
    if (!confirm(`Delete "${meal.meal_name}"?`)) return
    setDeleting(meal.id)
    try {
      await deleteCustomMeal(user.id, meal.id)
      setMeals(ms => ms.filter(m => m.id !== meal.id))
    } finally {
      setDeleting(null)
    }
  }

  return (
    <>
      <div className="flex-1 px-4 py-4 space-y-3 overflow-y-auto pb-6">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-textSecondary uppercase tracking-wide">Custom meals</p>
          <button
            onClick={openAdd}
            className="flex items-center gap-1 text-xs font-semibold text-teal-600 bg-teal-50 border border-teal-200 px-2.5 py-1 rounded-lg active:bg-teal-100"
          >
            <Plus size={12} /> Add meal
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 size={20} className="animate-spin text-teal-500" />
          </div>
        ) : meals.length === 0 ? (
          <div className="bg-white rounded-xl border border-border p-6 text-center">
            <UtensilsCrossed size={28} className="text-border mx-auto mb-2" />
            <p className="text-sm font-semibold text-textPrimary">No saved meals yet</p>
            <p className="text-xs text-textSecondary mt-1">Meals you save here can be picked when logging or editing your meal plan.</p>
            <button
              onClick={openAdd}
              className="mt-4 bg-teal-500 text-white text-sm font-semibold px-4 py-2 rounded-xl active:bg-teal-600"
            >
              Add your first meal
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {meals.map(meal => (
              <div key={meal.id} className="bg-white rounded-xl border border-border p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-textPrimary truncate">{meal.meal_name}</p>
                    {meal.nutrition?.calories != null && (
                      <p className="text-xs text-teal-600 font-medium mt-0.5">
                        {meal.nutrition.calories} kcal
                        {meal.nutrition.protein != null && ` · ${meal.nutrition.protein}g P`}
                        {meal.nutrition.carbs   != null && ` · ${meal.nutrition.carbs}g C`}
                        {meal.nutrition.fat     != null && ` · ${meal.nutrition.fat}g F`}
                      </p>
                    )}
                    {meal.source_description && (
                      <p className="text-xs text-textSecondary mt-0.5 line-clamp-2">{meal.source_description}</p>
                    )}
                    {meal.recipe && (
                      <p className="text-xs text-textSecondary mt-0.5 italic line-clamp-1">{meal.recipe}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => openEdit(meal)}
                      className="p-1.5 text-textSecondary active:text-teal-500 border border-border rounded-lg"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => handleDelete(meal)}
                      disabled={deleting === meal.id}
                      className="p-1.5 text-textSecondary active:text-red-500 border border-border rounded-lg disabled:opacity-40"
                    >
                      {deleting === meal.id
                        ? <Loader2 size={13} className="animate-spin" />
                        : <Trash2 size={13} />}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add / Edit modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editTarget ? 'Edit meal' : 'Add meal'}>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-textSecondary block mb-1">Meal name *</label>
            <input
              className="w-full border border-border rounded-lg px-3 py-2 text-sm text-textPrimary focus:outline-none focus:border-teal-500"
              placeholder="e.g. Chicken Quinoa Bowl"
              value={formName}
              onChange={e => setFormName(e.target.value)}
              autoFocus
            />
          </div>
          <div>
            <label className="text-xs font-medium text-textSecondary block mb-1">Description / notes</label>
            <textarea
              className="w-full border border-border rounded-lg px-3 py-2 text-sm text-textPrimary focus:outline-none focus:border-teal-500 resize-none"
              rows={2}
              placeholder="e.g. 200g chicken, 100g quinoa, mixed veg"
              value={formDesc}
              onChange={e => setFormDesc(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-textSecondary block mb-1">Recipe / instructions (optional)</label>
            <textarea
              className="w-full border border-border rounded-lg px-3 py-2 text-sm text-textPrimary focus:outline-none focus:border-teal-500 resize-none"
              rows={2}
              placeholder="How to make it…"
              value={formRecipe}
              onChange={e => setFormRecipe(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-textSecondary block mb-2">Nutrition (optional)</label>
            <div className="grid grid-cols-5 gap-1.5">
              {[
                { key: 'calories', label: 'kcal',   color: 'text-teal-600' },
                { key: 'protein',  label: 'P (g)',  color: 'text-blue-500' },
                { key: 'carbs',    label: 'C (g)',  color: 'text-orange-400' },
                { key: 'fat',      label: 'F (g)',  color: 'text-textSecondary' },
                { key: 'fibre',    label: 'Fi (g)', color: 'text-green-600' },
              ].map(({ key, label, color }) => (
                <div key={key} className="text-center">
                  <input
                    type="number"
                    className={`w-full border border-border rounded-lg px-1 py-2 text-sm font-bold text-center focus:outline-none focus:border-teal-500 ${color}`}
                    value={formNutrition[key]}
                    onChange={e => setFormNutrition(n => ({ ...n, [key]: e.target.value }))}
                    placeholder="—"
                  />
                  <p className="text-[9px] text-textSecondary mt-0.5">{label}</p>
                </div>
              ))}
            </div>
          </div>
          <button
            onClick={handleSave}
            disabled={!formName.trim() || saving}
            className="w-full bg-teal-500 text-white font-semibold py-3 rounded-xl disabled:opacity-40 active:bg-teal-600 flex items-center justify-center gap-2"
          >
            {saving
              ? <Loader2 size={16} className="animate-spin" />
              : editTarget ? 'Save changes' : 'Add meal'}
          </button>
        </div>
      </Modal>
    </>
  )
}
