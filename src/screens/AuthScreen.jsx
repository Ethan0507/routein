import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { Mail, ArrowLeft, Loader2 } from 'lucide-react'

export default function AuthScreen() {
  const [step, setStep]         = useState('email')
  const [email, setEmail]       = useState('')
  const [otp, setOtp]           = useState(['', '', '', '', '', ''])
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [resendCd, setResendCd] = useState(0)
  const inputRefs = useRef([])
  const timerRef  = useRef(null)

  useEffect(() => {
    if (resendCd > 0) {
      timerRef.current = setTimeout(() => setResendCd(c => c - 1), 1000)
    }
    return () => clearTimeout(timerRef.current)
  }, [resendCd])

  async function sendOtp(e) {
    e?.preventDefault()
    const trimmed = email.trim().toLowerCase()
    if (!trimmed) return
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: { shouldCreateUser: true },
    })
    setLoading(false)
    if (error) { setError(error.message); return }
    setStep('otp')
    setResendCd(60)
    setTimeout(() => inputRefs.current[0]?.focus(), 100)
  }

  async function verifyWithToken(token) {
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token,
      type: 'email',
    })
    setLoading(false)
    if (error) {
      setError('Invalid or expired code. Please try again.')
      setOtp(['', '', '', '', '', ''])
      setTimeout(() => inputRefs.current[0]?.focus(), 50)
    }
    // On success AuthContext picks up the new session automatically
  }

  function handleOtpChange(idx, val) {
    const char = val.replace(/\D/g, '').slice(-1)
    const next = [...otp]
    next[idx] = char
    setOtp(next)
    if (char && idx < 5) inputRefs.current[idx + 1]?.focus()
    if (char && idx === 5) {
      const full = next.join('')
      if (full.length === 6) verifyWithToken(full)
    }
  }

  function handleOtpKeyDown(idx, e) {
    if (e.key === 'Backspace' && !otp[idx] && idx > 0) {
      inputRefs.current[idx - 1]?.focus()
    }
  }

  function handlePaste(e) {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (pasted.length === 6) {
      setOtp(pasted.split(''))
      verifyWithToken(pasted)
      e.preventDefault()
    }
  }

  return (
    <div className="min-h-screen min-h-dvh bg-bg flex items-center justify-center px-5">
      <div className="w-full max-w-[360px]">

        {/* Branding */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-teal-500 rounded-2xl mb-4">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 3h7v7H3z"/><path d="M14 3h7v7h-7z"/><path d="M3 14h7v7H3z"/>
              <path d="M17.5 14v7M14 17.5h7"/>
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-textPrimary">Daily Tracker</h1>
          <p className="text-sm text-textSecondary mt-1">Your health, routines & meals</p>
        </div>

        {step === 'email' ? (
          <form onSubmit={sendOtp} className="space-y-4">
            <div>
              <label className="text-sm font-medium text-textPrimary block mb-1.5">Email address</label>
              <div className="relative">
                <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-textSecondary" />
                <input
                  type="email"
                  autoComplete="email"
                  autoFocus
                  placeholder="you@example.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full border border-border rounded-xl pl-9 pr-4 py-3 text-sm text-textPrimary focus:outline-none focus:border-teal-500 bg-white"
                />
              </div>
            </div>
            {error && (
              <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
            )}
            <button
              type="submit"
              disabled={!email.trim() || loading}
              className="w-full bg-teal-500 text-white font-semibold py-3 rounded-xl flex items-center justify-center gap-2 disabled:opacity-50 active:bg-teal-600"
            >
              {loading ? <Loader2 size={18} className="animate-spin" /> : 'Send code'}
            </button>
            <p className="text-xs text-textSecondary text-center">
              We'll send a 6-digit code to your email. No password needed.
            </p>
          </form>

        ) : (
          <div className="space-y-5">
            <button
              onClick={() => { setStep('email'); setError(''); setOtp(['','','','','','']) }}
              className="flex items-center gap-1.5 text-sm text-textSecondary -mt-2"
            >
              <ArrowLeft size={15} /> Back
            </button>

            <div>
              <p className="text-base font-semibold text-textPrimary">Check your email</p>
              <p className="text-sm text-textSecondary mt-0.5">
                We sent a 6-digit code to{' '}
                <span className="font-medium text-textPrimary">{email}</span>
              </p>
            </div>

            {/* 6-digit input */}
            <div className="flex gap-2.5 justify-center" onPaste={handlePaste}>
              {otp.map((digit, idx) => (
                <input
                  key={idx}
                  ref={el => inputRefs.current[idx] = el}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={e => handleOtpChange(idx, e.target.value)}
                  onKeyDown={e => handleOtpKeyDown(idx, e)}
                  className={`w-11 text-center text-xl font-bold border rounded-xl focus:outline-none transition-colors bg-white ${
                    digit ? 'border-teal-500 text-teal-600' : 'border-border text-textPrimary'
                  } focus:border-teal-500`}
                  style={{ height: '3.25rem' }}
                />
              ))}
            </div>

            {error && (
              <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2 text-center">{error}</p>
            )}

            {loading && (
              <div className="flex justify-center">
                <Loader2 size={20} className="animate-spin text-teal-500" />
              </div>
            )}

            <div className="text-center pt-1">
              {resendCd > 0 ? (
                <p className="text-xs text-textSecondary">Resend code in {resendCd}s</p>
              ) : (
                <button onClick={sendOtp} className="text-sm text-teal-500 font-medium">
                  Resend code
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
