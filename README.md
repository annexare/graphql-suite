[![Monthly Downloads](https://img.shields.io/npm/dm/graphql-suite.svg)](https://www.npmjs.com/package/graphql-suite)
[![NPM](https://img.shields.io/npm/v/graphql-suite.svg 'NPM package version')](https://www.npmjs.com/package/graphql-suite)
[![CI](https://github.com/annexare/graphql-suite/actions/workflows/ci.yml/badge.svg)](https://github.com/annexare/graphql-suite/actions/workflows/ci.yml)

# graphql-suite

Auto-generated GraphQL CRUD, type-safe clients, and React Query hooks from Drizzle PostgreSQL schemas.

## Overview

`graphql-suite` is a three-layer toolkit that turns your Drizzle ORM schema into a fully working GraphQL API with end-to-end type safety:

1. **Schema builder** — generates a complete GraphQL schema with CRUD operations, relation-level filtering, per-operation hooks, and runtime permissions from Drizzle table definitions.
2. **Client** — provides a type-safe GraphQL client that infers query/mutation types directly from your Drizzle schema, with full TypeScript support for filters, relations, and results.
3. **React Query hooks** — wraps the client in TanStack React Query hooks for caching, pagination, and mutations with automatic cache invalidation.

Inspired by [`drizzle-graphql`](https://github.com/drizzle-team/drizzle-graphql), rewritten with significant improvements including relation-level filtering, hooks, count queries, configurable schema generation, and code generation.

## Packages

| Subpath | Package | Description |
|---------|---------|-------------|
| `graphql-suite/schema` | [`@graphql-suite/schema`](packages/schema/README.md) | GraphQL schema builder with CRUD, filtering, hooks, permissions, and codegen |
| `graphql-suite/client` | [`@graphql-suite/client`](packages/client/README.md) | Type-safe GraphQL client with full Drizzle type inference |
| `graphql-suite/query` | [`@graphql-suite/query`](packages/query/README.md) | TanStack React Query hooks for the client |

## Installation

```bash
bun add graphql-suite
```

```bash
npm install graphql-suite
```

## Peer Dependencies

Each subpath import has its own peer dependency requirements:

| Subpath | Peer Dependencies |
|---------|-------------------|
| `./schema` | `drizzle-orm` >=0.44.0, `graphql` >=16.3.0 |
| `./client` | `drizzle-orm` >=0.44.0 |
| `./query` | `react` >=18.0.0, `@tanstack/react-query` >=5.0.0 |

## Quick Start

### 1. Server — Build GraphQL Schema

```ts
import { buildSchema } from 'graphql-suite/schema'
import { createYoga } from 'graphql-yoga'
import { createServer } from 'node:http'
import { db } from './db'

const { schema, withPermissions } = buildSchema(db, {
  tables: { exclude: ['session', 'verification'] },
  hooks: {
    user: {
      query: {
        before: async ({ context }) => {
          if (!context.user) throw new Error('Unauthorized')
        },
      },
    },
  },
})

const yoga = createYoga({ schema })
const server = createServer(yoga)
server.listen(4000)
```

#### Per-Role Schemas (Optional)

```ts
import { permissive, restricted, readOnly } from 'graphql-suite/schema'

// Cached per id — call withPermissions on each request
const schemas = {
  admin: schema,
  editor: withPermissions(permissive('editor', { audit: false, user: readOnly() })),
  viewer: withPermissions(restricted('viewer', { post: { query: true } })),
}
```

### 2. Client — Type-Safe Queries

```ts
import { createDrizzleClient } from 'graphql-suite/client'
import * as schema from './db/schema'

const client = createDrizzleClient({
  schema,
  config: { suffixes: { list: 's' } },
  url: '/api/graphql',
})

const users = await client.entity('user').query({
  select: {
    id: true,
    name: true,
    posts: { id: true, title: true },
  },
  where: { name: { ilike: '%john%' } },
  limit: 10,
})
```

### 3. React — Query Hooks

```tsx
import { GraphQLProvider, useEntity, useEntityList } from 'graphql-suite/query'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const queryClient = new QueryClient()

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <GraphQLProvider client={graphqlClient}>
        <UserList />
      </GraphQLProvider>
    </QueryClientProvider>
  )
}

function UserList() {
  const user = useEntity('user')
  const { data, isLoading } = useEntityList(user, {
    select: { id: true, name: true, email: true },
    limit: 20,
  })

  if (isLoading) return <div>Loading...</div>
  return <ul>{data?.map((u) => <li key={u.id}>{u.name}</li>)}</ul>
}
```

## Framework Integration Examples

`buildSchema()` returns a standard `GraphQLSchema` — here's how to serve it from popular frameworks.

### Next.js App Router

```ts
// app/api/graphql/route.ts
import { createYoga } from 'graphql-yoga'
import { buildSchema } from 'graphql-suite/schema'
import { db } from '@/db'

const { schema } = buildSchema(db)

const { handleRequest } = createYoga({
  schema,
  graphqlEndpoint: '/api/graphql',
  fetchAPI: { Response },
})

export { handleRequest as GET, handleRequest as POST }
```

### ElysiaJS

```ts
// server.ts
import { Elysia } from 'elysia'
import { yoga } from '@elysiajs/graphql-yoga'
import { buildSchema } from 'graphql-suite/schema'
import { db } from './db'

const { schema } = buildSchema(db)

new Elysia()
  .use(yoga({ schema }))
  .listen(3000)
```

## AI Agent Skill

This repo includes a [skills.sh](https://skills.sh) skill that provides AI coding agents (Claude Code, Cursor, etc.) with accurate, up-to-date guidance for all three packages.

```bash
bunx skills add annexare/graphql-suite
# or: npx skills add annexare/graphql-suite
```

## License

MIT
