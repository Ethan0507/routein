// Generic localStorage helpers
export function load(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key)
    return raw !== null ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

export function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {}
}

// ── Diet ──────────────────────────────────────────────────────────────────────

const MEALS_KEY = 'nt_meals'

export function getMeals() {
  return load(MEALS_KEY, [])
}

export function saveMeals(meals) {
  save(MEALS_KEY, meals)
}

export function getMealsForDate(dateStr) {
  return getMeals().filter(m => m.date === dateStr)
}

export function addMeal(meal) {
  const meals = getMeals()
  meals.push(meal)
  saveMeals(meals)
}

export function deleteMeal(id) {
  saveMeals(getMeals().filter(m => m.id !== id))
}

// ── Grocery ───────────────────────────────────────────────────────────────────

const GROCERY_KEY = 'nt_groceries'

export function getGroceries() {
  return load(GROCERY_KEY, [])
}

export function saveGroceries(items) {
  save(GROCERY_KEY, items)
}

// ── Routine ───────────────────────────────────────────────────────────────────

const DEFAULT_BLOCKS = [
  { id: 'wake_up',    name: 'Wake up',          planned_time: '07:00', type: 'mandatory', enabled: true },
  { id: 'stretching', name: 'Stretching',        planned_time: '07:15', type: 'optional',  enabled: true },
  { id: 'breakfast',  name: 'Breakfast',         planned_time: '07:45', type: 'mandatory', enabled: true },
  { id: 'study',      name: 'Study / Upskill',   planned_time: '08:30', type: 'optional',  enabled: true },
  { id: 'work1',      name: 'Work block 1',      planned_time: '10:00', type: 'optional',  enabled: true },
  { id: 'lunch',      name: 'Lunch',             planned_time: '13:30', type: 'optional',  enabled: true },
  { id: 'work2',      name: 'Work block 2',      planned_time: '15:00', type: 'optional',  enabled: true },
  { id: 'workout',    name: 'Workout',           planned_time: '17:30', type: 'mandatory', enabled: true },
  { id: 'music',      name: 'Music / Side gig',  planned_time: '19:00', type: 'optional',  enabled: true },
  { id: 'dinner',     name: 'Dinner',            planned_time: '22:00', type: 'optional',  enabled: true },
]

const ROUTINE_SETTINGS_KEY = 'nt_routine_settings'
const ROUTINE_LOGS_KEY     = 'nt_routine_logs'

export function getRoutineSettings() {
  return load(ROUTINE_SETTINGS_KEY, { blocks: DEFAULT_BLOCKS })
}

export function saveRoutineSettings(settings) {
  save(ROUTINE_SETTINGS_KEY, settings)
}

// logs: { [dateStr]: DailyLog[] }
export function getAllRoutineLogs() {
  return load(ROUTINE_LOGS_KEY, {})
}

export function getRoutineLogsForDate(dateStr) {
  return getAllRoutineLogs()[dateStr] || []
}

export function saveRoutineLogsForDate(dateStr, logs) {
  const all = getAllRoutineLogs()
  all[dateStr] = logs
  save(ROUTINE_LOGS_KEY, all)
}

export function upsertRoutineLog(dateStr, log) {
  const logs = getRoutineLogsForDate(dateStr)
  const idx = logs.findIndex(l => l.block_id === log.block_id)
  if (idx >= 0) logs[idx] = log
  else logs.push(log)
  saveRoutineLogsForDate(dateStr, logs)
}
