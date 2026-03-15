import starlight from '@astrojs/starlight'
import { defineConfig } from 'astro/config'

export default defineConfig({
  integrations: [
    starlight({
      title: 'graphql-suite',
      description:
        'Auto-generated GraphQL CRUD, type-safe clients, and React Query hooks from Drizzle PostgreSQL schemas',
      social: [
        {
          icon: 'github',
          label: 'GitHub',
          href: 'https://github.com/annexare/drizzle-graphql-suite',
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
  ],
})
