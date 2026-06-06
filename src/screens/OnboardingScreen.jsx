import { useState } from 'react'
import { Loader2, Zap, ClipboardList, ChevronRight, Plus, Trash2, GripVertical } from 'lucide-react'
import { generateMealPlanWithLLM } from '../lib/mealRecommendation'
import { upsertProfile } from '../lib/db'
import { useAuth } from '../contexts/AuthContext'
import { DEFAULT_MEAL_SLOTS, uid } from '../lib/utils'

const EXERCISE_OPTIONS = [
  { value: 'sedentary',           label: 'Sedentary',           desc: 'Little or no exercise' },
  { value: 'lightly active',      label: 'Lightly active',      desc: '1–3 days/week' },
  { value: 'moderately active',   label: 'Moderately active',   desc: '3–5 days/week' },
  { value: 'very active',         label: 'Very active',         desc: '6–7 days/week' },
  { value: 'extra active',        label: 'Extra active',        desc: 'Physical job + training' },
]

const SEX_OPTIONS = ['Male', 'Female', 'Other']

// Common preset slots shown in the "Add" picker
const PRESET_SLOTS = [
  { key: 'breakfast',   label: 'Breakfast',         time: '07:45' },
  { key: 'midMorning',  label: 'Mid-morning snack', time: '10:00' },
  { key: 'lunch',       label: 'Lunch',             time: '13:00' },
  { key: 'preWorkout',  label: 'Pre-workout',        time: '17:00' },
  { key: 'postWorkout', label: 'Post-workout',       time: '18:30' },
  { key: 'dinner',      label: 'Dinner',             time: '20:00' },
  { key: 'beforeBed',   label: 'Before bed',         time: '22:00' },
]

export default function OnboardingScreen({ onPlanGenerated }) {
  const { user } = useAuth()
  const [step, setStep]   = useState('welcome')
  const [error, setError] = useState('')
  const [form, setForm]   = useState({
    age: '', sex: 'Male', height: '', weight: '',
    allergies: '', exerciseFrequency: 'moderately active',
    // Start with all 7 default slots — user can remove/edit/add freely
    slots: DEFAULT_MEAL_SLOTS.map(s => ({ key: s.key, label: s.label, time: s.time })),
  })
  const [addPickerOpen, setAddPickerOpen] = useState(false)

  function set(key, val) { setForm(f => ({ ...f, [key]: val })) }

  // ── Slot helpers ──────────────────────────────────────────────────────────────
  function updateSlot(key, field, val) {
    setForm(f => ({ ...f, slots: f.slots.map(s => s.key === key ? { ...s, [field]: val } : s) }))
  }

  function removeSlot(key) {
    setForm(f => ({ ...f, slots: f.slots.filter(s => s.key !== key) }))
  }

  function addPreset(preset) {
    // Don't duplicate keys
    if (form.slots.some(s => s.key === preset.key)) return
    setForm(f => ({
      ...f,
      slots: [...f.slots, { key: preset.key, label: preset.label, time: preset.time }]
        .sort((a, b) => a.time.localeCompare(b.time)),
    }))
    setAddPickerOpen(false)
  }

  function addCustomSlot() {
    const newKey = `custom_${uid()}`
    setForm(f => ({
      ...f,
      slots: [...f.slots, { key: newKey, label: '', time: '12:00', custom: true }],
    }))
    setAddPickerOpen(false)
  }

  // ── Submissions ───────────────────────────────────────────────────────────────
  async function handleQuickStart() {
    setStep('generating')
    setError('')
    try {
      const profile = { sex: 'Male', age: '25', height: '175', weight: '75', exerciseFrequency: 'moderately active', allergies: '' }
      const slots   = DEFAULT_MEAL_SLOTS.map(s => ({ key: s.key, label: s.label, time: s.time }))
      const result  = await generateMealPlanWithLLM(profile, { slots })
      await upsertProfile(user.id, {
        onboarding_complete: true, plan_accepted: false,
        exercise_frequency: profile.exerciseFrequency,
        meal_slots: slots,
        targets: result.targets,
      })
      onPlanGenerated({ ...result, profile: { ...profile, slots } })
    } catch (err) {
      setError(err.message)
      setStep('welcome')
    }
  }

  async function handleSurveySubmit(e) {
    e.preventDefault()
    if (!form.age || !form.height || !form.weight) { setError('Please fill in age, height and weight.'); return }
    if (form.slots.length === 0) { setError('Please add at least one meal slot.'); return }
    if (form.slots.some(s => !s.label.trim())) { setError('Please name every meal slot.'); return }
    setStep('generating')
    setError('')
    try {
      // Sort slots by time before generating
      const slots = [...form.slots].sort((a, b) => a.time.localeCompare(b.time))
      const result = await generateMealPlanWithLLM(form, { slots })
      await upsertProfile(user.id, {
        onboarding_complete: true, plan_accepted: false,
        age: form.age, sex: form.sex, height: form.height, weight: form.weight,
        allergies: form.allergies,
        exercise_frequency: form.exerciseFrequency,
        meal_slots: slots,
        targets: result.targets,
      })
      onPlanGenerated({ ...result, profile: { ...form, slots } })
    } catch (err) {
      setError(err.message)
      setStep('survey')
    }
  }

  // Sorted by time for display
  const sortedSlots = [...form.slots].sort((a, b) => a.time.localeCompare(b.time))
  const usedKeys    = new Set(form.slots.map(s => s.key))
  const availablePresets = PRESET_SLOTS.filter(p => !usedKeys.has(p.key))

  // ── Welcome ───────────────────────────────────────────────────────────────────
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
          <button onClick={() => setStep('survey')}
            className="w-full bg-white border border-border rounded-2xl p-4 text-left flex items-center gap-4 active:bg-bg hover:border-teal-300 transition-colors"
          >
            <div className="w-11 h-11 bg-teal-50 rounded-xl flex items-center justify-center shrink-0">
              <ClipboardList size={22} className="text-teal-500" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-textPrimary">Personalised plan</p>
              <p className="text-xs text-textSecondary mt-0.5">Customise your meals &amp; schedule — AI builds a plan just for you</p>
            </div>
            <ChevronRight size={18} className="text-textSecondary shrink-0" />
          </button>

          <button onClick={handleQuickStart}
            className="w-full bg-white border border-border rounded-2xl p-4 text-left flex items-center gap-4 active:bg-bg hover:border-teal-300 transition-colors"
          >
            <div className="w-11 h-11 bg-orange-50 rounded-xl flex items-center justify-center shrink-0">
              <Zap size={22} className="text-orange-400" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-textPrimary">Quick start</p>
              <p className="text-xs text-textSecondary mt-0.5">7 default meal slots, sensible plan immediately</p>
            </div>
            <ChevronRight size={18} className="text-textSecondary shrink-0" />
          </button>
        </div>
      </div>
    </div>
  )

  // ── Survey ────────────────────────────────────────────────────────────────────
  if (step === 'survey') return (
    <div className="min-h-screen min-h-dvh bg-bg overflow-y-auto">
      <div className="w-full max-w-[390px] mx-auto px-4 pt-12 pb-8">
        <button onClick={() => setStep('welcome')} className="text-sm text-textSecondary mb-6 flex items-center gap-1">
          ← Back
        </button>
        <h1 className="text-xl font-bold text-textPrimary mb-1">Tell us about yourself</h1>
        <p className="text-sm text-textSecondary mb-6">Used to calculate your calorie &amp; macro targets</p>

        {error && (
          <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 mb-4">
            <p className="text-xs text-red-600">{error}</p>
          </div>
        )}

        <form onSubmit={handleSurveySubmit} className="space-y-4">
          <Field label="Age">
            <input type="number" inputMode="numeric" placeholder="e.g. 25"
              value={form.age} onChange={e => set('age', e.target.value)} className={inputCls} />
          </Field>

          <Field label="Sex">
            <div className="flex gap-2">
              {SEX_OPTIONS.map(s => (
                <button key={s} type="button" onClick={() => set('sex', s)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    form.sex === s ? 'bg-teal-500 text-white border-teal-500' : 'bg-white text-textSecondary border-border'
                  }`}
                >{s}</button>
              ))}
            </div>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Height (cm)">
              <input type="number" inputMode="numeric" placeholder="e.g. 175"
                value={form.height} onChange={e => set('height', e.target.value)} className={inputCls} />
            </Field>
            <Field label="Weight (kg)">
              <input type="number" inputMode="decimal" placeholder="e.g. 72"
                value={form.weight} onChange={e => set('weight', e.target.value)} className={inputCls} />
            </Field>
          </div>

          <Field label="Exercise frequency">
            <div className="space-y-2">
              {EXERCISE_OPTIONS.map(opt => (
                <button key={opt.value} type="button" onClick={() => set('exerciseFrequency', opt.value)}
                  className={`w-full text-left px-3 py-2.5 rounded-xl border text-sm transition-colors ${
                    form.exerciseFrequency === opt.value ? 'border-teal-500 bg-teal-50' : 'border-border bg-white'
                  }`}
                >
                  <span className={`font-medium ${form.exerciseFrequency === opt.value ? 'text-teal-600' : 'text-textPrimary'}`}>{opt.label}</span>
                  <span className="text-textSecondary text-xs ml-2">{opt.desc}</span>
                </button>
              ))}
            </div>
          </Field>

          <Field label="Allergies / restrictions" optional>
            <input type="text" placeholder="e.g. nuts, dairy, gluten"
              value={form.allergies} onChange={e => set('allergies', e.target.value)} className={inputCls} />
            <p className="text-[11px] text-textSecondary mt-1">Comma-separated. Leave blank if none.</p>
          </Field>

          {/* ── Meal slots ── */}
          <Field label={`Meal slots · ${form.slots.length}`}>
            <p className="text-[11px] text-textSecondary mb-2">
              Add, remove or rename any meal. Sorted by time. Calories are distributed across all slots.
            </p>

            <div className="space-y-2">
              {sortedSlots.map(slot => (
                <div key={slot.key} className="flex items-center gap-2 bg-white rounded-xl border border-border p-2">
                  <div className="flex-1 grid grid-cols-[1fr_90px] gap-2">
                    <input
                      className="border border-border rounded-lg px-2.5 py-2 text-sm text-textPrimary focus:outline-none focus:border-teal-500 bg-white"
                      value={slot.label}
                      onChange={e => updateSlot(slot.key, 'label', e.target.value)}
                      placeholder="Meal name"
                    />
                    <input
                      type="time"
                      className="border border-border rounded-lg px-2 py-2 text-sm text-textPrimary focus:outline-none focus:border-teal-500 bg-white"
                      value={slot.time}
                      onChange={e => updateSlot(slot.key, 'time', e.target.value)}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeSlot(slot.key)}
                    className="shrink-0 p-1.5 text-textSecondary hover:text-red-500 active:text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>

            {/* Add slot */}
            <div className="relative mt-2">
              <button
                type="button"
                onClick={() => setAddPickerOpen(o => !o)}
                className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-dashed border-border text-xs text-textSecondary hover:border-teal-400 hover:text-teal-500 transition-colors"
              >
                <Plus size={13} /> Add meal slot
              </button>

              {addPickerOpen && (
                <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-border rounded-xl shadow-lg overflow-hidden">
                  <p className="text-[10px] font-semibold text-textSecondary uppercase tracking-wide px-3 pt-2.5 pb-1">
                    Quick add
                  </p>
                  {availablePresets.map(p => (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => addPreset(p)}
                      className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-bg text-left"
                    >
                      <span className="text-textPrimary font-medium">{p.label}</span>
                      <span className="text-textSecondary text-xs">{p.time}</span>
                    </button>
                  ))}
                  {availablePresets.length > 0 && <div className="border-t border-border mx-3" />}
                  <button
                    type="button"
                    onClick={addCustomSlot}
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-teal-600 font-medium hover:bg-teal-50"
                  >
                    <Plus size={13} /> Custom slot…
                  </button>
                </div>
              )}
            </div>
          </Field>

          <button type="submit"
            className="w-full bg-teal-500 text-white font-semibold py-3.5 rounded-xl mt-2 active:bg-teal-600"
          >
            Generate my plan →
          </button>
        </form>
      </div>
    </div>
  )

  // ── Generating ────────────────────────────────────────────────────────────────
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
