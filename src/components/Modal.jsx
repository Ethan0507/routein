export default function Modal({ open, onClose, title, children }) {
  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ background: 'rgba(0,0,0,0.4)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-mobile bg-white rounded-t-2xl p-5 pb-8 shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        {title && (
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-textPrimary">{title}</h3>
            <button
              onClick={onClose}
              className="text-textSecondary hover:text-textPrimary p-1 -mr-1"
            >
              ✕
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  )
}
