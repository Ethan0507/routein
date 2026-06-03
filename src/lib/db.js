import { supabase } from './supabase'

// ── Default routine blocks ────────────────────────────────────────────────────

export const DEFAULT_BLOCKS = [
  { id: 'wake_up',    name: 'Wake up',         planned_time: '07:00', type: 'mandatory', enabled: true },
  { id: 'stretching', name: 'Stretching',       planned_time: '07:15', type: 'optional',  enabled: true },
  { id: 'breakfast',  name: 'Breakfast',        planned_time: '07:45', type: 'mandatory', enabled: true },
  { id: 'study',      name: 'Study / Upskill',  planned_time: '08:30', type: 'optional',  enabled: true },
  { id: 'work1',      name: 'Work block 1',     planned_time: '10:00', type: 'optional',  enabled: true },
  { id: 'lunch',      name: 'Lunch',            planned_time: '13:30', type: 'optional',  enabled: true },
  { id: 'work2',      name: 'Work block 2',     planned_time: '15:00', type: 'optional',  enabled: true },
  { id: 'workout',    name: 'Workout',          planned_time: '17:30', type: 'mandatory', enabled: true },
  { id: 'music',      name: 'Music / Side gig', planned_time: '19:00', type: 'optional',  enabled: true },
  { id: 'dinner',     name: 'Dinner',           planned_time: '22:00', type: 'optional',  enabled: true },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function assertNoError(error, context) {
  if (error) {
    console.error(`[db] ${context}:`, error.message)
    throw new Error(error.message)
  }
}

// ── Diet entries ──────────────────────────────────────────────────────────────

export async function getDietEntriesForDate(userId, dateStr) {
  const { data, error } = await supabase
    .from('diet_entries')
    .select('*')
    .eq('user_id', userId)
    .eq('date', dateStr)
    .order('time', { ascending: true })
  assertNoError(error, 'getDietEntriesForDate')
  return data || []
}

export async function getDietEntriesForRange(userId, startDate, endDate) {
  const { data, error } = await supabase
    .from('diet_entries')
    .select('*')
    .eq('user_id', userId)
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date', { ascending: false })
    .order('time', { ascending: true })
  assertNoError(error, 'getDietEntriesForRange')
  return data || []
}

export async function addDietEntry(userId, entry) {
  const { data, error } = await supabase
    .from('diet_entries')
    .insert({ ...entry, user_id: userId })
    .select()
    .single()
  assertNoError(error, 'addDietEntry')
  return data
}

export async function deleteDietEntry(userId, id) {
  const { error } = await supabase
    .from('diet_entries')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)
  assertNoError(error, 'deleteDietEntry')
}

// ── Groceries ─────────────────────────────────────────────────────────────────

export async function getGroceries(userId) {
  const { data, error } = await supabase
    .from('groceries')
    .select('items')
    .eq('user_id', userId)
    .maybeSingle()
  assertNoError(error, 'getGroceries')
  return data?.items || []
}

export async function saveGroceries(userId, items) {
  const { error } = await supabase
    .from('groceries')
    .upsert({ user_id: userId, items, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
  assertNoError(error, 'saveGroceries')
}

// ── Routine settings ──────────────────────────────────────────────────────────

export async function getRoutineSettings(userId) {
  const { data, error } = await supabase
    .from('routine_settings')
    .select('blocks')
    .eq('user_id', userId)
    .maybeSingle()
  assertNoError(error, 'getRoutineSettings')
  if (!data) {
    // First time — seed defaults
    await saveRoutineSettings(userId, { blocks: DEFAULT_BLOCKS })
    return { blocks: DEFAULT_BLOCKS }
  }
  return { blocks: data.blocks }
}

export async function saveRoutineSettings(userId, settings) {
  const { error } = await supabase
    .from('routine_settings')
    .upsert({
      user_id: userId,
      blocks: settings.blocks,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })
  assertNoError(error, 'saveRoutineSettings')
}

// ── Routine logs ──────────────────────────────────────────────────────────────

export async function getRoutineLogsForDate(userId, dateStr) {
  const { data, error } = await supabase
    .from('routine_logs')
    .select('*')
    .eq('user_id', userId)
    .eq('date', dateStr)
  assertNoError(error, 'getRoutineLogsForDate')
  return data || []
}

export async function getRoutineLogsForRange(userId, startDate, endDate) {
  const { data, error } = await supabase
    .from('routine_logs')
    .select('*')
    .eq('user_id', userId)
    .gte('date', startDate)
    .lte('date', endDate)
  assertNoError(error, 'getRoutineLogsForRange')

  // Return as { [dateStr]: log[] }
  const grouped = {}
  for (const log of data || []) {
    if (!grouped[log.date]) grouped[log.date] = []
    grouped[log.date].push(log)
  }
  return grouped
}

export async function upsertRoutineLog(userId, dateStr, log) {
  const { error } = await supabase
    .from('routine_logs')
    .upsert({
      user_id: userId,
      date: dateStr,
      block_id: log.block_id,
      block_name: log.block_name,
      block_type: log.block_type,
      planned_time: log.planned_time,
      actual_time: log.actual_time,
      note: log.note || null,
    }, { onConflict: 'user_id,date,block_id' })
  assertNoError(error, 'upsertRoutineLog')
}

// ── Meal plans ────────────────────────────────────────────────────────────────

export async function saveMealPlan(userId, { plan, targets, source }) {
  const { error } = await supabase
    .from('meal_plans')
    .insert({ user_id: userId, plan, targets, source, updated_at: new Date().toISOString() })
  assertNoError(error, 'saveMealPlan')
}

export async function getActiveMealPlan(userId) {
  const { data, error } = await supabase
    .from('meal_plans')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  assertNoError(error, 'getActiveMealPlan')
  return data
}

// ── User profile ──────────────────────────────────────────────────────────────

export async function getProfile(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle()
  assertNoError(error, 'getProfile')
  return data
}

export async function upsertProfile(userId, profile) {
  const { error } = await supabase
    .from('profiles')
    .upsert({ id: userId, ...profile, updated_at: new Date().toISOString() }, { onConflict: 'id' })
  assertNoError(error, 'upsertProfile')
}
