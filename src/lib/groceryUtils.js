// ── Unit normalisation ────────────────────────────────────────────────────────

const WEIGHT_TO_G = {
  g: 1, gram: 1, grams: 1,
  kg: 1000,
  mg: 0.001,
  oz: 28.35, ounce: 28.35, ounces: 28.35,
  lb: 453.6, pound: 453.6, pounds: 453.6,
}

const VOLUME_TO_ML = {
  ml: 1, milliliter: 1, millilitre: 1,
  l: 1000, liter: 1000, litre: 1000,
  dl: 100,
  cup: 240, cups: 240,
  tbsp: 15, tablespoon: 15, tablespoons: 15,
  tsp: 5,  teaspoon: 5,   teaspoons: 5,
  'fl oz': 30,
}

function parseFraction(s) {
  if (s.includes('/')) {
    const [n, d] = s.split('/')
    return parseFloat(n) / parseFloat(d)
  }
  return parseFloat(s)
}

/**
 * Parses a quantity string like "60g", "1.5 cups", "2 tbsp" into
 * { value, unit, baseUnit ('g' | 'ml' | 'unit'), normalized }
 */
export function parseQuantity(str) {
  if (!str) return { value: 1, unit: 'unit', baseUnit: 'unit', normalized: 1 }

  const s = str.toLowerCase().trim()
  // Match: optional leading number + optional unit text
  const m = s.match(/^([\d./]+)\s*(.*)$/)
  if (!m) return { value: 1, unit: 'unit', baseUnit: 'unit', normalized: 1 }

  const value   = parseFraction(m[1]) || 1
  const rawUnit = m[2].trim()
  // Singular form (remove trailing 's' only for known plurals handled above)
  const unit = rawUnit

  if (WEIGHT_TO_G[unit] !== undefined) {
    return { value, unit, baseUnit: 'g',  normalized: value * WEIGHT_TO_G[unit] }
  }
  if (VOLUME_TO_ML[unit] !== undefined) {
    return { value, unit, baseUnit: 'ml', normalized: value * VOLUME_TO_ML[unit] }
  }
  // Count-based (pieces, medium, large, cloves, scoops, slices, wedge, handful…)
  return { value, unit: unit || 'unit', baseUnit: 'unit', normalized: value }
}

/** Format a normalised value back to a human-readable string */
export function formatNormalized(value, baseUnit) {
  if (baseUnit === 'g') {
    if (value >= 1000) return `${+(value / 1000).toFixed(2)}kg`
    return `${Math.round(value)}g`
  }
  if (baseUnit === 'ml') {
    if (value >= 1000) return `${+(value / 1000).toFixed(2)}L`
    return `${Math.round(value)}ml`
  }
  return `${Math.round(value * 100) / 100}`
}

// ── Plan aggregation ──────────────────────────────────────────────────────────

/**
 * Aggregates every ingredient across all days of a meal plan into
 * deduplicated, normalised grocery items.
 *
 * Returns:
 *   { key, name, totalNeeded, baseUnit, display }[]
 *   sorted alphabetically by name.
 */
export function aggregateGroceriesFromPlan(plan) {
  if (!plan?.length) return []

  const map = {} // key → { name, slices: ParsedQty[], baseUnit }

  for (const day of plan) {
    for (const [slotKey, meal] of Object.entries(day)) {
      if (slotKey === 'day' || !meal?.ingredients) continue
      for (const ing of meal.ingredients) {
        if (!ing?.name) continue
        const key    = ing.name.toLowerCase().trim()
        const parsed = parseQuantity(ing.quantity)

        if (!map[key]) {
          map[key] = { key, name: ing.name, slices: [], baseUnit: parsed.baseUnit }
        }
        map[key].slices.push(parsed)

        // Promote base unit: g > ml > unit
        if (parsed.baseUnit === 'g') {
          map[key].baseUnit = 'g'
        } else if (parsed.baseUnit === 'ml' && map[key].baseUnit === 'unit') {
          map[key].baseUnit = 'ml'
        }
      }
    }
  }

  return Object.values(map)
    .map(item => {
      const bu          = item.baseUnit
      const totalNeeded = item.slices.reduce((sum, q) => {
        // Only sum slices whose base unit matches the promoted unit
        return sum + (q.baseUnit === bu ? q.normalized : q.value)
      }, 0)

      return {
        key:         item.key,
        name:        item.name,
        totalNeeded: Math.ceil(totalNeeded * 100) / 100,
        baseUnit:    bu,
        display:     formatNormalized(totalNeeded, bu),
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Computes the deductions to apply to haveState after logging a meal.
 * Returns { [key]: amount } where amount is in the ingredient's base unit.
 */
export function computeMealDeductions(ingredients) {
  const deductions = {}
  for (const ing of ingredients || []) {
    if (!ing?.name) continue
    const key    = ing.name.toLowerCase().trim()
    const parsed = parseQuantity(ing.quantity)
    deductions[key] = (deductions[key] || 0) + parsed.normalized
  }
  return deductions
}

/**
 * Applies deductions to haveState, flooring at 0.
 * haveState: { [key]: number }
 * deductions: { [key]: number }
 */
export function applyDeductions(haveState, deductions) {
  const next = { ...haveState }
  for (const [key, amount] of Object.entries(deductions)) {
    const current = next[key] ?? 0
    next[key] = Math.max(0, current - amount)
  }
  return next
}
