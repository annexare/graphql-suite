import { cpSync } from 'node:fs'
import { join } from 'node:path'

const appDir = join(import.meta.dir, '..', 'app')
const distDir = join(appDir, 'dist')

const result = await Bun.build({
  entrypoints: [join(appDir, 'index.tsx')],
  outdir: distDir,
  target: 'browser',
  minify: true,
  splitting: true,
})

if (!result.success) {
  console.error('Build failed:')
  for (const log of result.logs) {
    console.error(log)
  }
  process.exit(1)
}

// Copy index.html to dist
cpSync(join(appDir, 'index.html'), join(distDir, 'index.html'))

console.log(`SPA built to ${distDir}`)
for (const output of result.outputs) {
  console.log(`  ${output.path} (${(output.size / 1024).toFixed(1)} KB)`)
}
