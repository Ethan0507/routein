import { DEFAULT_MEAL_SLOTS, getActiveSlots } from './utils'

const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY
const MODEL = 'gpt-4o-mini'

const MEAL_SLOTS = ['breakfast', 'midMorning', 'lunch', 'preWorkout', 'postWorkout', 'dinner', 'beforeBed']

// ── Harris-Benedict BMR ───────────────────────────────────────────────────────

function estimateTargets(profile) {
  const weight = parseFloat(profile.weight) || 70
  const height = parseFloat(profile.height) || 170
  const age    = parseFloat(profile.age)    || 25
  const isMale = (profile.sex || '').toLowerCase().startsWith('m')

  const bmr = isMale
    ? 88.362 + 13.397 * weight + 4.799 * height - 5.677 * age
    : 447.593 + 9.247 * weight + 3.098 * height - 4.330 * age

  const activityMap = {
    sedentary:        1.2,
    'lightly active': 1.375,
    'moderately active': 1.55,
    'very active':    1.725,
    'extra active':   1.9,
  }
  const activity = activityMap[(profile.exerciseFrequency || '').toLowerCase()] || 1.55
  const maintenance = Math.round(bmr * activity)
  const proteinG    = Math.round(weight * 1.8)
  const fatG        = Math.round((maintenance * 0.27) / 9)
  const carbsG      = Math.round((maintenance - proteinG * 4 - fatG * 9) / 4)

  return { maintenanceCalories: maintenance, proteinG, carbsG, fatG }
}

// ── Fallback meal templates ───────────────────────────────────────────────────

const FALLBACK_DAYS = [
  {
    breakfast:   { name: 'Oats with Banana & Honey',         recipe: 'Cook oats with milk. Top with sliced banana and drizzle honey.', ingredients: [{ quantity: '60g', name: 'rolled oats' }, { quantity: '1 medium', name: 'banana' }, { quantity: '1 tbsp', name: 'honey' }, { quantity: '250ml', name: 'milk' }] },
    midMorning:  { name: 'Greek Yogurt with Berries',         recipe: 'Serve yogurt topped with fresh mixed berries.', ingredients: [{ quantity: '200g', name: 'greek yogurt' }, { quantity: '80g', name: 'mixed berries' }] },
    lunch:       { name: 'Chicken & Brown Rice Bowl',         recipe: 'Grill chicken breast. Serve over steamed brown rice with mixed greens.', ingredients: [{ quantity: '150g', name: 'chicken breast' }, { quantity: '100g', name: 'brown rice (dry)' }, { quantity: '80g', name: 'mixed greens' }, { quantity: '1 tbsp', name: 'olive oil' }] },
    preWorkout:  { name: 'Banana with Peanut Butter',         recipe: 'Slice banana and serve with peanut butter for dipping.', ingredients: [{ quantity: '1 large', name: 'banana' }, { quantity: '1.5 tbsp', name: 'peanut butter' }] },
    postWorkout: { name: 'Protein Shake',                     recipe: 'Blend protein powder, milk and banana until smooth.', ingredients: [{ quantity: '1 scoop', name: 'whey protein powder' }, { quantity: '250ml', name: 'milk' }, { quantity: '1 small', name: 'banana' }] },
    dinner:      { name: 'Baked Salmon with Vegetables',      recipe: 'Bake salmon at 200°C for 15 min. Steam vegetables. Drizzle with lemon.', ingredients: [{ quantity: '180g', name: 'salmon fillet' }, { quantity: '200g', name: 'mixed vegetables' }, { quantity: '1 tbsp', name: 'olive oil' }, { quantity: '1 wedge', name: 'lemon' }] },
    beforeBed:   { name: 'Cottage Cheese with Honey',         recipe: 'Serve cottage cheese with a drizzle of honey.', ingredients: [{ quantity: '150g', name: 'cottage cheese' }, { quantity: '1 tsp', name: 'honey' }] },
  },
  {
    breakfast:   { name: 'Scrambled Eggs on Toast',           recipe: 'Whisk eggs, cook in butter. Serve on wholegrain toast.', ingredients: [{ quantity: '3 large', name: 'eggs' }, { quantity: '2 slices', name: 'wholegrain bread' }, { quantity: '1 tsp', name: 'butter' }, { quantity: '1 handful', name: 'spinach' }] },
    midMorning:  { name: 'Apple with Almond Butter',          recipe: 'Slice apple and serve with almond butter.', ingredients: [{ quantity: '1 medium', name: 'apple' }, { quantity: '1.5 tbsp', name: 'almond butter' }] },
    lunch:       { name: 'Tuna Salad Wrap',                   recipe: 'Mix tuna with light mayo, fill into a wrap with greens and tomato.', ingredients: [{ quantity: '120g', name: 'canned tuna' }, { quantity: '1 large', name: 'wholegrain wrap' }, { quantity: '1 tbsp', name: 'light mayonnaise' }, { quantity: '60g', name: 'mixed greens' }, { quantity: '1 medium', name: 'tomato' }] },
    preWorkout:  { name: 'Rice Cakes with Honey',             recipe: 'Spread honey on rice cakes for quick carbs.', ingredients: [{ quantity: '3 pieces', name: 'rice cakes' }, { quantity: '1 tbsp', name: 'honey' }] },
    postWorkout: { name: 'Chocolate Milk',                    recipe: 'Mix chocolate powder into cold milk.', ingredients: [{ quantity: '300ml', name: 'milk' }, { quantity: '2 tsp', name: 'chocolate powder' }] },
    dinner:      { name: 'Beef Stir Fry with Noodles',        recipe: 'Stir-fry beef with vegetables and soy sauce. Serve over noodles.', ingredients: [{ quantity: '150g', name: 'lean beef strips' }, { quantity: '100g', name: 'noodles (dry)' }, { quantity: '150g', name: 'stir-fry vegetables' }, { quantity: '2 tbsp', name: 'soy sauce' }, { quantity: '1 tsp', name: 'sesame oil' }] },
    beforeBed:   { name: 'Warm Milk with Cinnamon',           recipe: 'Heat milk and stir in cinnamon.', ingredients: [{ quantity: '250ml', name: 'milk' }, { quantity: '1/4 tsp', name: 'cinnamon' }] },
  },
  {
    breakfast:   { name: 'Smoothie Bowl',                     recipe: 'Blend frozen berries and banana with milk. Pour into bowl and top with granola.', ingredients: [{ quantity: '100g', name: 'frozen mixed berries' }, { quantity: '1 medium', name: 'banana' }, { quantity: '100ml', name: 'milk' }, { quantity: '30g', name: 'granola' }, { quantity: '1 tbsp', name: 'chia seeds' }] },
    midMorning:  { name: 'Hard Boiled Eggs',                  recipe: 'Boil eggs for 10 minutes. Season with salt and pepper.', ingredients: [{ quantity: '2 large', name: 'eggs' }, { quantity: '1 pinch', name: 'salt' }] },
    lunch:       { name: 'Lentil Soup with Bread',            recipe: 'Simmer lentils with onion, garlic and cumin for 25 minutes. Serve with bread.', ingredients: [{ quantity: '150g', name: 'red lentils (dry)' }, { quantity: '1 medium', name: 'onion' }, { quantity: '2 cloves', name: 'garlic' }, { quantity: '1 tsp', name: 'cumin' }, { quantity: '2 slices', name: 'wholegrain bread' }] },
    preWorkout:  { name: 'Dates and Almonds',                 recipe: 'Eat dates and almonds as a quick energy snack.', ingredients: [{ quantity: '4 pieces', name: 'medjool dates' }, { quantity: '20g', name: 'almonds' }] },
    postWorkout: { name: 'Egg White Omelette',                recipe: 'Whisk egg whites, cook in a pan, fill with spinach and cheese.', ingredients: [{ quantity: '4 large', name: 'egg whites' }, { quantity: '40g', name: 'spinach' }, { quantity: '30g', name: 'low-fat cheese' }] },
    dinner:      { name: 'Chicken Pasta',                     recipe: 'Cook pasta. Sauté chicken with garlic and tomato sauce. Combine.', ingredients: [{ quantity: '150g', name: 'chicken breast' }, { quantity: '90g', name: 'whole wheat pasta (dry)' }, { quantity: '150ml', name: 'tomato sauce' }, { quantity: '2 cloves', name: 'garlic' }, { quantity: '1 tbsp', name: 'olive oil' }] },
    beforeBed:   { name: 'Casein Shake',                      recipe: 'Mix casein protein with water or milk.', ingredients: [{ quantity: '1 scoop', name: 'casein protein powder' }, { quantity: '250ml', name: 'milk' }] },
  },
]

function buildFallbackPlan(profile) {
  const targets = estimateTargets(profile)
  const plan = Array.from({ length: 7 }, (_, i) => ({
    day: i + 1,
    ...FALLBACK_DAYS[i % FALLBACK_DAYS.length],
  }))
  return { plan, targets, source: 'fallback' }
}

// ── OpenAI plan generation ────────────────────────────────────────────────────

const REQUIRED_SLOTS = ['breakfast', 'lunch', 'dinner']
const OPTIONAL_SLOTS = ['midMorning', 'preWorkout', 'postWorkout', 'beforeBed']

// Base calorie weight per slot key. Custom slots get a medium snack weight.
const SLOT_CALORIE_WEIGHTS = {
  breakfast:   0.25,
  midMorning:  0.08,
  lunch:       0.30,
  preWorkout:  0.06,
  postWorkout: 0.08,
  dinner:      0.28,
  beforeBed:   0.05,
}

/**
 * Given the active slot list and total daily calories, returns each slot
 * annotated with its proportional calorie target.
 * Weights are normalised so they always sum to 1 regardless of which slots
 * are active — fewer slots means each remaining slot gets a larger share.
 */
function allocateCaloriesPerSlot(activeSlots, maintenanceCalories) {
  const weights  = activeSlots.map(s => SLOT_CALORIE_WEIGHTS[s.key] ?? 0.10)
  const total    = weights.reduce((a, b) => a + b, 0)
  return activeSlots.map((s, i) => ({
    ...s,
    targetKcal: Math.round((weights[i] / total) * maintenanceCalories),
  }))
}

function buildPrompt(profile, options = {}) {
  const { userPrompt, currentPlan, alternate, slots } = options

  const activeSlots = getActiveSlots(slots || DEFAULT_MEAL_SLOTS)

  // Pre-calculate per-slot calorie targets from Harris-Benedict
  const targets    = estimateTargets(profile)
  const slotsWithKcal = allocateCaloriesPerSlot(activeSlots, targets.maintenanceCalories)

  const mealEntry = '{ "name": "<string>", "recipe": "<string>", "ingredients": [{ "quantity": "<string>", "name": "<string>" }] }'
  const slotLines = slotsWithKcal
    .map(s => `      "${s.key}": ${mealEntry}  // ${s.label} (~${s.targetKcal} kcal)`)
    .join(',\n')

  // Per-slot breakdown shown to the AI so it calibrates portion sizes
  const slotTargetLines = slotsWithKcal
    .map(s => `  - ${s.label} (${s.time}): ~${s.targetKcal} kcal`)
    .join('\n')

  const base = `Create a personalized 7-day meal plan for:
- Age: ${profile.age || 'unknown'}
- Sex: ${profile.sex || 'unknown'}
- Height: ${profile.height ? profile.height + ' cm' : 'unknown'}
- Weight: ${profile.weight ? profile.weight + ' kg' : 'unknown'}
- Exercise frequency: ${profile.exerciseFrequency || 'moderately active'}
- Allergies/restrictions: ${profile.allergies || 'none'}
- Daily calorie target: ${targets.maintenanceCalories} kcal (protein ${targets.proteinG}g, carbs ${targets.carbsG}g, fat ${targets.fatG}g)

Per-meal calorie targets (adjust ingredient quantities to hit these):
${slotTargetLines}
${alternate && currentPlan ? '\nProvide DIFFERENT meals from the current plan.' : ''}
${userPrompt ? `\nExtra instruction: ${userPrompt}` : ''}

Return ONLY valid JSON with EXACTLY this structure — no extra keys, no markdown:
{
  "targets": {
    "maintenanceCalories": ${targets.maintenanceCalories},
    "proteinG": ${targets.proteinG},
    "carbsG": ${targets.carbsG},
    "fatG": ${targets.fatG}
  },
  "plan": [
    {
      "day": 1,
${slotLines}
    }
  ]
}

Rules:
- All 7 days required
- Only include the exact meal keys listed above — do not add or rename keys
- Match ingredient quantities so each meal hits its kcal target (±10%)
- Respect every allergy/restriction
- Vary meals — no repeats in first 3 days
- Quantities specific (60g, 1 cup, 2 tbsp)
- Recipes: 1-2 sentences max
- Ingredients: 3-5 per meal max`

  return base
}

export { REQUIRED_SLOTS, OPTIONAL_SLOTS }

export async function generateMealPlanWithLLM(profile, options = {}) {
  if (!OPENAI_API_KEY) {
    console.warn('No OpenAI key — using fallback plan')
    return buildFallbackPlan(profile)
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 120_000)

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.6,
        max_tokens: 12000,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'You create safe, structured 7-day meal plans in strict JSON format. Return only the JSON object with no extra text or markdown. Be concise — keep recipes under 2 sentences and ingredients lists to 3-5 items.' },
          { role: 'user', content: buildPrompt(profile, options) },
        ],
      }),
      signal: controller.signal,
    })

    clearTimeout(timeout)

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err?.error?.message || `OpenAI ${res.status}`)
    }

    const data = await res.json()
    const raw  = data.choices[0].message.content

    let content
    try {
      content = JSON.parse(raw)
    } catch {
      // Truncated response — increase max_tokens or simplify prompt
      throw new Error('AI response was cut off. Please try again.')
    }

    if (!content.plan || !Array.isArray(content.plan) || content.plan.length < 7) {
      throw new Error('AI returned an incomplete plan. Please try again.')
    }

    return { plan: content.plan, targets: content.targets, source: 'llm' }

  } catch (err) {
    clearTimeout(timeout)
    if (err.name === 'AbortError') {
      throw new Error('Request timed out. Please try again.')
    }
    throw err
  }
}

// ── Macro estimation from free text ──────────────────────────────────────────

export async function analyzeLoggedMealDescription(description) {
  if (!OPENAI_API_KEY) {
    return { calories: null, protein: null, carbs: null, fat: null }
  }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0,
      max_tokens: 150,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: 'Estimate macros for the meal described. Return ONLY JSON: { "calories": <int>, "protein": <int>, "carbs": <int>, "fat": <int> }',
        },
        { role: 'user', content: description },
      ],
    }),
  })

  if (!res.ok) throw new Error('Failed to estimate macros')
  const data    = await res.json()
  const content = JSON.parse(data.choices[0].message.content)
  return {
    calories: content.calories || null,
    protein:  content.protein  || null,
    carbs:    content.carbs    || null,
    fat:      content.fat      || null,
  }
}

export { estimateTargets, MEAL_SLOTS }
