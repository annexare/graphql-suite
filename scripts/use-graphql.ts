/**
 * Pin the workspace to a graphql major and reinstall.
 *
 * `@graphql-suite/schema` supports graphql 16 and 17, and CI runs the suite
 * against both. Use this to reproduce either lane locally:
 *
 *   bun run scripts/use-graphql.ts 17
 *   bun run --filter '@graphql-suite/*' test
 *   bun run scripts/use-graphql.ts 16   # back to the committed default
 *
 * Only the library packages are checked against graphql 17 — `example-news-app`
 * depends on graphql-yoga 5, whose peer range still tops out at graphql 16.
 */
import { join, resolve } from 'node:path'

// Versions each major is tested against. Bump when a new release should be
// covered; `16` doubles as the version committed to the catalog.
const PINS: Record<string, string> = {
  '16': '16.13.2',
  '17': '17.0.2',
}

const requested = process.argv[2]
if (!requested) {
  console.error('Usage: bun run scripts/use-graphql.ts <16|17|exact-version>')
  process.exit(1)
}

const version = PINS[requested] ?? requested
// Anchored, so a typo like "17.0.2x" is rejected rather than written to the
// catalog for `bun install` to fail on later. Prerelease tags are allowed.
if (!/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(version)) {
  console.error(
    `Unknown graphql version "${requested}". Known majors: ${Object.keys(PINS).join(', ')}`,
  )
  process.exit(1)
}

const rootDir = resolve(import.meta.dirname, '..')
const pkgPath = join(rootDir, 'package.json')
const pkg = await Bun.file(pkgPath).json()

const catalog = pkg.workspaces?.catalog
if (!catalog) {
  console.error('No workspaces.catalog found in the root package.json')
  process.exit(1)
}

if (catalog.graphql === version) {
  console.log(`graphql already pinned to ${version}`)
} else {
  catalog.graphql = version
  await Bun.write(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`)
  console.log(`Pinned graphql to ${version}`)
}

const install = Bun.spawn(['bun', 'install'], {
  cwd: rootDir,
  stdout: 'inherit',
  stderr: 'inherit',
})
process.exit(await install.exited)
