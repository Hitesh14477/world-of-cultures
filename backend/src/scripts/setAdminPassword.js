import { randomBytes, scryptSync } from 'node:crypto'
import { chmod, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

function readHiddenPassword() {
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== 'function') {
    throw new Error('Run this command in an interactive terminal.')
  }

  return new Promise((resolvePassword, reject) => {
    process.stdout.write('Enter the new administrator password (input hidden): ')
    process.stdin.setEncoding('utf8')
    process.stdin.setRawMode(true)
    process.stdin.resume()
    let password = ''

    function finish(error) {
      process.stdin.setRawMode(false)
      process.stdin.pause()
      process.stdin.removeListener('data', onData)
      process.stdout.write('\n')
      if (error) reject(error)
      else resolvePassword(password)
    }

    function onData(chunk) {
      for (const character of chunk) {
        if (character === '\u0003') return finish(new Error('Password setup cancelled.'))
        if (character === '\r' || character === '\n') return finish()
        if (character === '\u007f' || character === '\b') password = [...password].slice(0, -1).join('')
        else if (character >= ' ') password += character
      }
    }

    process.stdin.on('data', onData)
  })
}

const envPath = resolve(process.cwd(), '.env')
try {
  const password = await readHiddenPassword()
  if (password.length < 14 || password.length > 1024) {
    throw new Error('Use an administrator password between 14 and 1024 characters.')
  }

  const salt = randomBytes(16)
  const digest = scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 })
  const encodedHash = `scrypt$${salt.toString('base64url')}$${digest.toString('base64url')}`
  let contents = ''
  try {
    contents = await readFile(envPath, 'utf8')
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }

  const lines = contents.split(/\r?\n/).filter((line) => !/^\s*ADMIN_PASSWORD_HASH\s*=/.test(line))
  while (lines.length && lines.at(-1) === '') lines.pop()
  lines.push(`ADMIN_PASSWORD_HASH=${encodedHash}`)
  await writeFile(envPath, `${lines.join('\n')}\n`, { mode: 0o600 })
  await chmod(envPath, 0o600)
  process.stdout.write('Administrator password hash saved to backend/.env. The password and hash were not displayed.\n')
} catch (error) {
  process.stderr.write(`${error.message}\n`)
  process.exitCode = 1
}
