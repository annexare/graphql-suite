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
  for (const [name, version] of Object.entries(deps)) {
    resolved[name] = version === 'catalog:' ? (catalog[name] ?? version) : version
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

async function prepareRootPackage() {
  const writes = ALIAS_PACKAGES.flatMap((name) => {
    const content = `export * from '@drizzle-graphql-suite/${name}'\n`
    return [
      Bun.write(join(rootDir, `${name}.js`), content),
      Bun.write(join(rootDir, `${name}.d.ts`), content),
    ]
  })

  await Promise.all(writes)
  console.log('Root wrapper files generated')
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

async function prepareUmbrellaPackage() {
  const rootPkg = await Bun.file(join(rootDir, 'package.json')).json()
  const umbrellaDir = join(distDir, 'graphql-suite')

  await mkdir(umbrellaDir, { recursive: true })

  // Generate wrapper files that re-export from @graphql-suite/*
  const wrapperWrites = ALIAS_PACKAGES.flatMap((name) => {
    const content = `export * from '@graphql-suite/${name}'\n`
    return [
      Bun.write(join(umbrellaDir, `${name}.js`), content),
      Bun.write(join(umbrellaDir, `${name}.d.ts`), content),
    ]
  })

  // biome-ignore lint/suspicious/noExplicitAny: building dynamic object
  const dependencies: Record<string, any> = {}
  for (const name of ALIAS_PACKAGES) {
    dependencies[`@graphql-suite/${name}`] = rootPkg.version
  }

  const pkg = {
    name: 'graphql-suite',
    version: rootPkg.version,
    description: rootPkg.description,
    license: rootPkg.license,
    author: rootPkg.author,
    repository: ALIAS_REPOSITORY,
    type: 'module',
    publishConfig: { access: 'public' },
    files: [
      'schema.js',
      'schema.d.ts',
      'client.js',
      'client.d.ts',
      'query.js',
      'query.d.ts',
      'LICENSE',
      'README.md',
    ],
    exports: {
      './schema': {
        types: './schema.d.ts',
        import: './schema.js',
      },
      './client': {
        types: './client.d.ts',
        import: './client.js',
      },
      './query': {
        types: './query.d.ts',
        import: './query.js',
      },
    },
    dependencies,
  }

  await Promise.all([
    ...wrapperWrites,
    Bun.write(join(umbrellaDir, 'package.json'), `${JSON.stringify(pkg, null, 2)}\n`),
    copyLicenseAndReadme(umbrellaDir),
  ])

  console.log('Prepared graphql-suite umbrella package')
}

async function main() {
  const catalog = await loadCatalog()
  const entries = await readdir(packagesDir, { withFileTypes: true })
  const packageDirs = entries.filter((e) => e.isDirectory()).map((e) => join(packagesDir, e.name))

  await Promise.all([
    ...packageDirs.map((dir) => preparePackage(dir, catalog)),
    prepareRootPackage(),
    ...ALIAS_PACKAGES.map((name) => prepareScopedAlias(name, catalog)),
    prepareUmbrellaPackage(),
  ])
  console.log('All packages prepared for publishing')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
