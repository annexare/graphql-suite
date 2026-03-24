import { readdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const rootDir = resolve(import.meta.dirname, '..')
const packagesDir = join(rootDir, 'packages')

function resolveVersion(current: string, input: string): string {
  const parts = current.split('.').map(Number)
  if (parts.length !== 3 || parts.some(Number.isNaN)) {
    throw new Error(`Invalid current version: ${current}`)
  }

  switch (input) {
    case 'major':
      return `${parts[0] + 1}.0.0`
    case 'minor':
      return `${parts[0]}.${parts[1] + 1}.0`
    case 'patch':
      return `${parts[0]}.${parts[1]}.${parts[2] + 1}`
    default: {
      if (!/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(input)) {
        throw new Error(
          `Invalid version: ${input}. Use major, minor, patch, or an explicit version.`,
        )
      }
      return input
    }
  }
}

async function updatePackageJson(filePath: string, version: string) {
  const file = Bun.file(filePath)
  const pkg = await file.json()
  pkg.version = version

  // Keep @graphql-suite/* dependencies in sync across all packages
  if (pkg.dependencies) {
    for (const dep of Object.keys(pkg.dependencies)) {
      if (dep.startsWith('@graphql-suite/')) {
        pkg.dependencies[dep] = version
      }
    }
  }

  await Bun.write(file, `${JSON.stringify(pkg, null, 2)}\n`)
}

async function main() {
  const input = process.argv[2]
  if (!input) {
    console.error('Usage: bun run scripts/version-bump.ts <major|minor|patch|x.y.z>')
    process.exit(1)
  }

  const rootPkg = await Bun.file(join(rootDir, 'package.json')).json()
  const newVersion = resolveVersion(rootPkg.version, input)

  const packageJsonPaths = [join(rootDir, 'package.json')]

  const entries = await readdir(packagesDir, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.isDirectory()) {
      packageJsonPaths.push(join(packagesDir, entry.name, 'package.json'))
    }
  }

  await Promise.all(packageJsonPaths.map((p) => updatePackageJson(p, newVersion)))

  console.log(`Updated ${packageJsonPaths.length} packages to v${newVersion}`)

  // Sync bun.lock with updated package.json versions
  console.log('Running `bun install` to sync bun.lock...')
  const result = Bun.spawnSync(['bun', 'install'], {
    cwd: rootDir,
    stdout: 'inherit',
    stderr: 'inherit',
  })
  if (result.exitCode !== 0) {
    throw new Error(`bun install failed with exit code ${result.exitCode}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
