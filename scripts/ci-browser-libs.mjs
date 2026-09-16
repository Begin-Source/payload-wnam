import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)

/** Workers Builds has no root access. Extract missing distro libraries into this build only. */
export function browserLibraryEnvironment() {
  const testDir = dirname(require.resolve('@playwright/test/package.json'))
  const playwrightDir = dirname(require.resolve('playwright/package.json', { paths: [testDir] }))
  const coreDir = dirname(require.resolve('playwright-core/package.json', { paths: [playwrightDir] }))
  const { registry } = require(join(coreDir, 'lib/server/registry/index.js'))
  const executable = registry.findExecutable('chromium-headless-shell').executablePath()
  const root = resolve('.cloudflare-ci/browser-libs')
  const libraryPath = [join(root, 'usr/lib/x86_64-linux-gnu'), join(root, 'lib/x86_64-linux-gnu'), process.env.LD_LIBRARY_PATH].filter(Boolean).join(':')
  const env = { ...process.env, LD_LIBRARY_PATH: libraryPath }
  const missing = () => [...execFileSync('ldd', [executable], { encoding: 'utf8', env }).matchAll(/(\S+) => not found/g)].map(m => m[1])
  let libs = missing()
  if (!libs.length) return { LD_LIBRARY_PATH: libraryPath }
  const os = Object.fromEntries(readFileSync('/etc/os-release', 'utf8').split('\n').filter(line => line.includes('=')).map(line => { const i = line.indexOf('='); return [line.slice(0, i), line.slice(i + 1).replace(/^"|"$/g, '')] }))
  const { deps } = require(join(coreDir, 'lib/server/registry/nativeDeps.js'))
  const platform = deps[`${os.ID}${os.VERSION_ID}-${process.arch}`]
  if (!platform || process.arch !== 'x64') throw new Error('Unsupported browser CI image; update library mapping')
  const dir = resolve('.cloudflare-ci/browser-packages')
  const lists = resolve('.cloudflare-ci/apt-lists')
  const cache = resolve('.cloudflare-ci/apt-cache')
  for (const path of [root, dir, join(lists, 'partial'), cache]) mkdirSync(path, { recursive: true })
  const aptOptions = ['-o', `Dir::State::lists=${lists}`, '-o', `Dir::Cache=${cache}`, '-o', 'Debug::NoLocking=1']
  execFileSync('apt-get', [...aptOptions, 'update'], { cwd: dir, stdio: 'inherit' })
  for (let attempt = 0; attempt < 3 && libs.length; attempt++) {
    const packages = [...new Set(libs.map(lib => {
      const name = platform.lib2package[lib]
      if (!name) throw new Error(`No distro package mapping for ${lib}`)
      return name
    }))]
    const depends = execFileSync('apt-cache', [...aptOptions, 'depends', '--recurse', '--no-recommends', '--no-suggests', '--no-conflicts', '--no-breaks', '--no-replaces', '--no-enhances', ...packages], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 })
    const candidates = new Set([...packages, ...[...depends.matchAll(/^\s*(?:Pre)?Depends:\s+([^<\s][^\s]*)/gm)].map(match => match[1])])
    const download = [...candidates].filter(name => {
      if (packages.includes(name)) return true
      try { return execFileSync('dpkg-query', ['-W', '-f=${db:Status-Status}', name], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() !== 'installed' }
      catch { return true }
    })
    console.log(JSON.stringify({ event: 'browser_ci_libraries', missing: libs, packages: download }))
    execFileSync('apt-get', [...aptOptions, 'download', ...download], { cwd: dir, stdio: 'inherit' })
    for (const file of readdirSync(dir).filter(file => file.endsWith('.deb'))) execFileSync('dpkg-deb', ['-x', join(dir, file), root])
    libs = missing()
  }
  if (libs.length) throw new Error(`Browser libraries still missing: ${libs.join(', ')}`)
  return { LD_LIBRARY_PATH: libraryPath }
}
