import { mkdir, readdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const rootDir = resolve(import.meta.dirname, '..')
const packagesDir = join(rootDir, 'packages')
const distDir = join(rootDir, 'dist')
const GITHUB_PACKAGES = 'https://github.com/annexare/graphql-suite/tree/main/packages'
const REPOSITORY = {
  type: 'git',
  url: 'https://github.com/annexare/graphql-suite.git',
}
const DOCS_URL = 'https://graphql-suite.annexare.com'

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

// ─── Package preparation (primary @graphql-suite/*) ──────────

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

const PACKAGES = ['schema', 'client', 'query'] as const

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

// ─── Umbrella packages ───────────────────────────────────────

async function prepareUmbrellaVariant(name: string, scope: string) {
  const rootPkg = await Bun.file(join(rootDir, 'package.json')).json()
  const targetDir = join(distDir, name)

  await mkdir(targetDir, { recursive: true })

  const banner = `/** ${name} v${rootPkg.version} | ${rootPkg.license} */\n`
  const wrapperWrites = PACKAGES.flatMap((pkg) => {
    const content = `${banner}export * from '${scope}/${pkg}'\n`
    return [
      Bun.write(join(targetDir, `${pkg}.js`), content),
      Bun.write(join(targetDir, `${pkg}.d.ts`), content),
    ]
  })

  // biome-ignore lint/suspicious/noExplicitAny: building dynamic object
  const dependencies: Record<string, any> = {}
  // biome-ignore lint/suspicious/noExplicitAny: building dynamic object
  const peerDependencies: Record<string, any> = {}

  for (const pkg of PACKAGES) {
    dependencies[`${scope}/${pkg}`] = rootPkg.version
  }

  // Collect peer dependencies from the underlying packages
  for (const pkg of PACKAGES) {
    const srcPkg = await Bun.file(join(packagesDir, pkg, 'package.json')).json()
    if (srcPkg.peerDependencies) {
      for (const [dep, range] of Object.entries(srcPkg.peerDependencies) as [string, string][]) {
        if (!dep.startsWith('@graphql-suite/') && !peerDependencies[dep]) {
          peerDependencies[dep] = range
        }
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
    repository: REPOSITORY,
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

// ─── Deprecated alias packages (@drizzle-graphql-suite/*) ────

const DEPRECATION_README = (newName: string) => `# Deprecated

This package has been renamed to \`${newName}\`.

Please update your dependencies:

\`\`\`bash
bun add ${newName}
\`\`\`

Documentation: ${DOCS_URL}
`

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

function rewriteScope(
  deps: Record<string, string> | undefined,
): Record<string, string> | undefined {
  if (!deps) return undefined
  const rewritten: Record<string, string> = {}
  for (const [dep, range] of Object.entries(deps)) {
    rewritten[dep.replace('@graphql-suite/', '@drizzle-graphql-suite/')] = range
  }
  return rewritten
}

async function prepareDeprecatedAlias(name: string, catalog: Record<string, string>) {
  const srcPkg = await Bun.file(join(packagesDir, name, 'package.json')).json()
  const srcDistDir = join(packagesDir, name, 'dist')
  const aliasDir = join(distDir, '@drizzle-graphql-suite', name)

  await mkdir(aliasDir, { recursive: true })

  const aliasName = `@drizzle-graphql-suite/${name}`

  // biome-ignore lint/suspicious/noExplicitAny: building dynamic object
  const pkg: Record<string, any> = {
    name: aliasName,
    version: srcPkg.version,
    description: srcPkg.description,
    license: srcPkg.license,
    author: srcPkg.author,
    repository: REPOSITORY,
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
  }

  const resolvedDeps = rewriteScope(resolveCatalogRefs(srcPkg.dependencies, catalog))
  if (resolvedDeps) {
    pkg.dependencies = resolvedDeps
  }

  const resolvedPeers = rewriteScope(resolveCatalogRefs(srcPkg.peerDependencies, catalog))
  if (resolvedPeers) {
    pkg.peerDependencies = resolvedPeers
  }

  // Copy built artifacts, rewriting banner and keeping @graphql-suite/* imports as-is
  const aliasBanner = `/** ${aliasName} v${pkg.version} | ${pkg.license} */`
  const writes: Promise<number>[] = [
    Bun.write(join(aliasDir, 'package.json'), `${JSON.stringify(pkg, null, 2)}\n`),
    Bun.write(join(aliasDir, 'README.md'), DEPRECATION_README(`@graphql-suite/${name}`)),
  ]

  const requiredFiles = ['index.js', 'index.d.ts']
  for (const file of requiredFiles) {
    const src = Bun.file(join(srcDistDir, file))
    if (!(await src.exists())) {
      throw new Error(
        `Missing build artifact: ${join(srcDistDir, file)}. Run 'bun run build' first.`,
      )
    }
    let content = await src.text()
    // Replace the original banner with the alias banner
    content = content.replace(/^\/\*\*.*?\*\/\n?/, `${aliasBanner}\n`)
    writes.push(Bun.write(join(aliasDir, file), content))
  }

  const licenseFile = Bun.file(join(rootDir, 'LICENSE'))
  if (await licenseFile.exists()) {
    writes.push(Bun.write(join(aliasDir, 'LICENSE'), licenseFile))
  }

  await Promise.all(writes)

  console.log(`Prepared ${aliasName} (deprecated alias)`)
}

async function main() {
  const catalog = await loadCatalog()
  const entries = await readdir(packagesDir, { withFileTypes: true })
  const packageDirs = entries.filter((e) => e.isDirectory()).map((e) => join(packagesDir, e.name))

  await Promise.all([
    // Primary packages (@graphql-suite/*)
    ...packageDirs.map((dir) => preparePackage(dir, catalog)),
    // Deprecated aliases (@drizzle-graphql-suite/*)
    ...PACKAGES.map((name) => prepareDeprecatedAlias(name, catalog)),
    // Umbrella packages
    prepareUmbrellaVariant('graphql-suite', '@graphql-suite'),
    prepareUmbrellaVariant('drizzle-graphql-suite', '@drizzle-graphql-suite'),
  ])
  console.log('All packages prepared for publishing')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
