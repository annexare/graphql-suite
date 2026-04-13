import starlight from '@astrojs/starlight'
import AstroPWA from '@vite-pwa/astro'
import { defineConfig } from 'astro/config'

export default defineConfig({
  site: 'https://graphql-suite.annexare.com',
  integrations: [
    starlight({
      title: 'GraphQL Suite',
      components: {
        Footer: './src/components/Footer.astro',
      },
      description:
        'Auto-generated GraphQL CRUD, type-safe clients, and React Query hooks from Drizzle PostgreSQL schemas',
      head: [
        {
          tag: 'link',
          attrs: {
            rel: 'alternate',
            type: 'text/plain',
            href: '/llms.txt',
            title: 'LLM-friendly documentation',
          },
        },
        {
          tag: 'link',
          attrs: {
            rel: 'alternate',
            type: 'text/plain',
            href: '/llms-full.txt',
            title: 'LLM-friendly full documentation',
          },
        },
        {
          tag: 'link',
          attrs: { rel: 'manifest', href: '/manifest.webmanifest' },
        },
        {
          // Manual SW registration required — @vite-pwa/astro cannot inject
          // scripts into Starlight's HTML output (known Astro limitation)
          tag: 'script',
          attrs: {},
          content: `if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {})`,
        },
        {
          tag: 'link',
          attrs: {
            rel: 'apple-touch-icon',
            sizes: '180x180',
            href: '/icon-180.png',
          },
        },
        {
          tag: 'meta',
          attrs: { name: 'theme-color', content: '#e535ab' },
        },
        {
          tag: 'meta',
          attrs: { property: 'og:type', content: 'website' },
        },
        {
          tag: 'meta',
          attrs: {
            property: 'og:site_name',
            content: 'GraphQL Suite',
          },
        },
        {
          tag: 'meta',
          attrs: {
            property: 'og:image',
            content: 'https://graphql-suite.annexare.com/og/index.png',
          },
        },
        {
          tag: 'meta',
          attrs: { property: 'og:image:width', content: '1200' },
        },
        {
          tag: 'meta',
          attrs: { property: 'og:image:height', content: '630' },
        },
        {
          tag: 'meta',
          attrs: { property: 'og:image:type', content: 'image/png' },
        },
        {
          tag: 'meta',
          attrs: {
            name: 'twitter:image',
            content: 'https://graphql-suite.annexare.com/og/index.png',
          },
        },
        {
          tag: 'meta',
          attrs: { name: 'twitter:card', content: 'summary_large_image' },
        },
      ],
      social: [
        {
          icon: 'github',
          label: 'GitHub',
          href: 'https://github.com/annexare/graphql-suite',
        },
      ],
      sidebar: [
        {
          label: 'Getting Started',
          autogenerate: { directory: 'getting-started' },
        },
        {
          label: 'Schema Package',
          autogenerate: { directory: 'schema' },
        },
        {
          label: 'Client Package',
          autogenerate: { directory: 'client' },
        },
        {
          label: 'Query Package',
          autogenerate: { directory: 'query' },
        },
        {
          label: 'Guides',
          autogenerate: { directory: 'guides' },
        },
        {
          label: 'API Reference',
          autogenerate: { directory: 'reference' },
        },
      ],
    }),
    AstroPWA({
      registerType: 'autoUpdate',
      injectRegister: 'script',
      manifest: {
        name: 'GraphQL Suite',
        short_name: 'GQL Suite',
        description:
          'Auto-generated GraphQL CRUD, type-safe clients, and React Query hooks from Drizzle PostgreSQL schemas',
        theme_color: '#e535ab',
        background_color: '#f8fafc',
        icons: [
          {
            src: '/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        navigateFallback: '/404.html',
        runtimeCaching: [
          {
            urlPattern: /\.(?:html|css|js|svg|png|jpg|woff2?)$/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'assets',
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 7 * 24 * 60 * 60,
              },
            },
          },
        ],
      },
    }),
  ],
})
