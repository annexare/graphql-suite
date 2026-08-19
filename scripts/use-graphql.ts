/**
 * Pin the workspace to a graphql version and reinstall.
 *
 * `@graphql-suite/schema` supports graphql 16 and 17, and CI runs the suite
 * against the floor, the newest 16 and the newest 17. Use this to reproduce any
 * of those lanes locally:
 *
 *   bun run scripts/use-graphql.ts 17     # or: min, 16, or an exact version
 *   bun run check-types && bun run test
 *   bun run scripts/use-graphql.ts 16     # back to the committed default
 *
 * The whole workspace runs on every supported version, `example-news-app`
 * included — graphql-yoga accepts graphql 17 from 5.22.0 onwards.
 */
import { join, resolve } from 'node:path'

// Shorthands for the versions CI covers. `16` is the version committed to the
// catalog; `min` is the floor the schema package's peer range declares, and the
// reason it is 16.4.0 is that `getArgumentValues` became a root export there.
// Keep these in step with the matrix in .github/workflows/ci.yml.
const pins: Record<string, string> = {
  min: '16.4.0',
  '16': '16.13.2',
  '17': '17.0.2',
}

const requested = process.argv[2]
if (!requested) {
  console.error('Usage: bun run scripts/use-graphql.ts <min|16|17|exact-version>')
  process.exit(1)
}

const version = pins[requested] ?? requested
// The official SemVer pattern, so a typo like "17.0.2x" is rejected rather than
// written to the catalog for `bun install` to fail on later, while real
// prerelease and build tags — `17.0.0-rc.0`, `16.1.0-experimental-stream-defer.6`
// — still go through. https://semver.org/#is-there-a-suggested-regular-expression-regex-to-check-a-semver-string
const semver =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/

if (!semver.test(version)) {
  console.error(
    `Unknown graphql version "${requested}". Known shorthands: ${Object.keys(pins).join(', ')}`,
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
