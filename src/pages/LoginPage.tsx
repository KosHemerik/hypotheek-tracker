import { useState, type FormEvent } from 'react'
import { loginErrorMessage, validateLogin } from '@/auth/authErrors'
import { Button } from '@/components/ui/Button'
import { Field, FormError, TextInput } from '@/components/ui/Field'
import { HouseIcon } from '@/components/ui/icons'
import { useAuth } from '@/hooks/useAuth'

/**
 * Inloggen met e-mail en wachtwoord. Er is bewust geen registratie: het account wordt
 * eenmalig in het Supabase-dashboard aangemaakt (zie README).
 */
export function LoginPage() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [errors, setErrors] = useState<{ email?: string; password?: string; form?: string }>({})
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
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

  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <span className="flex size-11 items-center justify-center rounded-xl bg-slate-900 text-white">
            <HouseIcon className="size-5" />
          </span>
          <h1 className="mt-4 text-xl font-semibold tracking-tight">Hypotheek Tracker</h1>
          <p className="mt-1 text-sm text-slate-500">Log in om verder te gaan.</p>
        </div>

        <form
          onSubmit={submit}
          noValidate
          className="space-y-4 rounded-xl bg-white p-5 ring-1 ring-slate-200 sm:p-6"
          aria-busy={busy}
        >
          <FormError message={errors.form} />
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
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-pressed={showPassword}
                  className="absolute inset-y-0 right-0 cursor-pointer rounded-r-lg px-3 text-xs font-medium text-slate-500 hover:text-slate-900"
                >
                  {showPassword ? 'Verbergen' : 'Tonen'}
                </button>
              </div>
            )}
          </Field>
          <Button type="submit" variant="primary" className="w-full" disabled={busy}>
            {busy ? 'Bezig met inloggen…' : 'Inloggen'}
          </Button>
        </form>

        <p className="mt-6 text-center text-xs text-slate-400">
          Privé-app. Nieuwe accounts kunnen niet worden aangemaakt.
        </p>
      </div>
    </div>
  )
}
