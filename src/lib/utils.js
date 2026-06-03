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

export const CATEGORIES = [
  'Produce', 'Protein', 'Dairy', 'Grains', 'Snacks',
  'Drinks', 'Condiments', 'Frozen', 'Other',
]
