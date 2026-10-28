import { useState, type FormEvent } from 'react'
import {
  MIN_PASSWORD_LENGTH,
  newPasswordErrorMessage,
  validateNewPassword,
} from '@/auth/authErrors'
import { AuthShell, authCardClass, PasswordToggle } from '@/components/AuthShell'
import { Button } from '@/components/ui/Button'
import { Field, FormError, TextInput } from '@/components/ui/Field'
import { useAuth } from '@/hooks/useAuth'

/**
 * Na het openen van een resetlink: nieuw wachtwoord kiezen. Pas daarna gaat de app open.
 * "Annuleren" logt uit, zodat de resetsessie niet blijft hangen.
 */
export function ResetPasswordPage({ email }: { email: string }) {
  const { updatePassword, signOut } = useAuth()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [errors, setErrors] = useState<{ password?: string; confirm?: string; form?: string }>({})
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const fieldErrors = validateNewPassword(password, confirm)
    if (Object.keys(fieldErrors).length) return setErrors(fieldErrors)
    setErrors({})
    setBusy(true)
    try {
      await updatePassword(password)
      // Bij succes wisselt AuthProvider vanzelf naar de app.
    } catch (error) {
      setErrors({ form: newPasswordErrorMessage(error) })
      setBusy(false)
    }
  }

  return (
    <AuthShell subtitle={`Kies een nieuw wachtwoord voor ${email}.`}>
      <form onSubmit={submit} noValidate className={authCardClass} aria-busy={busy}>
        <FormError message={errors.form} />
        {/* Verborgen gebruikersnaam: dan slaat de wachtwoordmanager het bij het juiste account op. */}
        <input type="email" name="email" autoComplete="username" value={email} readOnly hidden />
        <Field
          label="Nieuw wachtwoord"
          error={errors.password}
          hint={`Minstens ${MIN_PASSWORD_LENGTH} tekens.`}
        >
          {(p) => (
            <div className="relative">
              <TextInput
                {...p}
                type={showPassword ? 'text' : 'password'}
                name="new-password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pr-20"
                autoFocus
              />
              <PasswordToggle shown={showPassword} onToggle={() => setShowPassword((v) => !v)} />
            </div>
          )}
        </Field>
        <Field label="Herhaal nieuw wachtwoord" error={errors.confirm}>
          {(p) => (
            <TextInput
              {...p}
              type={showPassword ? 'text' : 'password'}
              name="confirm-password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          )}
        </Field>
        <Button type="submit" variant="primary" className="w-full" disabled={busy}>
          {busy ? 'Bezig met opslaan…' : 'Wachtwoord opslaan'}
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="w-full"
          disabled={busy}
          onClick={() => void signOut()}
        >
          Annuleren
        </Button>
      </form>
    </AuthShell>
  )
}
