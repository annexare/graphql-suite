import { VitePWA } from 'vite-plugin-pwa'

/**
 * Minimal Astro integration around `vite-plugin-pwa`.
 *
 * Replaces `@vite-pwa/astro`, which is unmaintained (last release 2025-11-27)
 * and still declares `astro@^5` as its peer range, two majors behind.
 *
 * Only the `generateSW` strategy for statically built sites is supported —
 * the subset this site actually uses. Server output, `injectManifest` and
 * `pwaAssets` are intentionally not handled.
 *
 * @param {import('vite-plugin-pwa').VitePWAOptions} [options]
 * @returns {import('astro').AstroIntegration}
 */
export default function pwa(options = {}) {
  const ctx = {
    /** @type {any} */
    api: undefined,
    skip: false,
    built: false,
    scope: '/',
    trailingSlash: 'ignore',
    directoryFormat: true,
  }

  return {
    name: 'pwa',
    hooks: {
      'astro:config:setup': ({ command, config, updateConfig }) => {
        // `preview` and `sync` never produce a build to precache.
        if (command === 'preview' || command === 'sync') {
          ctx.skip = true
          return
        }

        ctx.scope = config.base ?? '/'
        ctx.trailingSlash = config.trailingSlash
        ctx.directoryFormat = config.build.format === 'directory'

        const { workbox = {}, ...rest } = options

        let assets = config.build.assets ?? '_astro/'
        if (assets.startsWith('/')) assets = assets.slice(1)
        if (!assets.endsWith('/')) assets += '/'

        let plugins = VitePWA({
          ...rest,
          strategies: 'generateSW',
          // Astro emits the icons itself; workbox must not re-inject them.
          includeManifestIcons: false,
          workbox: {
            navigateFallback: ctx.scope,
            ...(ctx.directoryFormat ? { directoryIndex: 'index.html' } : {}),
            dontCacheBustURLsMatching: new RegExp(assets),
            ...workbox,
            // Rewrite built `.html` paths to the URLs Astro actually serves.
            // Appended so a caller-supplied transform still runs, and runs first.
            manifestTransforms: [...(workbox.manifestTransforms ?? []), manifestTransform(ctx)],
          },
        })

        // Astro drives the build, so vite-plugin-pwa's own build hook must not run.
        plugins = plugins.filter((p) => p.name !== 'vite-plugin-pwa:build')

        if (command === 'build') {
          plugins = plugins.filter((p) => p.name !== 'vite-plugin-pwa:dev-sw')
          plugins.push({
            name: 'astro-pwa:build',
            applyToEnvironment: (env) => env.name === 'client',
            configResolved(resolved) {
              if (resolved.build.ssr) return
              ctx.api = resolved.plugins
                .flat(Number.POSITIVE_INFINITY)
                .find((p) => p.name === 'vite-plugin-pwa')?.api
            },
            generateBundle(_options, bundle) {
              ctx.api?.generateBundle(bundle, this)
            },
          })
        }

        updateConfig({ vite: { plugins } })
      },

      // The service worker can only be generated once Astro has written every page.
      'astro:build:done': async () => {
        if (ctx.skip) return
        ctx.built = true
        if (ctx.api && !ctx.api.disabled) await ctx.api.generateSW()
      },
    },
  }
}

/**
 * Workbox globs the built `dist/`, so precache entries arrive as file paths
 * (`schema/overview/index.html`). Astro serves those as directory URLs, so the
 * entries have to be rewritten or the service worker precaches URLs that 404.
 *
 * @param {{ built: boolean, scope: string, trailingSlash: string, directoryFormat: boolean }} ctx
 */
function manifestTransform(ctx) {
  return async (entries) => {
    if (!ctx.built) return { manifest: entries, warnings: [] }

    for (const entry of entries) {
      if (!entry?.url.endsWith('.html')) continue

      const url = entry.url.startsWith('/') ? entry.url.slice(1) : entry.url
      if (url === 'index.html') {
        entry.url = ctx.scope
        continue
      }

      const parts = url.split('/')
      parts[parts.length - 1] = parts[parts.length - 1].replace(/\.html$/, '')
      entry.url = ctx.directoryFormat
        ? parts.length > 1
          ? parts.slice(0, -1).join('/')
          : parts[0]
        : parts.join('/')
      if (ctx.trailingSlash === 'always') entry.url += '/'
    }

    return { manifest: entries, warnings: [] }
  }
}
