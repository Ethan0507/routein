import { supabase } from './supabase'

// ── Routine constants ─────────────────────────────────────────────────────────

export const DIET_BLOCK_IDS = ['breakfast', 'lunch', 'dinner']

// Fixed section definitions (id + display only — blocks are stored per-user)
export const ROUTINE_SECTIONS = [
  { id: 'sleep',     name: 'Sleep',     emoji: '😴' },
  { id: 'nutrition', name: 'Nutrition', emoji: '🥗' },
  { id: 'exercise',  name: 'Exercise',  emoji: '💪' },
  { id: 'work',      name: 'Work',      emoji: '💼' },
  { id: 'hobbies',   name: 'Hobbies',   emoji: '🎨' },
  { id: 'other',     name: 'Other',     emoji: '⚡' },
]

export const DEFAULT_SECTIONS = [
  { id: 'sleep',     name: 'Sleep',     emoji: '😴', blocks: [
    { id: 'wake_up',  name: 'Wake up',  planned_time: '06:30', type: 'mandatory', enabled: true },
    { id: 'bed_time', name: 'Bed time', planned_time: '23:00', type: 'optional',  enabled: true },
  ]},
  { id: 'nutrition', name: 'Nutrition', emoji: '🥗', blocks: [] },
  { id: 'exercise',  name: 'Exercise',  emoji: '💪', blocks: [
    { id: 'workout',  name: 'Workout',  planned_time: '07:00', type: 'mandatory', enabled: true },
  ]},
  { id: 'work',      name: 'Work',      emoji: '💼', blocks: [
    { id: 'work',     name: 'Work',     planned_time: '09:00', type: 'optional',  enabled: true },
  ]},
  { id: 'hobbies',   name: 'Hobbies',   emoji: '🎨', blocks: [
    { id: 'reading',  name: 'Reading',  planned_time: '21:00', type: 'optional',  enabled: true },
  ]},
  { id: 'other',     name: 'Other',     emoji: '⚡', blocks: [] },
]

// Kept for backward compat
export const DEFAULT_BLOCKS = []

// Maps old flat block IDs → section IDs for migration
const BLOCK_SECTION_MAP = {
  wake_up: 'sleep', bed_time: 'sleep', stretching: 'sleep',
  breakfast: 'nutrition', lunch: 'nutrition', dinner: 'nutrition',
  midMorning: 'nutrition', preWorkout: 'nutrition', postWorkout: 'nutrition', beforeBed: 'nutrition',
  workout: 'exercise',
  work: 'work', work1: 'work', work2: 'work',
  study: 'hobbies', reading: 'hobbies', music: 'hobbies',
}

function migrateFlatToSections(flatBlocks) {
  const sections = DEFAULT_SECTIONS.map(s => ({ ...s, blocks: [] }))
  const idx = Object.fromEntries(sections.map((s, i) => [s.id, i]))
  for (const block of flatBlocks) {
    if (DIET_BLOCK_IDS.includes(block.id)) continue  // comes from syncDiet
    const sectionId = BLOCK_SECTION_MAP[block.id] || 'other'
    sections[idx[sectionId]].blocks.push(block)
  }
  return sections
}

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
    .select('items, have_state')
    .eq('user_id', userId)
    .maybeSingle()
  assertNoError(error, 'getGroceries')
  return { items: data?.items || [], haveState: data?.have_state || {} }
}

export async function saveGroceries(userId, items) {
  const { error } = await supabase
    .from('groceries')
    .upsert({ user_id: userId, items, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
  assertNoError(error, 'saveGroceries')
}

export async function getGroceryHaveState(userId) {
  const { data, error } = await supabase
    .from('groceries')
    .select('have_state')
    .eq('user_id', userId)
    .maybeSingle()
  assertNoError(error, 'getGroceryHaveState')
  return data?.have_state || {}
}

export async function saveGroceryHaveState(userId, haveState) {
  const { error } = await supabase
    .from('groceries')
    .upsert({ user_id: userId, have_state: haveState, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
  assertNoError(error, 'saveGroceryHaveState')
}

// ── Routine settings ──────────────────────────────────────────────────────────

export async function getRoutineSettings(userId) {
  const { data, error } = await supabase
    .from('routine_settings')
    .select('blocks, sections, sync_diet, diet_block_times, onboarding_complete')
    .eq('user_id', userId)
    .maybeSingle()
  assertNoError(error, 'getRoutineSettings')

  if (!data) {
    return { sections: null, syncDiet: false, dietBlockTimes: {}, onboardingComplete: false }
  }

  const syncDiet           = data.sync_diet ?? false
  const dietBlockTimes     = data.diet_block_times ?? {}
  const onboardingComplete = data.onboarding_complete ?? true

  // If sections exist in DB, use them directly
  if (data.sections) {
    return { sections: data.sections, syncDiet, dietBlockTimes, onboardingComplete }
  }

  // Migrate old flat blocks → sections (existing users)
  const sections = migrateFlatToSections(data.blocks || [])
  return { sections, syncDiet: true, dietBlockTimes, onboardingComplete }
}

export async function saveRoutineSettings(userId, settings) {
  // Flatten all section blocks into a legacy `blocks` array for backward compat
  const flatBlocks = (settings.sections || []).flatMap(s => s.blocks || [])
  const { error } = await supabase
    .from('routine_settings')
    .upsert({
      user_id:             userId,
      sections:            settings.sections ?? [],
      blocks:              flatBlocks,
      sync_diet:           settings.syncDiet ?? false,
      diet_block_times:    settings.dietBlockTimes ?? {},
      onboarding_complete: settings.onboardingComplete ?? true,
      updated_at:          new Date().toISOString(),
    }, { onConflict: 'user_id' })
  assertNoError(error, 'saveRoutineSettings')
}

// ── Routines (library) ────────────────────────────────────────────────────────

function normalizeRoutine(row) {
  return {
    id:              row.id,
    name:            row.name || '',
    tags:            row.tags || [],
    sections:        row.sections,
    syncDiet:        row.sync_diet ?? false,
    dietBlockTimes:  row.diet_block_times ?? {},
    isActive:        row.is_active ?? false,
    changelog:       row.changelog || [],
    onboardingComplete: true,
    createdAt:       row.created_at,
    updatedAt:       row.updated_at,
  }
}

export async function getActiveRoutine(userId) {
  // Check routines table for active entry
  const { data: activeRow, error } = await supabase
    .from('routines')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle()
  assertNoError(error, 'getActiveRoutine')
  if (activeRow) return normalizeRoutine(activeRow)

  // Migration: auto-create a routines row from routine_settings if it exists
  const { data: settings } = await supabase
    .from('routine_settings')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  if (settings && (settings.sections || settings.blocks?.length)) {
    const sections = settings.sections || migrateFlatToSections(settings.blocks || [])
    const { data: created, error: ce } = await supabase
      .from('routines')
      .insert({
        user_id:         userId,
        name:            'My Routine',
        tags:            [],
        sections,
        sync_diet:       settings.sync_diet ?? false,
        diet_block_times: settings.diet_block_times ?? {},
        is_active:       true,
        changelog:       [{ timestamp: new Date().toISOString(), summary: 'Migrated from routine settings' }],
      })
      .select()
      .single()
    assertNoError(ce, 'getActiveRoutine:migrate')
    return normalizeRoutine(created)
  }

  return null
}

export async function getAllRoutines(userId) {
  const { data, error } = await supabase
    .from('routines')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  assertNoError(error, 'getAllRoutines')
  return (data || []).map(normalizeRoutine)
}

export async function createRoutine(userId, routine) {
  if (routine.isActive) {
    await supabase.from('routines').update({ is_active: false }).eq('user_id', userId)
  }
  const { data, error } = await supabase
    .from('routines')
    .insert({
      user_id:         userId,
      name:            routine.name || null,
      tags:            routine.tags || [],
      sections:        routine.sections || [],
      sync_diet:       routine.syncDiet ?? false,
      diet_block_times: routine.dietBlockTimes ?? {},
      is_active:       routine.isActive ?? false,
      changelog:       [{ timestamp: new Date().toISOString(), summary: 'Routine created' }],
    })
    .select()
    .single()
  assertNoError(error, 'createRoutine')
  return normalizeRoutine(data)
}

export async function updateRoutineInPlace(id, updates, changelogSummary) {
  const patch = { updated_at: new Date().toISOString() }
  if (updates.sections       !== undefined) patch.sections         = updates.sections
  if (updates.syncDiet       !== undefined) patch.sync_diet        = updates.syncDiet
  if (updates.dietBlockTimes !== undefined) patch.diet_block_times = updates.dietBlockTimes
  if (updates.name           !== undefined) patch.name             = updates.name || null
  if (updates.tags           !== undefined) patch.tags             = updates.tags || []

  if (changelogSummary) {
    const { data: cur } = await supabase.from('routines').select('changelog').eq('id', id).single()
    patch.changelog = [
      { timestamp: new Date().toISOString(), summary: changelogSummary },
      ...(cur?.changelog || []),
    ].slice(0, 50)
  }

  const { error } = await supabase.from('routines').update(patch).eq('id', id)
  assertNoError(error, 'updateRoutineInPlace')
}

export async function activateRoutine(userId, id) {
  await supabase.from('routines').update({ is_active: false }).eq('user_id', userId)
  const { error } = await supabase
    .from('routines')
    .update({ is_active: true, updated_at: new Date().toISOString() })
    .eq('id', id).eq('user_id', userId)
  assertNoError(error, 'activateRoutine')
}

export async function deactivateAllRoutines(userId) {
  const { error } = await supabase.from('routines').update({ is_active: false }).eq('user_id', userId)
  assertNoError(error, 'deactivateAllRoutines')
}

export async function deleteRoutine(userId, id) {
  const { error } = await supabase.from('routines').delete().eq('id', id).eq('user_id', userId)
  assertNoError(error, 'deleteRoutine')
}

/** Compute a human-readable summary of what changed between two routine versions */
export function diffRoutineSections(oldSections, newSections, oldSync, newSync) {
  const changes = []
  if (oldSync !== newSync) changes.push(newSync ? 'Diet sync enabled' : 'Diet sync disabled')

  const oldBlocks = new Map((oldSections || []).flatMap(s => s.blocks || []).map(b => [b.id, b]))
  const newBlocks = new Map((newSections || []).flatMap(s => s.blocks || []).map(b => [b.id, b]))

  for (const [id, nb] of newBlocks) {
    const ob = oldBlocks.get(id)
    if (!ob) {
      changes.push(`Added "${nb.name}"`)
    } else {
      if (ob.name !== nb.name) changes.push(`"${ob.name}" → "${nb.name}"`)
      if (ob.planned_time !== nb.planned_time) changes.push(`${nb.name}: ${ob.planned_time} → ${nb.planned_time}`)
      if (ob.type !== nb.type) changes.push(`${nb.name} now ${nb.type}`)
    }
  }
  for (const [id, ob] of oldBlocks) {
    if (!newBlocks.has(id)) changes.push(`Removed "${ob.name}"`)
  }

  if (!changes.length) return null
  return changes.slice(0, 5).join(' · ') + (changes.length > 5 ? ` +${changes.length - 5} more` : '')
}

// ── Saved routines (legacy — kept for backward compat reads) ──────────────────

export async function getSavedRoutines(userId) {
  const { data, error } = await supabase
    .from('saved_routines')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  assertNoError(error, 'getSavedRoutines')
  return data || []
}

export async function deleteSavedRoutine(userId, id) {
  const { error } = await supabase
    .from('saved_routines')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)
  assertNoError(error, 'deleteSavedRoutine')
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
  const row = {
    user_id:      userId,
    date:         dateStr,
    block_id:     log.block_id,
    block_name:   log.block_name,
    block_type:   log.block_type,
    planned_time: log.planned_time,
    actual_time:  log.actual_time,
    note:         log.note || null,
  }
  if (log.routine_id) row.routine_id = log.routine_id
  const { error } = await supabase
    .from('routine_logs')
    .upsert(row, { onConflict: 'user_id,date,block_id' })
  assertNoError(error, 'upsertRoutineLog')
}

// ── Meal logs (plan-based tracking) ──────────────────────────────────────────

export async function getMealLogsForRange(userId, startDate, endDate) {
  const { data, error } = await supabase
    .from('meal_logs')
    .select('*')
    .eq('user_id', userId)
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date', { ascending: false })
    .order('consumed_at', { ascending: true })
  assertNoError(error, 'getMealLogsForRange')
  return data || []
}

export async function getMealLogsForDate(userId, dateStr) {
  const { data, error } = await supabase
    .from('meal_logs')
    .select('*')
    .eq('user_id', userId)
    .eq('date', dateStr)
  assertNoError(error, 'getMealLogsForDate')
  // Return as { [meal_slot]: log }
  const bySlot = {}
  for (const log of data || []) bySlot[log.meal_slot] = log
  return bySlot
}

export async function upsertMealLog(userId, dateStr, mealSlot, logData) {
  const { error } = await supabase
    .from('meal_logs')
    .upsert({
      user_id:           userId,
      date:              dateStr,
      meal_slot:         mealSlot,
      completed:         logData.completed ?? true,
      consumed_at:       logData.consumed_at || null,
      custom_description: logData.custom_description || null,
      nutrition:         logData.nutrition || null,
    }, { onConflict: 'user_id,date,meal_slot' })
  assertNoError(error, 'upsertMealLog')
}

export async function deleteMealLog(userId, dateStr, mealSlot) {
  const { error } = await supabase
    .from('meal_logs')
    .delete()
    .eq('user_id', userId)
    .eq('date', dateStr)
    .eq('meal_slot', mealSlot)
  assertNoError(error, 'deleteMealLog')
}

// ── Meal plans ────────────────────────────────────────────────────────────────

export async function updateMealPlan(planId, { plan, targets, source, name, tags }) {
  const patch = { plan, targets, source, updated_at: new Date().toISOString() }
  if (name  !== undefined) patch.name = name
  if (tags  !== undefined) patch.tags = tags
  const { error } = await supabase
    .from('meal_plans')
    .update(patch)
    .eq('id', planId)
  assertNoError(error, 'updateMealPlan')
}

/** Update only the name/tags without touching the plan data */
export async function updatePlanMeta(planId, { name, tags }) {
  const { error } = await supabase
    .from('meal_plans')
    .update({ name, tags, updated_at: new Date().toISOString() })
    .eq('id', planId)
  assertNoError(error, 'updatePlanMeta')
}

export async function saveMealPlan(userId, { plan, targets, source, name, tags }) {
  const { data, error } = await supabase
    .from('meal_plans')
    .insert({
      user_id: userId, plan, targets, source,
      name:  name  ?? null,
      tags:  tags  ?? [],
      updated_at: new Date().toISOString(),
    })
    .select('id, created_at')
    .single()
  assertNoError(error, 'saveMealPlan')
  return data  // { id, created_at }
}

export async function getAllMealPlans(userId) {
  const { data, error } = await supabase
    .from('meal_plans')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(30)
  assertNoError(error, 'getAllMealPlans')
  return data || []
}

export async function getActiveMealPlan(userId) {
  // Try explicit is_active flag first
  const { data: active, error } = await supabase
    .from('meal_plans')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle()
  assertNoError(error, 'getActiveMealPlan')
  if (active) return active

  // Migration: mark the most recent plan as active
  const { data: latest } = await supabase
    .from('meal_plans')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (latest) {
    try { await supabase.from('meal_plans').update({ is_active: true }).eq('id', latest.id) } catch { /* non-fatal */ }
    return { ...latest, is_active: true }
  }

  return null
}

export async function activateMealPlan(userId, id) {
  await supabase.from('meal_plans').update({ is_active: false }).eq('user_id', userId)
  const { error } = await supabase
    .from('meal_plans')
    .update({ is_active: true, updated_at: new Date().toISOString() })
    .eq('id', id).eq('user_id', userId)
  assertNoError(error, 'activateMealPlan')
}

export async function deactivateMealPlan(userId) {
  const { error } = await supabase.from('meal_plans').update({ is_active: false }).eq('user_id', userId)
  assertNoError(error, 'deactivateMealPlan')
}

export async function deleteMealPlan(userId, id) {
  const { error } = await supabase.from('meal_plans').delete().eq('id', id).eq('user_id', userId)
  assertNoError(error, 'deleteMealPlan')
}

export async function appendMealPlanChangelog(planId, summary) {
  const { data: cur } = await supabase.from('meal_plans').select('changelog').eq('id', planId).single()
  const { error } = await supabase
    .from('meal_plans')
    .update({
      changelog: [
        { timestamp: new Date().toISOString(), summary },
        ...(cur?.changelog || []),
      ].slice(0, 50),
      updated_at: new Date().toISOString(),
    })
    .eq('id', planId)
  assertNoError(error, 'appendMealPlanChangelog')
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

// ── Custom meals ──────────────────────────────────────────────────────────────

export async function saveCustomMeal(userId, meal) {
  const { data, error } = await supabase
    .from('custom_meals')
    .insert({
      user_id:            userId,
      short_name:         meal.short_name || null,
      meal_name:          meal.meal_name,
      recipe:             meal.recipe || null,
      ingredients:        meal.ingredients || null,
      source_description: meal.source_description || null,
      nutrition:          meal.nutrition || null,
    })
    .select('id')
    .single()
  assertNoError(error, 'saveCustomMeal')
  return data
}

export async function getCustomMeals(userId) {
  const { data, error } = await supabase
    .from('custom_meals')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  assertNoError(error, 'getCustomMeals')
  return data || []
}

export async function updateCustomMeal(id, meal) {
  const { error } = await supabase
    .from('custom_meals')
    .update({
      meal_name:          meal.meal_name,
      short_name:         meal.short_name || null,
      recipe:             meal.recipe || null,
      source_description: meal.source_description || null,
      ingredients:        meal.ingredients || null,
      nutrition:          meal.nutrition || null,
    })
    .eq('id', id)
  assertNoError(error, 'updateCustomMeal')
}

export async function deleteCustomMeal(userId, id) {
  const { error } = await supabase
    .from('custom_meals')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)
  assertNoError(error, 'deleteCustomMeal')
}
