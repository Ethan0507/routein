export function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

export function dateStr(date) {
  return date.toISOString().slice(0, 10)
}

export function formatTime(hhmm) {
  if (!hhmm) return ''
  const [h, m] = hhmm.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hour = h % 12 || 12
  return `${hour}:${String(m).padStart(2, '0')} ${ampm}`
}

export function nowHHmm() {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function currentHHmm() {
  return nowHHmm()
}

// Returns true if planned_time (HH:mm) is in the past relative to now
export function isTimePast(hhmm) {
  const now = nowHHmm()
  return hhmm <= now
}

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2)
}

// Last N days as YYYY-MM-DD strings, most recent last
export function lastNDays(n) {
  const days = []
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    days.push(dateStr(d))
  }
  return days
}

export function shortDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export const MEAL_SLOTS = ['breakfast', 'midMorning', 'lunch', 'preWorkout', 'postWorkout', 'dinner', 'beforeBed']

export const CATEGORIES = [
  'Produce', 'Protein', 'Dairy', 'Grains', 'Snacks',
  'Drinks', 'Condiments', 'Frozen', 'Other',
]

// ── Meal-plan helpers ─────────────────────────────────────────────────────────

/**
 * Aggregates every ingredient across all 7 days of a meal plan into a flat
 * deduplicated list. Items with the same normalised name are merged and their
 * quantities are collected.
 * Returns: [{ key, name, quantities: string[], totalQty }]
 */
export function aggregateGroceriesFromPlan(plan) {
  if (!plan || !Array.isArray(plan)) return []

  const map = {}

  for (const day of plan) {
    for (const [slotKey, slot] of Object.entries(day)) {
      if (slotKey === 'day') continue
      if (!slot || typeof slot !== 'object' || !Array.isArray(slot.ingredients)) continue
      for (const ing of slot.ingredients) {
        if (!ing?.name) continue
        const key = ing.name.toLowerCase().trim()
        if (!map[key]) {
          map[key] = { key, name: ing.name, quantities: [] }
        }
        if (ing.quantity) {
          map[key].quantities.push(ing.quantity)
        }
      }
    }
  }

  return Object.values(map)
    .map(item => ({
      key: item.key,
      name: item.name,
      quantities: item.quantities,
      // Show the first distinct quantities joined — e.g. "60g, 1 cup"
      totalQty: [...new Set(item.quantities)].join(', '),
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Given the ISO timestamp when a meal plan was accepted / saved,
 * returns which 0-indexed day of the 7-day plan to show today (0–6).
 */
export function getDayIndexForPlan(planCreatedAt) {
  if (!planCreatedAt) return 0
  const created = new Date(planCreatedAt)
  const now     = new Date()
  const diffDays = Math.floor((now - created) / (1000 * 60 * 60 * 24))
  return diffDays % 7
}
