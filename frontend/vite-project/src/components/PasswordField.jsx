import { useState } from 'react'

export default function PasswordField({
  id,
  label,
  name = 'password',
  value,
  onChange,
  autoComplete,
  required = false,
  minLength,
  maxLength,
  disabled = false,
  describedBy,
  onBlur,
}) {
  const [visible, setVisible] = useState(false)
  const inputId = id || name

  return <div className="password-field">
    <label htmlFor={inputId}>{label}</label>
    <div className="password-input-wrap">
      <input
        id={inputId}
        name={name}
        type={visible ? 'text' : 'password'}
        autoComplete={autoComplete}
        required={required}
        minLength={minLength}
        maxLength={maxLength}
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        disabled={disabled}
        aria-describedby={describedBy}
      />
      <button
        className="password-visibility-toggle"
        type="button"
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
        onClick={() => setVisible((current) => !current)}
        disabled={disabled}
      >
        {visible ? <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
          <path d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8" />
          <path d="M9.9 5.2A10.7 10.7 0 0112 5c5.2 0 8.7 4.4 9.5 6.2a1.8 1.8 0 010 1.6 13 13 0 01-3.2 4.1M6.2 6.2a13 13 0 00-3.7 5 1.8 1.8 0 000 1.6A10.8 10.8 0 0012 19a9.8 9.8 0 003-.5" />
        </svg> : <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
          <path d="M2.5 12s3.4-6 9.5-6 9.5 6 9.5 6-3.4 6-9.5 6-9.5-6-9.5-6z" />
          <circle cx="12" cy="12" r="2.5" />
        </svg>}
      </button>
    </div>
  </div>
}
