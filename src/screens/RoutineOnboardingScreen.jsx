import { useState, useEffect } from 'react'
import { Plus, Trash2, Loader2, X, ArrowRight } from 'lucide-react'
import { uid } from '../lib/utils'
import { DEFAULT_SECTIONS } from '../lib/db'

// ── Section visual config ─────────────────────────────────────────────────────

const SECTION_STYLE = {
  sleep:     { border: 'border-indigo-200', headerBg: 'bg-indigo-50',  accent: 'text-indigo-600',    badge: 'bg-indigo-100 text-indigo-600'  },
  nutrition: { border: 'border-orange-200', headerBg: 'bg-orange-50',  accent: 'text-orange-500',    badge: 'bg-orange-100 text-orange-500'  },
  exercise:  { border: 'border-red-200',    headerBg: 'bg-red-50',     accent: 'text-red-500',       badge: 'bg-red-100 text-red-500'        },
  work:      { border: 'border-blue-200',   headerBg: 'bg-blue-50',    accent: 'text-blue-500',      badge: 'bg-blue-100 text-blue-500'      },
  hobbies:   { border: 'border-purple-200', headerBg: 'bg-purple-50',  accent: 'text-purple-500',    badge: 'bg-purple-100 text-purple-500'  },
  other:     { border: 'border-border',     headerBg: 'bg-gray-50',    accent: 'text-textSecondary', badge: 'bg-gray-100 text-textSecondary' },
}

// Quick-add presets per section
const SECTION_PRESETS = {
  sleep:    [{ id: 'nap', name: 'Afternoon nap', time: '14:00', type: 'optional' }],
  nutrition: [],
  exercise: [
    { id: 'stretching', name: 'Stretching',  time: '07:15', type: 'optional' },
    { id: 'walk',       name: 'Walk',        time: '17:00', type: 'optional' },
    { id: 'run',        name: 'Run',         time: '06:30', type: 'optional' },
  ],
  work: [
    { id: 'deep_work',  name: 'Deep work',   time: '10:00', type: 'optional' },
    { id: 'emails',     name: 'Emails',      time: '09:00', type: 'optional' },
    { id: 'study',      name: 'Study',       time: '08:30', type: 'optional' },
  ],
  hobbies: [
    { id: 'music',        name: 'Music',        time: '19:00', type: 'optional' },
    { id: 'side_project', name: 'Side project', time: '20:00', type: 'optional' },
  ],
  other: [
    { id: 'meditation', name: 'Meditation', time: '07:00', type: 'optional' },
    { id: 'journaling', name: 'Journaling', time: '22:00', type: 'optional' },
  ],
}

// ── Main component ────────────────────────────────────────────────────────────

export default function RoutineOnboardingScreen({
  existingSettings,
  mealSlots,
  onSave,
  onCancel,
  onGoToDiet,
}) {
  const isEditing = !!existingSettings

  const [sections, setSections]   = useState([])
  const [syncDiet, setSyncDiet]   = useState(false)
  const [routineName, setRoutineName] = useState('')
  const [tagInput, setTagInput]   = useState('')
  const [tags, setTags]           = useState([])
  const [openPickerId, setOpenPickerId] = useState(null)
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')

  useEffect(() => {
    if (existingSettings?.sections) {
      setSections(existingSettings.sections)
      setSyncDiet(existingSettings.syncDiet || false)
      setRoutineName(existingSettings.name || '')
      setTags(existingSettings.tags || [])
    } else {
      setSections(DEFAULT_SECTIONS.map(s => ({ ...s, blocks: [...(s.blocks || [])] })))
    }
  }, [existingSettings])

  // ── Section block helpers ─────────────────────────────────────────────────

  function updateSection(sectionId, updater) {
    setSections(ss => ss.map(s => s.id === sectionId ? updater(s) : s))
  }

  function updateBlock(sectionId, blockId, field, val) {
    updateSection(sectionId, s => ({
      ...s,
      blocks: s.blocks.map(b => b.id === blockId ? { ...b, [field]: val } : b),
    }))
  }

  function removeBlock(sectionId, blockId) {
    updateSection(sectionId, s => ({ ...s, blocks: s.blocks.filter(b => b.id !== blockId) }))
  }

  function addPreset(sectionId, preset) {
    updateSection(sectionId, s => ({
      ...s,
      blocks: [...s.blocks, { id: `${preset.id}_${uid()}`, name: preset.name, planned_time: preset.time, type: preset.type, enabled: true }]
        .sort((a, b) => a.planned_time.localeCompare(b.planned_time)),
    }))
    setOpenPickerId(null)
  }

  function addCustomBlock(sectionId) {
    updateSection(sectionId, s => ({
      ...s,
      blocks: [...s.blocks, { id: `custom_${uid()}`, name: '', planned_time: '12:00', type: 'optional', enabled: true, custom: true }],
    }))
    setOpenPickerId(null)
  }

  // ── Tags ──────────────────────────────────────────────────────────────────

  function commitTag() {
    const t = tagInput.trim().toLowerCase()
    if (t && !tags.includes(t)) setTags(ts => [...ts, t])
    setTagInput('')
  }

  // ── Save ──────────────────────────────────────────────────────────────────

  async function handleSave() {
    const allBlocks = sections.flatMap(s => s.blocks || [])
    if (allBlocks.some(b => !b.name.trim())) { setError('Please name every block.'); return }
    setSaving(true)
    setError('')
    try {
      const settings = {
        sections,
        syncDiet,
        dietBlockTimes: existingSettings?.dietBlockTimes || {},
        onboardingComplete: true,
        name: routineName.trim() || null,
        tags,
      }
      await onSave(settings)
    } catch (e) {
      setError(e.message)
      setSaving(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-bg overflow-y-auto" onClick={() => setOpenPickerId(null)}>
      <div className="w-full max-w-mobile mx-auto flex flex-col min-h-full">

        {/* Header */}
        <div className="bg-white border-b border-border px-4 pt-10 pb-4 flex items-center justify-between sticky top-0 z-10">
          <div>
            <h2 className="text-lg font-bold text-textPrimary">
              {isEditing ? 'Edit routine' : 'Build your routine'}
            </h2>
            <p className="text-xs text-textSecondary mt-0.5">
              Organise your day into focus areas
            </p>
          </div>
          {onCancel && (
            <button onClick={onCancel} className="p-2 text-textSecondary active:bg-bg rounded-lg">
              <X size={20} />
            </button>
          )}
        </div>

        <div className="px-4 py-5 space-y-3">

          {/* ── Section cards ── */}
          {sections.map(section => {
            const style   = SECTION_STYLE[section.id] || SECTION_STYLE.other
            const presets = SECTION_PRESETS[section.id] || []
            const usedIds = new Set(section.blocks.map(b => b.id))
            const availablePresets = presets.filter(p => !usedIds.has(p.id))
            const isNutritionSynced = section.id === 'nutrition' && syncDiet
            const sorted  = [...section.blocks].sort((a, b) => a.planned_time.localeCompare(b.planned_time))

            return (
              <div
                key={section.id}
                className={`rounded-2xl border ${style.border}`}
                onClick={e => e.stopPropagation()}
              >
                {/* Section header */}
                <div className={`flex items-center justify-between px-4 py-3 border-b ${style.border} ${style.headerBg} rounded-t-2xl`}>
                  <div className="flex items-center gap-2">
                    <span className="text-lg leading-none">{section.emoji}</span>
                    <span className={`text-sm font-bold ${style.accent}`}>{section.name}</span>
                    {!isNutritionSynced && section.blocks.length > 0 && (
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${style.badge}`}>
                        {section.blocks.length}
                      </span>
                    )}
                  </div>
                  {/* Nutrition sync toggle in header */}
                  {section.id === 'nutrition' && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-textSecondary">Sync diet</span>
                      <button
                        onClick={() => setSyncDiet(v => !v)}
                        className={`w-10 h-5 rounded-full relative transition-colors shrink-0 ${syncDiet ? 'bg-teal-500' : 'bg-gray-300'}`}
                      >
                        <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${syncDiet ? 'translate-x-5' : 'translate-x-0.5'}`} />
                      </button>
                    </div>
                  )}
                </div>

                {/* Section body */}
                <div className="bg-white px-4 py-3 rounded-b-2xl">
                  {isNutritionSynced ? (
                    /* Grayed-out synced state */
                    <div className="opacity-60 select-none">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-semibold text-textSecondary">Managed by meal plan</p>
                        {onGoToDiet && (
                          <button
                            onClick={onGoToDiet}
                            className="flex items-center gap-1 text-xs text-teal-600 font-semibold opacity-100 active:opacity-70"
                            style={{ opacity: 1 }}
                          >
                            Edit Diet <ArrowRight size={11} />
                          </button>
                        )}
                      </div>
                      {mealSlots?.length > 0 ? (
                        <div className="space-y-1.5">
                          {mealSlots.map(slot => (
                            <div key={slot.key} className="flex items-center justify-between py-1.5 border border-border rounded-lg px-3 bg-gray-50">
                              <span className="text-sm text-textSecondary">{slot.label}</span>
                              <span className="text-xs text-textSecondary tabular-nums">{slot.time}</span>
                            </div>
                          ))}
                          <p className="text-[10px] text-textSecondary mt-1">Edit meal slots in the Diet tab</p>
                        </div>
                      ) : (
                        <div className="py-3 text-center">
                          <p className="text-xs text-textSecondary">No meal plan set up yet.</p>
                          {onGoToDiet && (
                            <button onClick={onGoToDiet} className="text-xs text-teal-600 font-semibold mt-1 active:opacity-70">
                              Set up meal plan →
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    /* Normal block editing */
                    <>
                      {sorted.length === 0 && (
                        <p className="text-xs text-textSecondary mb-2">No blocks yet — add one below.</p>
                      )}
                      <div className="space-y-2 mb-2">
                        {sorted.map(block => (
                          <div key={block.id} className="flex items-center gap-2">
                            <div className="flex-1 grid grid-cols-[1fr_88px] gap-2">
                              <input
                                className="border border-border rounded-lg px-2.5 py-2 text-sm text-textPrimary focus:outline-none focus:border-teal-500 bg-white"
                                placeholder="Block name"
                                value={block.name}
                                onChange={e => updateBlock(section.id, block.id, 'name', e.target.value)}
                              />
                              <input
                                type="time"
                                className="border border-border rounded-lg px-2 py-2 text-sm text-textPrimary focus:outline-none focus:border-teal-500 bg-white"
                                value={block.planned_time}
                                onChange={e => updateBlock(section.id, block.id, 'planned_time', e.target.value)}
                              />
                            </div>
                            <button
                              onClick={() => updateBlock(section.id, block.id, 'type', block.type === 'mandatory' ? 'optional' : 'mandatory')}
                              className={`shrink-0 text-[10px] font-bold px-2 py-1.5 rounded-lg border transition-colors ${
                                block.type === 'mandatory'
                                  ? `${style.badge} border-transparent`
                                  : 'bg-white border-border text-textSecondary'
                              }`}
                            >
                              {block.type === 'mandatory' ? 'req' : 'opt'}
                            </button>
                            <button
                              onClick={() => removeBlock(section.id, block.id)}
                              className="shrink-0 p-1.5 text-textSecondary active:text-red-500 rounded-lg"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        ))}
                      </div>

                      {/* Add block */}
                      <div className="relative">
                        <button
                          onClick={() => setOpenPickerId(openPickerId === section.id ? null : section.id)}
                          className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border border-dashed border-border text-xs text-textSecondary active:border-teal-400 active:text-teal-500"
                        >
                          <Plus size={12} /> Add block
                        </button>

                        {openPickerId === section.id && (
                          <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-border rounded-xl shadow-lg overflow-hidden">
                            {availablePresets.length > 0 && (
                              <>
                                <p className="text-[10px] font-semibold text-textSecondary uppercase tracking-wide px-3 pt-2.5 pb-1">
                                  Quick add
                                </p>
                                {availablePresets.map(p => (
                                  <button
                                    key={p.id}
                                    onClick={() => addPreset(section.id, p)}
                                    className="w-full flex items-center justify-between px-3 py-2.5 text-sm active:bg-bg text-left"
                                  >
                                    <span className="text-textPrimary font-medium">{p.name}</span>
                                    <span className="text-textSecondary text-xs">{p.time}</span>
                                  </button>
                                ))}
                                <div className="border-t border-border mx-3" />
                              </>
                            )}
                            <button
                              onClick={() => addCustomBlock(section.id)}
                              className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-teal-600 font-medium active:bg-teal-50"
                            >
                              <Plus size={13} /> Custom block…
                            </button>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            )
          })}

          {/* ── Routine name & tags ── */}
          <div className="bg-white rounded-2xl border border-border p-4 space-y-3 mt-2">
            <p className="text-sm font-semibold text-textPrimary">Routine details</p>
            <div>
              <label className="text-xs text-textSecondary font-medium block mb-1">Name (optional)</label>
              <input
                className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-500"
                placeholder="e.g. Morning grind, Summer routine…"
                value={routineName}
                onChange={e => setRoutineName(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-textSecondary font-medium block mb-1">Tags</label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {tags.map(t => (
                  <span key={t} className="flex items-center gap-1 bg-teal-50 text-teal-600 text-xs font-semibold px-2 py-0.5 rounded-full">
                    {t}
                    <button onClick={() => setTags(ts => ts.filter(x => x !== t))}><X size={10} /></button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  className="flex-1 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-500"
                  placeholder="Add a tag…"
                  value={tagInput}
                  onChange={e => setTagInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commitTag() } }}
                />
                <button onClick={commitTag} className="px-3 py-2 bg-teal-50 text-teal-600 font-semibold text-sm rounded-lg active:bg-teal-100">
                  Add
                </button>
              </div>
            </div>
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}

          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full bg-teal-500 text-white font-semibold py-3.5 rounded-xl active:bg-teal-600 flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {saving
              ? <Loader2 size={16} className="animate-spin" />
              : isEditing ? 'Save changes' : 'Start routine'
            }
          </button>

          <div className="h-4" />
        </div>
      </div>
    </div>
  )
}
