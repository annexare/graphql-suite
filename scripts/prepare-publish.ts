import { mkdir, readdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const rootDir = resolve(import.meta.dirname, '..')
const packagesDir = join(rootDir, 'packages')
const distDir = join(rootDir, 'dist')
const GITHUB_PACKAGES = 'https://github.com/annexare/drizzle-graphql-suite/tree/main/packages'
const ALIAS_REPOSITORY = {
  type: 'git',
  url: 'https://github.com/annexare/drizzle-graphql-suite.git',
}

// ─── Catalog resolution ──────────────────────────────────────

async function loadCatalog(): Promise<Record<string, string>> {
  const rootPkg = await Bun.file(join(rootDir, 'package.json')).json()
  const workspaces = rootPkg.workspaces
  if (typeof workspaces === 'object' && !Array.isArray(workspaces)) {
    return workspaces.catalog ?? {}
  }
  return {}
}

function resolveCatalogRefs(
  deps: Record<string, string> | undefined,
  catalog: Record<string, string>,
): Record<string, string> | undefined {
  if (!deps) return undefined
  const resolved: Record<string, string> = {}
  const missing: string[] = []
  for (const [name, version] of Object.entries(deps)) {
    if (version === 'catalog:') {
      if (!catalog[name]) {
        missing.push(name)
      }
      resolved[name] = catalog[name] ?? version
    } else {
      resolved[name] = version
    }
  }
  if (missing.length) {
    throw new Error(`Unresolved catalog: references: ${missing.join(', ')}`)
  }
  return resolved
}

// ─── Package preparation ─────────────────────────────────────

const FIELDS_TO_COPY = [
  'name',
  'version',
  'description',
  'license',
  'author',
  'repository',
  'homepage',
  'keywords',
  'type',
] as const

const ALIAS_PACKAGES = ['schema', 'client', 'query'] as const

async function preparePackage(packageDir: string, catalog: Record<string, string>) {
  const srcPkg = await Bun.file(join(packageDir, 'package.json')).json()
  const pkgDistDir = join(packageDir, 'dist')

  await mkdir(pkgDistDir, { recursive: true })

  // biome-ignore lint/suspicious/noExplicitAny: building dynamic object
  const publishPkg: Record<string, any> = {}

  for (const field of FIELDS_TO_COPY) {
    if (srcPkg[field] !== undefined) {
      publishPkg[field] = srcPkg[field]
    }
  }

  publishPkg.publishConfig = { access: 'public' }
  publishPkg.main = './index.js'
  publishPkg.types = './index.d.ts'
  publishPkg.exports = {
    '.': {
      types: './index.d.ts',
      import: './index.js',
    },
  }

  const resolvedDeps = resolveCatalogRefs(srcPkg.dependencies, catalog)
  if (resolvedDeps) {
    publishPkg.dependencies = resolvedDeps
  }

  const resolvedPeers = resolveCatalogRefs(srcPkg.peerDependencies, catalog)
  if (resolvedPeers) {
    publishPkg.peerDependencies = resolvedPeers
  }

  await Bun.write(join(pkgDistDir, 'package.json'), `${JSON.stringify(publishPkg, null, 2)}\n`)

  // Copy README with relative links rewritten to absolute GitHub URLs
  const readmeFile = Bun.file(join(packageDir, 'README.md'))
  if (await readmeFile.exists()) {
    let readme = await readmeFile.text()
    readme = readme.replace(/\.\.\/(schema|client|query)\/README\.md/g, `${GITHUB_PACKAGES}/$1`)
    await Bun.write(join(pkgDistDir, 'README.md'), readme)
  }

  // Copy root LICENSE
  const licenseFile = Bun.file(join(rootDir, 'LICENSE'))
  if (await licenseFile.exists()) {
    await Bun.write(join(pkgDistDir, 'LICENSE'), licenseFile)
  }

  console.log(`Prepared ${srcPkg.name} for publishing`)
}

async function prepareUmbrellaVariant(
  name: string,
  scope: string,
  catalog: Record<string, string>,
) {
  const rootPkg = await Bun.file(join(rootDir, 'package.json')).json()
  const targetDir = join(distDir, name)

  await mkdir(targetDir, { recursive: true })

  const wrapperWrites = ALIAS_PACKAGES.flatMap((pkg) => {
    const content = `export * from '${scope}/${pkg}'\n`
    return [
      Bun.write(join(targetDir, `${pkg}.js`), content),
      Bun.write(join(targetDir, `${pkg}.d.ts`), content),
    ]
  })

  // biome-ignore lint/suspicious/noExplicitAny: building dynamic object
  const dependencies: Record<string, any> = {}
  // biome-ignore lint/suspicious/noExplicitAny: building dynamic object
  const peerDependencies: Record<string, any> = {}

  for (const pkg of ALIAS_PACKAGES) {
    dependencies[`${scope}/${pkg}`] = rootPkg.version
  }

  const resolvedDeps = resolveCatalogRefs(rootPkg.dependencies, catalog)
  if (resolvedDeps) {
    for (const [dep, ver] of Object.entries(resolvedDeps)) {
      if (!dep.startsWith('@drizzle-graphql-suite/')) {
        peerDependencies[dep] = `>=${ver}`
      }
    }
  }

  // biome-ignore lint/suspicious/noExplicitAny: building dynamic object
  const pkg: Record<string, any> = {
    name,
    version: rootPkg.version,
    description: rootPkg.description,
    license: rootPkg.license,
    author: rootPkg.author,
    repository: ALIAS_REPOSITORY,
    keywords: rootPkg.keywords,
    type: 'module',
    publishConfig: { access: 'public' },
    files: rootPkg.files,
    exports: {
      './schema': { types: './schema.d.ts', import: './schema.js' },
      './client': { types: './client.d.ts', import: './client.js' },
      './query': { types: './query.d.ts', import: './query.js' },
    },
    dependencies,
  }

  if (Object.keys(peerDependencies).length) {
    pkg.peerDependencies = peerDependencies
  }

  await Promise.all([
    ...wrapperWrites,
    Bun.write(join(targetDir, 'package.json'), `${JSON.stringify(pkg, null, 2)}\n`),
    copyLicenseAndReadme(targetDir),
  ])

  console.log(`Prepared ${name} umbrella package`)
}

// ─── Alias packages (@graphql-suite/*) ──────────────────────

async function copyLicenseAndReadme(targetDir: string) {
  const licenseFile = Bun.file(join(rootDir, 'LICENSE'))
  const readmeFile = Bun.file(join(rootDir, 'README.md'))
  const writes: Promise<number>[] = []

  if (await licenseFile.exists()) {
    writes.push(Bun.write(join(targetDir, 'LICENSE'), licenseFile))
  }
  if (await readmeFile.exists()) {
    writes.push(Bun.write(join(targetDir, 'README.md'), readmeFile))
  }

  await Promise.all(writes)
}

async function prepareScopedAlias(name: string, catalog: Record<string, string>) {
  const srcPkg = await Bun.file(join(packagesDir, name, 'package.json')).json()
  const aliasDir = join(distDir, '@graphql-suite', name)

  await mkdir(aliasDir, { recursive: true })

  const reexport = `export * from '@drizzle-graphql-suite/${name}'\n`
  // biome-ignore lint/suspicious/noExplicitAny: building dynamic object
  const pkg: Record<string, any> = {
    name: `@graphql-suite/${name}`,
    version: srcPkg.version,
    description: srcPkg.description,
    license: srcPkg.license,
    author: srcPkg.author,
    repository: ALIAS_REPOSITORY,
    type: 'module',
    publishConfig: { access: 'public' },
    main: './index.js',
    types: './index.d.ts',
    exports: {
      '.': {
        types: './index.d.ts',
        import: './index.js',
      },
    },
    dependencies: {
      [`@drizzle-graphql-suite/${name}`]: srcPkg.version,
    },
  }

  const resolvedPeers = resolveCatalogRefs(srcPkg.peerDependencies, catalog)
  if (resolvedPeers) {
    pkg.peerDependencies = resolvedPeers
  }

  await Promise.all([
    Bun.write(join(aliasDir, 'index.js'), reexport),
    Bun.write(join(aliasDir, 'index.d.ts'), reexport),
    Bun.write(join(aliasDir, 'package.json'), `${JSON.stringify(pkg, null, 2)}\n`),
    copyLicenseAndReadme(aliasDir),
  ])

  console.log(`Prepared @graphql-suite/${name} alias`)
}

async function main() {
  const catalog = await loadCatalog()
  const entries = await readdir(packagesDir, { withFileTypes: true })
  const packageDirs = entries.filter((e) => e.isDirectory()).map((e) => join(packagesDir, e.name))

  await Promise.all([
    ...packageDirs.map((dir) => preparePackage(dir, catalog)),
    ...ALIAS_PACKAGES.map((name) => prepareScopedAlias(name, catalog)),
    prepareUmbrellaVariant('drizzle-graphql-suite', '@drizzle-graphql-suite', catalog),
    prepareUmbrellaVariant('graphql-suite', '@graphql-suite', catalog),
  ])
  console.log('All packages prepared for publishing')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
