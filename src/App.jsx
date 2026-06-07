import { useState, useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { getProfile } from './lib/db'
import Layout            from './components/Layout'
import AuthScreen        from './screens/AuthScreen'
import OnboardingScreen  from './screens/OnboardingScreen'
import PlanReviewScreen  from './screens/PlanReviewScreen'
import DietScreen        from './screens/DietScreen'
import GroceryScreen     from './screens/GroceryScreen'
import RoutineScreen     from './screens/RoutineScreen'
import InsightsScreen    from './screens/InsightsScreen'
import LibraryScreen     from './screens/LibraryScreen'

// App states: loading → auth | onboarding | reviewing | app
function AppRoutes() {
  const { user, loading: authLoading } = useAuth()
  const [appState, setAppState]   = useState('loading')
  const [planData, setPlanData]   = useState(null)

  useEffect(() => {
    if (authLoading) return
    if (!user) { setAppState('auth'); return }
    // Check onboarding status
    getProfile(user.id).then(profile => {
      if (!profile || !profile.onboarding_complete) {
        setAppState('onboarding')
      } else if (!profile.plan_accepted) {
        // Onboarding done but plan not yet accepted — shouldn't normally happen
        setAppState('onboarding')
      } else {
        setAppState('app')
      }
    }).catch(() => setAppState('onboarding'))
  }, [user, authLoading])

  if (appState === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg">
        <div className="w-8 h-8 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (appState === 'auth') return <AuthScreen />

  if (appState === 'onboarding') {
    return (
      <OnboardingScreen
        onPlanGenerated={data => { setPlanData(data); setAppState('reviewing') }}
      />
    )
  }

  if (appState === 'reviewing' && planData) {
    return (
      <PlanReviewScreen
        planData={planData}
        onAccepted={() => { setPlanData(null); setAppState('app') }}
      />
    )
  }

  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Navigate to="/routine" replace />} />
        <Route path="diet"      element={<DietScreen />} />
        <Route path="groceries" element={<GroceryScreen />} />
        <Route path="routine"   element={<RoutineScreen />} />
        <Route path="insights"  element={<InsightsScreen />} />
        <Route path="library"   element={<LibraryScreen />} />
        <Route path="*"         element={<Navigate to="/routine" replace />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  )
}
