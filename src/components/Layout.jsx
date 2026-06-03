import { NavLink, Outlet } from 'react-router-dom'
import { UtensilsCrossed, ShoppingCart, CalendarCheck, BarChart2 } from 'lucide-react'

const tabs = [
  { to: '/diet',      label: 'Diet',      Icon: UtensilsCrossed },
  { to: '/groceries', label: 'Groceries', Icon: ShoppingCart },
  { to: '/routine',   label: 'Routine',   Icon: CalendarCheck },
  { to: '/insights',  label: 'Insights',  Icon: BarChart2 },
]

export default function Layout() {
  return (
    <div className="flex flex-col w-full max-w-mobile min-h-screen min-h-dvh bg-bg relative">
      {/* Main scrollable area */}
      <div className="flex-1 overflow-y-auto pb-20">
        <Outlet />
      </div>

      {/* Bottom tab bar */}
      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-mobile bg-white border-t border-border z-40">
        <div className="flex">
          {tabs.map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex-1 flex flex-col items-center py-2.5 gap-0.5 text-[11px] font-medium transition-colors ${
                  isActive ? 'text-teal-500' : 'text-textSecondary'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon size={22} strokeWidth={isActive ? 2.2 : 1.8} />
                  {label}
                </>
              )}
            </NavLink>
          ))}
        </div>
        {/* iOS home indicator spacer */}
        <div className="h-safe-bottom" style={{ height: 'env(safe-area-inset-bottom, 0px)' }} />
      </nav>
    </div>
  )
}
