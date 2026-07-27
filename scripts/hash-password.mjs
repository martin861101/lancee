import { randomBytes, scryptSync } from 'node:crypto'

if (!process.stdin.isTTY) {
  throw new Error('Run this command in an interactive terminal.')
}

process.stdout.write('Admin password: ')
process.stdin.setRawMode(true)
process.stdin.resume()
process.stdin.setEncoding('utf8')

let password = ''

process.stdin.on('data', (chunk) => {
  for (const character of chunk) {
    if (character === '\u0003') {
      process.stdin.setRawMode(false)
      process.stdout.write('\n')
      process.exit(130)
    }
    if (character === '\r' || character === '\n') {
      process.stdin.setRawMode(false)
      process.stdin.pause()
      process.stdout.write('\n')
      if (password.length < 12) {
        throw new Error('Use a password with at least 12 characters.')
      }
      const salt = randomBytes(24).toString('hex')
      const hash = scryptSync(password, salt, 64).toString('hex')
      password = ''
      process.stdout.write(`ADMIN_PASSWORD_SALT=${salt}\n`)
      process.stdout.write(`ADMIN_PASSWORD_HASH=${hash}\n`)
      return
    }
    if (character === '\u007f') {
      password = password.slice(0, -1)
      continue
    }
    password += character
  }
})
