import type { APIRoute, GetStaticPaths } from 'astro'

import { generateOgImage } from '../../og-image/generate'
import { drizzleIcon, graphqlIcon, reactIcon, typescriptIcon } from '../../og-image/icons'

const DOMAIN = 'graphql-suite.annexare.com'

const variants = [
  {
    name: 'index',
    title: 'GraphQL Suite',
    description:
      'Auto-generated GraphQL CRUD, type-safe clients, and React Query hooks from Drizzle PostgreSQL schemas',
    icons: [graphqlIcon, drizzleIcon, typescriptIcon, reactIcon],
  },
  {
    name: 'schema',
    title: '@graphql-suite/schema',
    description: 'Generate a complete GraphQL schema from Drizzle PostgreSQL tables',
    icons: [graphqlIcon, drizzleIcon, typescriptIcon],
  },
  {
    name: 'client',
    title: '@graphql-suite/client',
    description: 'Type-safe GraphQL client with types inferred from your Drizzle schema',
    icons: [graphqlIcon, drizzleIcon, typescriptIcon],
  },
  {
    name: 'query',
    title: '@graphql-suite/query',
    description: 'React hooks wrapping TanStack Query for the GraphQL Suite client',
    icons: [reactIcon, typescriptIcon],
  },
]

export const getStaticPaths: GetStaticPaths = () => {
  return variants.map((v) => ({ params: { name: v.name } }))
}

export const GET: APIRoute = async ({ params }) => {
  const variant = variants.find((v) => v.name === params.name)
  if (!variant) {
    return new Response('Not found', { status: 404 })
  }

  const png = await generateOgImage({
    title: variant.title,
    description: variant.description,
    icons: variant.icons,
    domain: DOMAIN,
  })

  return new Response(png, {
    headers: { 'Content-Type': 'image/png' },
  })
}
