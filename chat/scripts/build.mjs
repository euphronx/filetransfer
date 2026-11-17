import { spawn } from 'node:child_process'
import { rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
await rm(path.join(root, 'dist'), { recursive: true, force: true })

const cli = path.join(root, 'node_modules', '@rspack', 'cli', 'bin', 'rspack.js')
const child = spawn(process.execPath, [cli, 'build', '-c', 'rspack.config.ts'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, NODE_ENV: 'production' },
})

const code = await new Promise((resolve, reject) => {
  child.on('error', reject)
  child.on('exit', resolve)
})
if (code !== 0) {
  process.exit(typeof code === 'number' ? code : 1)
}
