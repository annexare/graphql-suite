import { join, resolve } from 'node:path'

const packageDir = resolve(process.argv[2] ?? '.')
const pkg = await Bun.file(join(packageDir, 'package.json')).json()

const externals = (pkg.peerDependencies ? Object.keys(pkg.peerDependencies) : []).concat(
  pkg.dependencies ? Object.keys(pkg.dependencies) : [],
)

const banner = `/** ${pkg.name} v${pkg.version} | ${pkg.license} */`

const result = await Bun.build({
  entrypoints: [join(packageDir, 'src/index.ts')],
  outdir: join(packageDir, 'dist'),
  target: 'browser',
  external: externals,
  banner,
})

if (!result.success) {
  console.error(`Build failed for ${pkg.name}`)
  for (const log of result.logs) console.error(log)
  process.exit(1)
}

// Generate .d.ts
const tsc = Bun.spawn(['tsc', '-p', 'tsconfig.build.json'], {
  cwd: packageDir,
  stdout: 'inherit',
  stderr: 'inherit',
})
const exitCode = await tsc.exited
if (exitCode !== 0) {
  process.exit(exitCode)
}
