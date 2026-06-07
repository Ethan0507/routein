import { useState, useEffect } from 'react'
import { Loader2, Search } from 'lucide-react'
import Modal from './Modal'
import { getCustomMeals } from '../lib/db'

export default function MealCataloguePicker({ userId, open, onClose, onSelect }) {
  const [meals, setMeals]   = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (!open || !userId) return
    setLoading(true)
    setSearch('')
    getCustomMeals(userId).then(setMeals).finally(() => setLoading(false))
  }, [userId, open])

  const filtered = search.trim()
    ? meals.filter(m => m.meal_name.toLowerCase().includes(search.trim().toLowerCase()))
    : meals

  return (
    <Modal open={open} onClose={onClose} title="Choose from catalogue">
      <div className="space-y-3">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-textSecondary" />
          <input
            className="w-full border border-border rounded-lg pl-8 pr-3 py-2 text-sm text-textPrimary focus:outline-none focus:border-teal-500"
            placeholder="Search saved meals…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            autoFocus
          />
        </div>

        <div className="space-y-2 max-h-[52vh] overflow-y-auto -mx-1 px-1">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 size={20} className="animate-spin text-teal-500" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-textPrimary font-medium">
                {meals.length === 0 ? 'No saved meals yet' : 'No results'}
              </p>
              <p className="text-xs text-textSecondary mt-1">
                {meals.length === 0 ? 'Add meals in Library → Meals to reuse them here.' : 'Try a different search.'}
              </p>
            </div>
          ) : (
            filtered.map(meal => (
              <button
                key={meal.id}
                onClick={() => onSelect(meal)}
                className="w-full text-left bg-white border border-border rounded-xl p-3 active:bg-teal-50 active:border-teal-200 transition-colors"
              >
                <p className="text-sm font-semibold text-textPrimary">{meal.meal_name}</p>
                {meal.nutrition?.calories != null && (
                  <p className="text-xs text-teal-600 mt-0.5 font-medium">
                    {meal.nutrition.calories} kcal
                    {meal.nutrition.protein != null && ` · ${meal.nutrition.protein}g P`}
                    {meal.nutrition.carbs   != null && ` · ${meal.nutrition.carbs}g C`}
                    {meal.nutrition.fat     != null && ` · ${meal.nutrition.fat}g F`}
                  </p>
                )}
                {meal.source_description && (
                  <p className="text-xs text-textSecondary mt-0.5 line-clamp-1">{meal.source_description}</p>
                )}
              </button>
            ))
          )}
        </div>
      </div>
    </Modal>
  )
}
