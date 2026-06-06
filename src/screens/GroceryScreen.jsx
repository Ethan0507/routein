import { useState, useEffect, useCallback, useRef } from 'react'
import { Plus, Trash2, CheckCircle2, Circle, ChevronDown, ChevronUp, Loader2, RefreshCw } from 'lucide-react'
import Modal from '../components/Modal'
import { getGroceries, saveGroceries, saveGroceryHaveState, getActiveMealPlan } from '../lib/db'
import { useAuth } from '../contexts/AuthContext'
import { uid, CATEGORIES } from '../lib/utils'
import { aggregateGroceriesFromPlan, formatNormalized } from '../lib/groceryUtils'

// ── Inline "have" number editor ───────────────────────────────────────────────
function HaveInput({ value, unit, onCommit }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft]     = useState(String(value ?? 0))

  function commit() {
    const n = parseFloat(draft)
    onCommit(isNaN(n) ? 0 : Math.max(0, n))
    setEditing(false)
  }

  if (editing) {
    return (
      <input
        type="number"
        className="w-20 text-right border border-teal-400 rounded-lg px-2 py-1 text-sm focus:outline-none"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') commit() }}
        autoFocus
      />
    )
  }

  return (
    <button
      onClick={() => { setDraft(String(value ?? 0)); setEditing(true) }}
      className="text-sm font-semibold text-teal-600 tabular-nums hover:underline underline-offset-2"
    >
      {formatNormalized(value ?? 0, unit)}
    </button>
  )
}

export default function GroceryScreen() {
  const { user } = useAuth()

  const [planItems, setPlanItems]   = useState([])   // [{ key, name, totalNeeded, baseUnit, display }]
  const [haveState, setHaveState]   = useState({})   // { [key]: number }
  const [items, setItems]           = useState([])   // manual list
  const [loading, setLoading]       = useState(true)
  const [saving, setSaving]         = useState(false)
  const [savingHave, setSavingHave] = useState(false)
  const [planOpen, setPlanOpen]     = useState(true)
  const [manualOpen, setManualOpen] = useState(true)
  const [collapsed, setCollapsed]   = useState({})
  const [modalOpen, setModalOpen]   = useState(false)
  const [form, setForm]             = useState({ name: '', category: 'Other', quantity: '' })

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
      if (activePlan?.plan) setPlanItems(aggregateGroceriesFromPlan(activePlan.plan))
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => { reload() }, [reload])

  // ── Have-state helpers ────────────────────────────────────────────────────────
  async function commitHave(key, value) {
    const next = { ...haveState, [key]: value }
    setHaveState(next)
    setSavingHave(true)
    try { await saveGroceryHaveState(user.id, next) } finally { setSavingHave(false) }
  }

  async function restockAll() {
    const next = { ...haveState }
    for (const item of planItems) next[item.key] = item.totalNeeded
    setHaveState(next)
    setSavingHave(true)
    try { await saveGroceryHaveState(user.id, next) } finally { setSavingHave(false) }
  }

  async function clearHaveState() {
    setHaveState({})
    setSavingHave(true)
    try { await saveGroceryHaveState(user.id, {}) } finally { setSavingHave(false) }
  }

  // ── Manual items ──────────────────────────────────────────────────────────────
  async function persist(next) {
    setSaving(true)
    try { await saveGroceries(user.id, next); setItems(next) } finally { setSaving(false) }
  }

  async function handleAdd() {
    if (!form.name.trim()) return
    await persist([...items, { id: uid(), name: form.name.trim(), category: form.category, quantity: form.quantity.trim(), checked: false, createdAt: new Date().toISOString() }])
    setForm({ name: '', category: 'Other', quantity: '' })
    setModalOpen(false)
  }

  // ── Derived values ────────────────────────────────────────────────────────────
  const stockedCount    = planItems.filter(i => (haveState[i.key] ?? 0) >= i.totalNeeded).length
  const manualUnchecked = items.filter(i => !i.checked).length
  const manualChecked   = items.filter(i => i.checked).length

  const grouped = {}
  for (const cat of CATEGORIES) {
    const ci = items.filter(i => i.category === cat)
    if (ci.length) grouped[cat] = ci
  }

  return (
    <div className="flex flex-col min-h-full">
      {/* Header */}
      <div className="bg-white border-b border-border px-4 pt-10 pb-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-textPrimary">Groceries</h1>
            {planItems.length > 0 && (
              <p className="text-sm text-textSecondary mt-0.5">
                {stockedCount}/{planItems.length} ingredients stocked
              </p>
            )}
          </div>
          <div className="flex gap-2">
            {manualChecked > 0 && (
              <button onClick={() => persist(items.filter(i => !i.checked))} disabled={saving}
                className="text-xs text-red-500 font-medium px-3 py-1.5 border border-red-200 rounded-lg active:bg-red-50">
                Clear done
              </button>
            )}
            <button
              onClick={() => { setForm({ name: '', category: 'Other', quantity: '' }); setModalOpen(true) }}
              className="flex items-center gap-1 bg-teal-500 text-white text-xs font-medium px-3 py-1.5 rounded-lg active:bg-teal-600"
            >
              <Plus size={14} /> Add
            </button>
          </div>
        </div>

        {planItems.length > 0 && (
          <div className="mt-3 bg-border rounded-full h-1.5 overflow-hidden">
            <div className="h-full bg-teal-500 transition-all duration-300 rounded-full"
              style={{ width: `${planItems.length ? (stockedCount / planItems.length) * 100 : 0}%` }} />
          </div>
        )}
      </div>

      <div className="flex-1 px-4 py-4 space-y-4">
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-teal-500" /></div>
        ) : (
          <>
            {/* ── Plan ingredients ── */}
            {planItems.length > 0 ? (
              <div className="bg-white rounded-xl border border-border overflow-hidden">
                {/* Section header */}
                <div className="flex items-center px-4 py-3 border-b border-border/60 gap-2">
                  <button className="flex items-center gap-2 flex-1 text-left" onClick={() => setPlanOpen(o => !o)}>
                    <span className="text-sm font-semibold text-textPrimary">From your meal plan</span>
                    <span className="text-xs text-textSecondary bg-bg px-2 py-0.5 rounded-full">{stockedCount}/{planItems.length}</span>
                    {planOpen ? <ChevronUp size={14} className="text-textSecondary ml-auto" /> : <ChevronDown size={14} className="text-textSecondary ml-auto" />}
                  </button>
                  {savingHave && <Loader2 size={12} className="text-teal-500 animate-spin shrink-0" />}
                  <button onClick={restockAll} disabled={savingHave}
                    className="shrink-0 text-[11px] font-semibold text-teal-600 bg-teal-50 border border-teal-200 px-2.5 py-1 rounded-lg active:bg-teal-100 disabled:opacity-50">
                    Restock all
                  </button>
                  {stockedCount > 0 && (
                    <button onClick={clearHaveState} disabled={savingHave}
                      className="shrink-0 text-[11px] font-semibold text-red-400 border border-red-200 px-2.5 py-1 rounded-lg active:bg-red-50 disabled:opacity-50">
                      Clear
                    </button>
                  )}
                </div>

                {planOpen && (
                  <>
                    {/* Column headers */}
                    <div className="grid grid-cols-[1fr_76px_76px_32px] gap-1 px-4 py-1.5 bg-bg/60 border-b border-border/60">
                      <p className="text-[10px] font-semibold text-textSecondary uppercase tracking-wide">Ingredient</p>
                      <p className="text-[10px] font-semibold text-textSecondary uppercase tracking-wide text-right">Need</p>
                      <p className="text-[10px] font-semibold text-textSecondary uppercase tracking-wide text-right">Have</p>
                      <div />
                    </div>

                    <div className="divide-y divide-border/60">
                      {planItems.map(item => {
                        const have      = haveState[item.key] ?? 0
                        const remaining = Math.max(0, item.totalNeeded - have)
                        const stocked   = have >= item.totalNeeded

                        return (
                          <div key={item.key} className={`grid grid-cols-[1fr_76px_76px_32px] gap-1 items-center px-4 py-2.5 transition-colors ${stocked ? 'bg-teal-50/30' : ''}`}>
                            <div className="min-w-0">
                              <p className={`text-sm font-medium text-textPrimary truncate ${stocked ? 'line-through opacity-60' : ''}`}>
                                {item.name}
                              </p>
                              {remaining > 0 && (
                                <p className="text-[10px] text-orange-500 font-medium">
                                  need {formatNormalized(remaining, item.baseUnit)} more
                                </p>
                              )}
                            </div>

                            {/* Need */}
                            <p className="text-sm text-textSecondary text-right tabular-nums">{item.display}</p>

                            {/* Have (tap to edit) */}
                            <div className="flex justify-end">
                              <HaveInput value={have} unit={item.baseUnit} onCommit={v => commitHave(item.key, v)} />
                            </div>

                            {/* Restock / stocked indicator */}
                            <div className="flex justify-center">
                              {stocked ? (
                                <CheckCircle2 size={17} className="text-teal-500" />
                              ) : (
                                <button onClick={() => commitHave(item.key, item.totalNeeded)} disabled={savingHave}
                                  className="p-0.5 text-textSecondary hover:text-teal-500 disabled:opacity-40" title="Mark fully stocked">
                                  <RefreshCw size={13} />
                                </button>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-dashed border-border p-5 text-center">
                <p className="text-sm text-textSecondary">Accept a meal plan to auto-populate your grocery list.</p>
              </div>
            )}

            {/* ── Manual list ── */}
            <div>
              <button className="flex items-center gap-1.5 text-sm font-semibold text-textPrimary w-full mb-2" onClick={() => setManualOpen(o => !o)}>
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
                    <button onClick={() => { setForm({ name: '', category: 'Other', quantity: '' }); setModalOpen(true) }}
                      className="mt-2 text-teal-500 text-sm font-medium">+ Add first item</button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {Object.entries(grouped).map(([cat, catItems]) => {
                      const unchecked   = catItems.filter(i => !i.checked)
                      const checked     = catItems.filter(i => i.checked)
                      const isCollapsed = collapsed[cat]
                      return (
                        <div key={cat} className="bg-white rounded-xl border border-border overflow-hidden">
                          <button className="w-full flex items-center justify-between px-4 py-2.5"
                            onClick={() => setCollapsed(c => ({ ...c, [cat]: !c[cat] }))}>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-textPrimary">{cat}</span>
                              <span className="text-xs text-textSecondary bg-bg px-2 py-0.5 rounded-full">{unchecked.length}/{catItems.length}</span>
                            </div>
                            {isCollapsed ? <ChevronDown size={16} className="text-textSecondary" /> : <ChevronUp size={16} className="text-textSecondary" />}
                          </button>
                          {!isCollapsed && (
                            <div className="divide-y divide-border/60">
                              {[...unchecked, ...checked].map(item => (
                                <div key={item.id} className={`flex items-center gap-3 px-4 py-3 ${item.checked ? 'opacity-50' : ''}`}>
                                  <button onClick={() => persist(items.map(i => i.id === item.id ? { ...i, checked: !i.checked } : i))} disabled={saving} className="shrink-0">
                                    {item.checked ? <CheckCircle2 size={20} className="text-teal-500" /> : <Circle size={20} className="text-border" />}
                                  </button>
                                  <div className="flex-1 min-w-0">
                                    <p className={`text-sm font-medium text-textPrimary ${item.checked ? 'line-through' : ''}`}>{item.name}</p>
                                    {item.quantity && <p className="text-xs text-textSecondary">{item.quantity}</p>}
                                  </div>
                                  <button onClick={() => persist(items.filter(i => i.id !== item.id))} className="p-1 text-textSecondary hover:text-red-500 shrink-0" disabled={saving}>
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
            <input className="w-full border border-border rounded-lg px-3 py-2 text-sm text-textPrimary focus:outline-none focus:border-teal-500"
              placeholder="e.g. Greek yogurt" value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              onKeyDown={e => e.key === 'Enter' && handleAdd()} autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-textSecondary block mb-1">Category</label>
              <select className="w-full border border-border rounded-lg px-3 py-2 text-sm text-textPrimary focus:outline-none focus:border-teal-500 bg-white"
                value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-textSecondary block mb-1">Quantity</label>
              <input className="w-full border border-border rounded-lg px-3 py-2 text-sm text-textPrimary focus:outline-none focus:border-teal-500"
                placeholder="e.g. 500g, 2x" value={form.quantity}
                onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} />
            </div>
          </div>
          <button onClick={handleAdd} disabled={!form.name.trim() || saving}
            className="w-full bg-teal-500 text-white font-semibold py-3 rounded-xl mt-1 disabled:opacity-40 active:bg-teal-600 flex items-center justify-center gap-2">
            {saving ? <Loader2 size={16} className="animate-spin" /> : 'Add to list'}
          </button>
        </div>
      </Modal>
    </div>
  )
}
