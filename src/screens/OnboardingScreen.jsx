import { useState } from 'react'
import { Loader2, Zap, ClipboardList, ChevronRight, Lock } from 'lucide-react'
import { generateMealPlanWithLLM, estimateTargets, OPTIONAL_SLOTS } from '../lib/mealRecommendation'
import { upsertProfile } from '../lib/db'
import { useAuth } from '../contexts/AuthContext'

const EXERCISE_OPTIONS = [
  { value: 'sedentary',           label: 'Sedentary',           desc: 'Little or no exercise' },
  { value: 'lightly active',      label: 'Lightly active',      desc: '1–3 days/week' },
  { value: 'moderately active',   label: 'Moderately active',   desc: '3–5 days/week' },
  { value: 'very active',         label: 'Very active',         desc: '6–7 days/week' },
  { value: 'extra active',        label: 'Extra active',        desc: 'Physical job + training' },
]

const SEX_OPTIONS = ['Male', 'Female', 'Other']

const OPTIONAL_SLOT_LABELS = {
  midMorning:  { label: 'Mid-morning snack', desc: 'A light bite between breakfast & lunch' },
  preWorkout:  { label: 'Pre-workout',        desc: 'Quick fuel before training' },
  postWorkout: { label: 'Post-workout',       desc: 'Recovery meal after training' },
  beforeBed:   { label: 'Before bed',         desc: 'Slow-digesting protein snack' },
}

const DEFAULT_ENABLED_SLOTS = ['midMorning', 'preWorkout', 'postWorkout', 'beforeBed']

export default function OnboardingScreen({ onPlanGenerated }) {
  const { user } = useAuth()
  const [step, setStep]     = useState('welcome') // welcome | survey | generating
  const [error, setError]   = useState('')
  const [form, setForm]     = useState({
    age: '', sex: 'Male', height: '', weight: '',
    allergies: '', exerciseFrequency: 'moderately active',
    enabledSlots: DEFAULT_ENABLED_SLOTS,
  })

  function set(key, val) { setForm(f => ({ ...f, [key]: val })) }

  function toggleSlot(slot) {
    setForm(f => ({
      ...f,
      enabledSlots: f.enabledSlots.includes(slot)
        ? f.enabledSlots.filter(s => s !== slot)
        : [...f.enabledSlots, slot],
    }))
  }

  async function handleQuickStart() {
    setStep('generating')
    setError('')
    try {
      // Use minimal profile for quick start
      const profile = { sex: 'Male', age: '25', height: '175', weight: '75', exerciseFrequency: 'moderately active', allergies: '' }
      const result  = await generateMealPlanWithLLM(profile)
      await upsertProfile(user.id, { onboarding_complete: true, plan_accepted: false, exercise_frequency: profile.exerciseFrequency, targets: result.targets })
      onPlanGenerated({ ...result, profile })
    } catch (err) {
      setError(err.message)
      setStep('welcome')
    }
  }

  async function handleSurveySubmit(e) {
    e.preventDefault()
    if (!form.age || !form.height || !form.weight) { setError('Please fill in age, height and weight.'); return }
    setStep('generating')
    setError('')
    try {
      const result = await generateMealPlanWithLLM(form, { enabledSlots: form.enabledSlots })
      await upsertProfile(user.id, {
        onboarding_complete: true,
        plan_accepted: false,
        age: form.age,
        sex: form.sex,
        height: form.height,
        weight: form.weight,
        allergies: form.allergies,
        exercise_frequency: form.exerciseFrequency,
        meal_slots: form.enabledSlots,
        targets: result.targets,
      })
      onPlanGenerated({ ...result, profile: form })
    } catch (err) {
      setError(err.message)
      setStep('survey')
    }
  }

  // ── Welcome ─────────────────────────────────────────────────────────────────
  if (step === 'welcome') return (
    <div className="min-h-screen min-h-dvh bg-bg flex flex-col items-center justify-center px-5">
      <div className="w-full max-w-[360px]">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-teal-500 rounded-2xl mb-4">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 3h7v7H3z"/><path d="M14 3h7v7h-7z"/><path d="M3 14h7v7H3z"/>
              <path d="M17.5 14v7M14 17.5h7"/>
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-textPrimary">Welcome!</h1>
          <p className="text-sm text-textSecondary mt-1">Let's build your personalised meal plan</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 mb-4">
            <p className="text-xs text-red-600">{error}</p>
          </div>
        )}

        <div className="space-y-3">
          {/* Personalised */}
          <button
            onClick={() => setStep('survey')}
            className="w-full bg-white border border-border rounded-2xl p-4 text-left flex items-center gap-4 active:bg-bg hover:border-teal-300 transition-colors"
          >
            <div className="w-11 h-11 bg-teal-50 rounded-xl flex items-center justify-center shrink-0">
              <ClipboardList size={22} className="text-teal-500" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-textPrimary">Personalised plan</p>
              <p className="text-xs text-textSecondary mt-0.5">Answer 6 quick questions — AI builds a plan just for you</p>
            </div>
            <ChevronRight size={18} className="text-textSecondary shrink-0" />
          </button>

          {/* Quick start */}
          <button
            onClick={handleQuickStart}
            className="w-full bg-white border border-border rounded-2xl p-4 text-left flex items-center gap-4 active:bg-bg hover:border-teal-300 transition-colors"
          >
            <div className="w-11 h-11 bg-orange-50 rounded-xl flex items-center justify-center shrink-0">
              <Zap size={22} className="text-orange-400" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-textPrimary">Quick start</p>
              <p className="text-xs text-textSecondary mt-0.5">Get a sensible default plan immediately</p>
            </div>
            <ChevronRight size={18} className="text-textSecondary shrink-0" />
          </button>
        </div>
      </div>
    </div>
  )

  // ── Survey ───────────────────────────────────────────────────────────────────
  if (step === 'survey') return (
    <div className="min-h-screen min-h-dvh bg-bg overflow-y-auto">
      <div className="w-full max-w-[390px] mx-auto px-4 pt-12 pb-8">
        <button onClick={() => setStep('welcome')} className="text-sm text-textSecondary mb-6 flex items-center gap-1">
          ← Back
        </button>
        <h1 className="text-xl font-bold text-textPrimary mb-1">Tell us about yourself</h1>
        <p className="text-sm text-textSecondary mb-6">Used to calculate your calorie & macro targets</p>

        {error && (
          <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 mb-4">
            <p className="text-xs text-red-600">{error}</p>
          </div>
        )}

        <form onSubmit={handleSurveySubmit} className="space-y-4">
          {/* Age */}
          <Field label="Age">
            <input
              type="number" inputMode="numeric" placeholder="e.g. 25"
              value={form.age} onChange={e => set('age', e.target.value)}
              className={inputCls}
            />
          </Field>

          {/* Sex */}
          <Field label="Sex">
            <div className="flex gap-2">
              {SEX_OPTIONS.map(s => (
                <button key={s} type="button"
                  onClick={() => set('sex', s)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    form.sex === s
                      ? 'bg-teal-500 text-white border-teal-500'
                      : 'bg-white text-textSecondary border-border'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </Field>

          {/* Height + Weight */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Height (cm)">
              <input
                type="number" inputMode="numeric" placeholder="e.g. 175"
                value={form.height} onChange={e => set('height', e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label="Weight (kg)">
              <input
                type="number" inputMode="decimal" placeholder="e.g. 72"
                value={form.weight} onChange={e => set('weight', e.target.value)}
                className={inputCls}
              />
            </Field>
          </div>

          {/* Exercise frequency */}
          <Field label="Exercise frequency">
            <div className="space-y-2">
              {EXERCISE_OPTIONS.map(opt => (
                <button key={opt.value} type="button"
                  onClick={() => set('exerciseFrequency', opt.value)}
                  className={`w-full text-left px-3 py-2.5 rounded-xl border text-sm transition-colors ${
                    form.exerciseFrequency === opt.value
                      ? 'border-teal-500 bg-teal-50'
                      : 'border-border bg-white'
                  }`}
                >
                  <span className={`font-medium ${form.exerciseFrequency === opt.value ? 'text-teal-600' : 'text-textPrimary'}`}>
                    {opt.label}
                  </span>
                  <span className="text-textSecondary text-xs ml-2">{opt.desc}</span>
                </button>
              ))}
            </div>
          </Field>

          {/* Allergies */}
          <Field label="Allergies / restrictions" optional>
            <input
              type="text" placeholder="e.g. nuts, dairy, gluten"
              value={form.allergies} onChange={e => set('allergies', e.target.value)}
              className={inputCls}
            />
            <p className="text-[11px] text-textSecondary mt-1">Comma-separated. Leave blank if none.</p>
          </Field>

          {/* Meal slots */}
          <Field label="Meal slots">
            <div className="space-y-2">
              {/* Required — locked */}
              {[
                { label: 'Breakfast',  desc: 'Required' },
                { label: 'Lunch',      desc: 'Required' },
                { label: 'Dinner',     desc: 'Required' },
              ].map(({ label, desc }) => (
                <div key={label} className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-border bg-bg opacity-60">
                  <Lock size={14} className="text-textSecondary shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-textPrimary">{label}</p>
                    <p className="text-xs text-textSecondary">{desc}</p>
                  </div>
                </div>
              ))}
              {/* Optional — toggleable */}
              {OPTIONAL_SLOTS.map(slot => {
                const { label, desc } = OPTIONAL_SLOT_LABELS[slot]
                const enabled = form.enabledSlots.includes(slot)
                return (
                  <button key={slot} type="button"
                    onClick={() => toggleSlot(slot)}
                    className={`w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-xl border text-sm transition-colors ${
                      enabled ? 'border-teal-500 bg-teal-50' : 'border-border bg-white'
                    }`}
                  >
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                      enabled ? 'border-teal-500 bg-teal-500' : 'border-border bg-white'
                    }`}>
                      {enabled && <div className="w-2 h-2 rounded-full bg-white" />}
                    </div>
                    <div className="flex-1">
                      <p className={`font-medium text-sm ${enabled ? 'text-teal-700' : 'text-textPrimary'}`}>{label}</p>
                      <p className="text-xs text-textSecondary">{desc}</p>
                    </div>
                  </button>
                )
              })}
            </div>
            <p className="text-[11px] text-textSecondary mt-1.5">Toggle optional slots on or off — you can change this later.</p>
          </Field>

          <button
            type="submit"
            className="w-full bg-teal-500 text-white font-semibold py-3.5 rounded-xl mt-2 active:bg-teal-600"
          >
            Generate my plan →
          </button>
        </form>
      </div>
    </div>
  )

  // ── Generating ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen min-h-dvh bg-bg flex flex-col items-center justify-center px-5 text-center">
      <div className="w-11 h-11 border-2 border-teal-500 border-t-transparent rounded-full animate-spin mb-6" />
      <h2 className="text-lg font-bold text-textPrimary">Crafting your meal plan</h2>
      <p className="text-sm text-textSecondary mt-2 max-w-[260px]">
        AI is building a personalised 7-day plan for you. This takes about 15–30 seconds.
      </p>
    </div>
  )
}

const inputCls = 'w-full border border-border rounded-xl px-3 py-2.5 text-sm text-textPrimary focus:outline-none focus:border-teal-500 bg-white'

function Field({ label, optional, children }) {
  return (
    <div>
      <label className="text-xs font-semibold text-textSecondary uppercase tracking-wide block mb-1.5">
        {label} {optional && <span className="normal-case font-normal">(optional)</span>}
      </label>
      {children}
    </div>
  )
}
