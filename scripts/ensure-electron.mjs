import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)
const electronPackagePath = require.resolve('electron/package.json')
const electronDirectory = dirname(electronPackagePath)
const electronPackage = JSON.parse(readFileSync(electronPackagePath, 'utf8'))
const executableName = process.platform === 'win32' ? 'electron.exe' : 'electron'
const executablePath = join(electronDirectory, 'dist', executableName)

if (existsSync(executablePath)) {
  console.log(`[electron] Runtime ${electronPackage.version} is ready.`)
  process.exit(0)
}

const defaultMirror = 'https://npmmirror.com/mirrors/electron/'
const mirror = process.env.ELECTRON_MIRROR || defaultMirror

console.log(`[electron] Runtime ${electronPackage.version} is missing; downloading it once...`)
console.log(`[electron] Download source: ${mirror}`)

const result = spawnSync(process.execPath, [join(electronDirectory, 'install.js')], {
  stdio: 'inherit',
  env: {
    ...process.env,
    ELECTRON_MIRROR: mirror
  }
})

if (result.error) {
  console.error(`[electron] Failed to start installer: ${result.error.message}`)
  process.exit(1)
}

if (result.status !== 0 || !existsSync(executablePath)) {
  console.error('[electron] Runtime installation failed.')
  console.error('[electron] You can set ELECTRON_MIRROR to another download source and retry.')
  process.exit(result.status || 1)
}

console.log(`[electron] Runtime ${electronPackage.version} installed successfully.`)
