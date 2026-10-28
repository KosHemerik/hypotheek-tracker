import { useState, type FormEvent } from 'react'
import {
  loginErrorMessage,
  resetRequestErrorMessage,
  validateLogin,
  validateResetEmail,
} from '@/auth/authErrors'
import { AuthNotice, AuthShell, authCardClass, PasswordToggle } from '@/components/AuthShell'
import { Button } from '@/components/ui/Button'
import { Field, FormError, TextInput } from '@/components/ui/Field'
import { useAuth } from '@/hooks/useAuth'

type Mode = 'login' | 'forgot' | 'sent'

const linkClass =
  'cursor-pointer text-sm font-medium text-slate-600 underline-offset-2 hover:text-slate-900 hover:underline'

/**
 * Inloggen met e-mail en wachtwoord, plus "wachtwoord vergeten". Er is bewust geen
 * registratie: het account wordt eenmalig in het Supabase-dashboard aangemaakt (zie README).
 */
export function LoginPage({ notice }: { notice?: string }) {
  const { signIn, requestPasswordReset } = useAuth()
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [errors, setErrors] = useState<{ email?: string; password?: string; form?: string }>({})
  const [busy, setBusy] = useState(false)

  function switchMode(next: Mode) {
    setErrors({})
    setMode(next)
  }

  async function submitLogin(e: FormEvent) {
    e.preventDefault()
    const fieldErrors = validateLogin(email, password)
    if (Object.keys(fieldErrors).length) return setErrors(fieldErrors)
    setErrors({})
    setBusy(true)
    try {
      await signIn(email, password)
      // Bij succes wisselt AuthProvider vanzelf naar de app.
    } catch (error) {
      setErrors({ form: loginErrorMessage(error) })
      setPassword('')
      setBusy(false)
    }
  }

  async function submitForgot(e: FormEvent) {
    e.preventDefault()
    const fieldErrors = validateResetEmail(email)
    if (Object.keys(fieldErrors).length) return setErrors(fieldErrors)
    setErrors({})
    setBusy(true)
    try {
      await requestPasswordReset(email)
      setMode('sent')
    } catch (error) {
      setErrors({ form: resetRequestErrorMessage(error) })
    } finally {
      setBusy(false)
    }
  }

  const emailField = (
    <Field label="E-mailadres" error={errors.email}>
      {(p) => (
        <TextInput
          {...p}
          type="email"
          name="email"
          autoComplete="username"
          inputMode="email"
          autoCapitalize="none"
          spellCheck={false}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoFocus
        />
      )}
    </Field>
  )

  if (mode === 'sent') {
    return (
      <AuthShell subtitle="Controleer je e-mail.">
        <div className={authCardClass}>
          <AuthNotice>
            Als er een account bestaat voor <strong className="font-medium">{email.trim()}</strong>,
            is er een mail met een resetlink verstuurd. De link werkt één keer en verloopt na een
            uur.
          </AuthNotice>
          <p className="text-sm text-slate-500">
            Geen mail ontvangen? Kijk in je spammap of vraag over een minuut een nieuwe link aan.
          </p>
          <Button variant="secondary" className="w-full" onClick={() => switchMode('login')}>
            Terug naar inloggen
          </Button>
        </div>
      </AuthShell>
    )
  }

  if (mode === 'forgot') {
    return (
      <AuthShell subtitle="Vraag een link aan om een nieuw wachtwoord in te stellen.">
        <form onSubmit={submitForgot} noValidate className={authCardClass} aria-busy={busy}>
          <FormError message={errors.form} />
          {emailField}
          <Button type="submit" variant="primary" className="w-full" disabled={busy}>
            {busy ? 'Bezig met versturen…' : 'Resetlink versturen'}
          </Button>
          <div className="text-center">
            <button type="button" className={linkClass} onClick={() => switchMode('login')}>
              Terug naar inloggen
            </button>
          </div>
        </form>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      subtitle="Log in om verder te gaan."
      footer="Privé-app. Nieuwe accounts kunnen niet worden aangemaakt."
    >
      <form onSubmit={submitLogin} noValidate className={authCardClass} aria-busy={busy}>
        <FormError message={errors.form ?? notice} />
        {emailField}
        <Field label="Wachtwoord" error={errors.password}>
          {(p) => (
            <div className="relative">
              <TextInput
                {...p}
                type={showPassword ? 'text' : 'password'}
                name="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pr-20"
              />
              <PasswordToggle shown={showPassword} onToggle={() => setShowPassword((v) => !v)} />
            </div>
          )}
        </Field>
        <Button type="submit" variant="primary" className="w-full" disabled={busy}>
          {busy ? 'Bezig met inloggen…' : 'Inloggen'}
        </Button>
        <div className="text-center">
          <button type="button" className={linkClass} onClick={() => switchMode('forgot')}>
            Wachtwoord vergeten?
          </button>
        </div>
      </form>
    </AuthShell>
  )
}
