import { useState, useEffect, useCallback } from 'react'
import { Plus, Trash2, CheckCircle2, Circle, ChevronDown, ChevronUp, Loader2, RefreshCw } from 'lucide-react'
import Modal from '../components/Modal'
import { getGroceries, saveGroceries, saveGroceryHaveState, getActiveMealPlan } from '../lib/db'
import { useAuth } from '../contexts/AuthContext'
import { uid, CATEGORIES, aggregateGroceriesFromPlan } from '../lib/utils'

export default function GroceryScreen() {
  const { user } = useAuth()

  // Plan-based ingredients
  const [planItems, setPlanItems]   = useState([])   // [{ key, name, totalQty }]
  const [haveState, setHaveState]   = useState({})   // { [key]: boolean }

  // Manual items
  const [items, setItems]           = useState([])
  const [loading, setLoading]       = useState(true)
  const [saving, setSaving]         = useState(false)
  const [savingHave, setSavingHave] = useState(false)

  // Sections collapse
  const [planOpen, setPlanOpen]     = useState(true)
  const [manualOpen, setManualOpen] = useState(true)

  // Manual add modal
  const [modalOpen, setModalOpen]   = useState(false)
  const [form, setForm]             = useState({ name: '', category: 'Other', quantity: '' })

  // Manual grouped by category
  const [collapsed, setCollapsed]   = useState({})

  const reload = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      const [groceryData, activePlan] = await Promise.all([
        getGroceries(user.id),
        getActiveMealPlan(user.id),
      ])
      setItems(groceryData.items || [])
      setHaveState(groceryData.haveState || {})

      if (activePlan?.plan) {
        setPlanItems(aggregateGroceriesFromPlan(activePlan.plan))
      }
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => { reload() }, [reload])

  // ── Have-state toggle ─────────────────────────────────────────────────────────
  async function toggleHave(key) {
    const next = { ...haveState, [key]: !haveState[key] }
    setHaveState(next)
    setSavingHave(true)
    try {
      await saveGroceryHaveState(user.id, next)
    } finally {
      setSavingHave(false)
    }
  }

  async function clearHaveState() {
    setHaveState({})
    setSavingHave(true)
    try {
      await saveGroceryHaveState(user.id, {})
    } finally {
      setSavingHave(false)
    }
  }

  // ── Manual items ──────────────────────────────────────────────────────────────
  async function persist(next) {
    setSaving(true)
    try {
      await saveGroceries(user.id, next)
      setItems(next)
    } finally {
      setSaving(false)
    }
  }

  async function handleAdd() {
    if (!form.name.trim()) return
    await persist([...items, {
      id: uid(),
      name: form.name.trim(),
      category: form.category,
      quantity: form.quantity.trim(),
      checked: false,
      createdAt: new Date().toISOString(),
    }])
    setForm({ name: '', category: 'Other', quantity: '' })
    setModalOpen(false)
  }

  async function toggle(id) {
    await persist(items.map(i => i.id === id ? { ...i, checked: !i.checked } : i))
  }

  async function remove(id) {
    await persist(items.filter(i => i.id !== id))
  }

  async function clearChecked() {
    await persist(items.filter(i => !i.checked))
  }

  function toggleCategory(cat) {
    setCollapsed(c => ({ ...c, [cat]: !c[cat] }))
  }

  const grouped = {}
  for (const cat of CATEGORIES) {
    const catItems = items.filter(i => i.category === cat)
    if (catItems.length) grouped[cat] = catItems
  }

  const haveCount    = planItems.filter(i => haveState[i.key]).length
  const manualUnchecked = items.filter(i => !i.checked).length
  const manualChecked   = items.filter(i => i.checked).length

  return (
    <div className="flex flex-col min-h-full">
      <div className="bg-white border-b border-border px-4 pt-10 pb-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-textPrimary">Groceries</h1>
            {planItems.length > 0 && (
              <p className="text-sm text-textSecondary mt-0.5">
                {haveCount}/{planItems.length} ingredients on hand
              </p>
            )}
          </div>
          <div className="flex gap-2">
            {manualChecked > 0 && (
              <button
                onClick={clearChecked}
                disabled={saving}
                className="text-xs text-red-500 font-medium px-3 py-1.5 border border-red-200 rounded-lg active:bg-red-50"
              >
                Clear done
              </button>
            )}
            <button
              onClick={() => { setForm({ name: '', category: 'Other', quantity: '' }); setModalOpen(true) }}
              className="flex items-center gap-1 bg-teal-500 text-white text-xs font-medium px-3 py-1.5 rounded-lg active:bg-teal-600"
            >
              <Plus size={14} />
              Add
            </button>
          </div>
        </div>

        {planItems.length > 0 && (
          <div className="mt-3 bg-border rounded-full h-1.5 overflow-hidden">
            <div
              className="h-full bg-teal-500 transition-all duration-300 rounded-full"
              style={{ width: `${planItems.length ? (haveCount / planItems.length) * 100 : 0}%` }}
            />
          </div>
        )}
      </div>

      <div className="flex-1 px-4 py-4 space-y-4">
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 size={24} className="animate-spin text-teal-500" />
          </div>
        ) : (
          <>
            {/* ── Meal plan ingredients ── */}
            {planItems.length > 0 && (
              <div className="bg-white rounded-xl border border-border overflow-hidden">
                <button
                  className="w-full flex items-center justify-between px-4 py-3"
                  onClick={() => setPlanOpen(o => !o)}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-textPrimary">From your meal plan</span>
                    <span className="text-xs text-textSecondary bg-bg px-2 py-0.5 rounded-full">
                      {haveCount}/{planItems.length}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {haveCount > 0 && (
                      <button
                        onClick={e => { e.stopPropagation(); clearHaveState() }}
                        disabled={savingHave}
                        className="text-[10px] text-red-400 px-2 py-0.5 border border-red-200 rounded-md"
                      >
                        Reset
                      </button>
                    )}
                    {planOpen ? <ChevronUp size={16} className="text-textSecondary" /> : <ChevronDown size={16} className="text-textSecondary" />}
                  </div>
                </button>

                {planOpen && (
                  <div className="divide-y divide-border/60 border-t border-border/60">
                    {planItems.map(item => {
                      const have = !!haveState[item.key]
                      return (
                        <div
                          key={item.key}
                          className={`flex items-center gap-3 px-4 py-3 ${have ? 'opacity-50' : ''}`}
                        >
                          <button onClick={() => toggleHave(item.key)} className="shrink-0" disabled={savingHave}>
                            {have
                              ? <CheckCircle2 size={20} className="text-teal-500" />
                              : <Circle size={20} className="text-border" />}
                          </button>
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-medium text-textPrimary ${have ? 'line-through' : ''}`}>
                              {item.name}
                            </p>
                            {item.totalQty && (
                              <p className="text-xs text-textSecondary">{item.totalQty}</p>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {planItems.length === 0 && (
              <div className="bg-white rounded-xl border border-dashed border-border p-5 text-center">
                <p className="text-sm text-textSecondary">Accept a meal plan to auto-populate your grocery list.</p>
              </div>
            )}

            {/* ── Manual list ── */}
            <div>
              <button
                className="flex items-center gap-1.5 text-sm font-semibold text-textPrimary w-full mb-2"
                onClick={() => setManualOpen(o => !o)}
              >
                My list
                <span className="text-xs text-textSecondary font-normal bg-bg px-2 py-0.5 rounded-full border border-border">
                  {manualUnchecked} item{manualUnchecked !== 1 ? 's' : ''}
                </span>
                {manualOpen ? <ChevronUp size={15} className="text-textSecondary ml-auto" /> : <ChevronDown size={15} className="text-textSecondary ml-auto" />}
              </button>

              {manualOpen && (
                items.length === 0 ? (
                  <div className="bg-white rounded-xl border border-border p-5 text-center">
                    <p className="text-textSecondary text-sm">No items yet</p>
                    <button
                      onClick={() => { setForm({ name: '', category: 'Other', quantity: '' }); setModalOpen(true) }}
                      className="mt-2 text-teal-500 text-sm font-medium"
                    >
                      + Add first item
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {Object.entries(grouped).map(([cat, catItems]) => {
                      const unchecked   = catItems.filter(i => !i.checked)
                      const checked     = catItems.filter(i => i.checked)
                      const sorted      = [...unchecked, ...checked]
                      const isCollapsed = collapsed[cat]
                      return (
                        <div key={cat} className="bg-white rounded-xl border border-border overflow-hidden">
                          <button
                            className="w-full flex items-center justify-between px-4 py-2.5"
                            onClick={() => toggleCategory(cat)}
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-textPrimary">{cat}</span>
                              <span className="text-xs text-textSecondary bg-bg px-2 py-0.5 rounded-full">
                                {unchecked.length}/{catItems.length}
                              </span>
                            </div>
                            {isCollapsed ? <ChevronDown size={16} className="text-textSecondary" /> : <ChevronUp size={16} className="text-textSecondary" />}
                          </button>
                          {!isCollapsed && (
                            <div className="divide-y divide-border/60">
                              {sorted.map(item => (
                                <div
                                  key={item.id}
                                  className={`flex items-center gap-3 px-4 py-3 ${item.checked ? 'opacity-50' : ''}`}
                                >
                                  <button onClick={() => toggle(item.id)} className="shrink-0" disabled={saving}>
                                    {item.checked
                                      ? <CheckCircle2 size={20} className="text-teal-500" />
                                      : <Circle size={20} className="text-border" />}
                                  </button>
                                  <div className="flex-1 min-w-0">
                                    <p className={`text-sm font-medium text-textPrimary ${item.checked ? 'line-through' : ''}`}>
                                      {item.name}
                                    </p>
                                    {item.quantity && (
                                      <p className="text-xs text-textSecondary">{item.quantity}</p>
                                    )}
                                  </div>
                                  <button
                                    onClick={() => remove(item.id)}
                                    className="p-1 text-textSecondary hover:text-red-500 shrink-0"
                                    disabled={saving}
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )
              )}
            </div>
          </>
        )}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Add item">
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-textSecondary block mb-1">Item name *</label>
            <input
              className="w-full border border-border rounded-lg px-3 py-2 text-sm text-textPrimary focus:outline-none focus:border-teal-500"
              placeholder="e.g. Greek yogurt"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-textSecondary block mb-1">Category</label>
              <select
                className="w-full border border-border rounded-lg px-3 py-2 text-sm text-textPrimary focus:outline-none focus:border-teal-500 bg-white"
                value={form.category}
                onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
              >
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-textSecondary block mb-1">Quantity</label>
              <input
                className="w-full border border-border rounded-lg px-3 py-2 text-sm text-textPrimary focus:outline-none focus:border-teal-500"
                placeholder="e.g. 500g, 2x"
                value={form.quantity}
                onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))}
              />
            </div>
          </div>
          <button
            onClick={handleAdd}
            disabled={!form.name.trim() || saving}
            className="w-full bg-teal-500 text-white font-semibold py-3 rounded-xl mt-1 disabled:opacity-40 active:bg-teal-600 flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : 'Add to list'}
          </button>
        </div>
      </Modal>
    </div>
  )
}
