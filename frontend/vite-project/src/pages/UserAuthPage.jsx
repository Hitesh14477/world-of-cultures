import { useState } from 'react'
import PasswordField from '../components/PasswordField.jsx'
import { loginUser, registerUser } from '../services/api.js'
import { createUserAuthPayload, passwordConfirmationMatches } from '../services/userAuthForm.js'
import { buildAuthPath, getAuthPrompt, getAuthReturnTo } from '../services/authNavigation.js'

export default function UserAuthPage({ mode }) {
  const registering = mode === 'register'
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordMismatch, setPasswordMismatch] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const returnTo = getAuthReturnTo(window.location.search)

  async function submit(event) {
    event.preventDefault()
    if (busy) return
    const normalizedUsername = username.trim().toLowerCase()
    if (registering && !/^[a-z0-9_]{3,24}$/.test(normalizedUsername)) {
      setMessage('Username must be 3–24 characters using letters, numbers, or underscores.')
      return
    }
    if (registering && !passwordConfirmationMatches(password, confirmPassword)) {
      setPasswordMismatch(true)
      return
    }
    setBusy(true)
    setMessage('')
    try {
      const payload = createUserAuthPayload({ registering, username: normalizedUsername, email, password })
      if (registering) await registerUser(payload)
      else await loginUser(payload)
      window.location.assign(returnTo)
    } catch (error) {
      setMessage(error.response?.data?.message || (registering ? 'Your account could not be created. Please try again.' : 'Sign in failed. Please try again.'))
    } finally {
      setBusy(false)
      setPassword('')
      setConfirmPassword('')
    }
  }

  return <main className="user-auth-page">
    <header className="user-auth-heading">
      <p className="eyebrow">World of Cultures account</p>
      <h1>{registering ? 'Create your account.' : 'Welcome back.'}</h1>
      <p>{registering ? 'Save countries, cultural entries, and places to your own collection.' : 'Sign in to return to your saved collection.'}</p>
      {new URLSearchParams(window.location.search).has('returnTo') && <p className="user-auth-return-message" role="status">{getAuthPrompt(returnTo)}</p>}
    </header>
    <form className="user-auth-form" onSubmit={submit}>
      {message && <p className="user-auth-message" role="alert">{message}</p>}
      {registering && <label>Username<input type="text" name="username" autoComplete="username" required maxLength={24} value={username} onChange={(event) => setUsername(event.target.value)} disabled={busy} aria-describedby="username-hint" /><span className="user-auth-hint" id="username-hint">Use 3–24 letters, numbers, or underscores. Usernames are not case-sensitive.</span></label>}
      <label>Email address<input type="email" autoComplete="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} disabled={busy} /></label>
      <PasswordField
        id="user-password"
        name="password"
        label="Password"
        autoComplete={registering ? 'new-password' : 'current-password'}
        required
        minLength={registering ? 12 : undefined}
        maxLength={128}
        value={password}
        onChange={(event) => {
          const nextPassword = event.target.value
          setPassword(nextPassword)
          if (registering && passwordMismatch) setPasswordMismatch(nextPassword !== confirmPassword)
        }}
        disabled={busy}
        describedBy={registering ? 'password-hint' : undefined}
      />
      {registering && <>
        <PasswordField
          id="confirm-password"
          name="confirmPassword"
          label="Confirm password"
          autoComplete="new-password"
          required
          minLength={12}
          maxLength={128}
          value={confirmPassword}
          onChange={(event) => {
            const nextConfirmPassword = event.target.value
            setConfirmPassword(nextConfirmPassword)
            if (passwordMismatch) setPasswordMismatch(nextConfirmPassword !== password)
          }}
          disabled={busy}
          describedBy={passwordMismatch ? 'password-mismatch' : undefined}
        />
        {passwordMismatch && <p className="user-auth-field-error" id="password-mismatch" role="alert">Passwords do not match. Please check both fields.</p>}
      </>}
      {registering && <span className="user-auth-hint" id="password-hint">Use at least 12 characters.</span>}
      <button className="contribution-submit" type="submit" disabled={busy}>{busy ? 'Please wait…' : registering ? 'Create account' : 'Sign in'}<span aria-hidden="true">→</span></button>
    </form>
    <p className="user-auth-switch">{registering ? 'Already have an account?' : 'New to World of Cultures?'} <a href={buildAuthPath(registering ? 'login' : 'register', returnTo)}>{registering ? 'Sign in' : 'Create an account'}</a></p>
    {!registering && <p className="admin-login-link"><a href="/admin/login">Sign in as administrator</a></p>}
  </main>
}
