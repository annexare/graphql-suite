# End-to-End Setup Guide

Step-by-step guide for setting up a full stack with graphql-suite: Drizzle schema, GraphQL server, type-safe client, and React hooks.

## 1. Install Dependencies

```bash
# Server
bun add graphql-suite drizzle-orm graphql graphql-yoga

# Client (if separate package/app)
bun add graphql-suite drizzle-orm

# React hooks
bun add graphql-suite react @tanstack/react-query
```

## 2. Define Drizzle Schema

Create your PostgreSQL table definitions with relations:

```ts
// db/schema.ts
import { relations } from 'drizzle-orm'
import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const user = pgTable('user', {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  email: text().notNull(),
  createdAt: timestamp().defaultNow().notNull(),
})

export const post = pgTable('post', {
  id: uuid().primaryKey().defaultRandom(),
  title: text().notNull(),
  body: text().notNull(),
  userId: uuid().notNull(),
})

export const userRelations = relations(user, ({ many }) => ({
  posts: many(post),
}))

export const postRelations = relations(post, ({ one }) => ({
  author: one(user, { fields: [post.userId], references: [user.id] }),
}))
```

## 3. Build GraphQL Server

```ts
// server.ts
import { buildSchema } from 'graphql-suite/schema'
import { createYoga } from 'graphql-yoga'
import { createServer } from 'node:http'
import { db } from './db'

const { schema } = buildSchema(db, {
  suffixes: { list: 's' },
  tables: { exclude: ['session'] },
})

const yoga = createYoga({ schema })
createServer(yoga).listen(4000)
```

## 4. Create Client

```ts
// lib/graphql-client.ts
import { createDrizzleClient } from 'graphql-suite/client'
import * as schema from './db/schema'

export const client = createDrizzleClient({
  schema,
  config: {
    suffixes: { list: 's' },          // Must match server
    tables: { exclude: ['session'] }, // Must match server
  },
  url: '/api/graphql',
  headers: () => ({
    Authorization: `Bearer ${localStorage.getItem('token')}`,
  }),
})
```

## 5. Add React Hooks

```tsx
// app/providers.tsx
'use client'
import { GraphQLProvider } from 'graphql-suite/query'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { client } from '@/lib/graphql-client'

const queryClient = new QueryClient()

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <GraphQLProvider client={client}>
        {children}
      </GraphQLProvider>
    </QueryClientProvider>
  )
}
```

```tsx
// components/user-list.tsx
'use client'
import { useEntity, useEntityList } from 'graphql-suite/query'

export function UserList() {
  const user = useEntity('user')
  const { data, isLoading } = useEntityList(user, {
    select: { id: true, name: true, email: true },
    limit: 20,
  })

  if (isLoading) return <div>Loading...</div>
  return (
    <ul>
      {data?.map((u) => <li key={u.id}>{u.name}</li>)}
    </ul>
  )
}
```

## Config Alignment Checklist

The client and server configs must align for query generation to work correctly. These fields must match:

| Field | Effect if mismatched |
|-------|---------------------|
| `suffixes.list` | Client queries wrong operation name |
| `suffixes.single` | Client queries wrong operation name |
| `mutations` | Client tries mutations that don't exist |
| `tables.exclude` | Client tries to query excluded tables |
| `pruneRelations` | Client tries to select pruned relation fields |

Fields that are server-only (no client equivalent needed):
- `limitRelationDepth` — affects schema depth, not query names
- `limitSelfRelationDepth` — affects schema depth, not query names
- `hooks` — server-side only
- `tables.config` — server-side only
- `debug` — server-side only

## Common Patterns

### Shared Config

Extract shared config to avoid drift:

```ts
// config/graphql.ts
export const graphqlConfig = {
  suffixes: { list: 's', single: 'Single' } as const,
  tables: { exclude: ['session', 'verification'] as const },
}

// Server
buildSchema(db, { ...graphqlConfig, hooks: { ... } })

// Client
createDrizzleClient({ schema, config: graphqlConfig, url: '/api/graphql' })
```

### Dynamic URL for SSR/CSR

```ts
createDrizzleClient({
  schema,
  config: graphqlConfig,
  url: () => {
    // Server-side: use internal URL
    if (typeof window === 'undefined') return 'http://localhost:4000/graphql'
    // Client-side: use relative URL
    return '/api/graphql'
  },
})
```

### Auth Headers with Token Refresh

```ts
createDrizzleClient({
  schema,
  config: graphqlConfig,
  url: '/api/graphql',
  headers: async () => {
    const token = await refreshTokenIfNeeded()
    return { Authorization: `Bearer ${token}` }
  },
})
```

## Adding Permissions

Add role-based schema selection to an existing setup:

### 1. Define Permission Configs

```ts
// config/permissions.ts
import { permissive, readOnly, restricted } from 'graphql-suite/schema'

export const permissions = {
  admin: null, // uses full schema
  maintainer: permissive('maintainer', {
    audit: false,
    users: readOnly(),
  }),
  user: restricted('user', {
    posts: { query: true, insert: true },
    comments: { query: true, insert: true },
    users: readOnly(),
  }),
  anon: restricted('anon'),
} as const
```

### 2. Update Server to Select Schema per Request

```ts
// server.ts
import { buildSchema } from 'graphql-suite/schema'
import { createYoga } from 'graphql-yoga'
import { createServer } from 'node:http'
import { db } from './db'
import { permissions } from './config/permissions'

const { schema: fullSchema, withPermissions } = buildSchema(db, {
  suffixes: { list: 's' },
  tables: { exclude: ['session'] },
})

// Pre-build schemas for each role (cached by id)
const schemas = {
  admin: fullSchema,
  maintainer: withPermissions(permissions.maintainer),
  user: withPermissions(permissions.user),
  anon: withPermissions(permissions.anon),
}

const yoga = createYoga({
  schema: async (request) => {
    const user = await authenticateRequest(request)
    const role = user?.role ?? 'anon'
    return schemas[role] ?? schemas.anon
  },
  context: async (ctx) => {
    const user = await authenticateRequest(ctx.request)
    return { user }
  },
})

createServer(yoga).listen(4000)
```

Schemas are cached by `id` — calling `withPermissions` repeatedly with the same config returns the same instance. You can call `withPermissions` on every request or pre-build as shown above.

## Codegen Workflow (Separate Repos)

> This section only applies when the client is in a different repository from the server. For same-repo setups, `createDrizzleClient` handles type inference automatically — skip this section.

If the client is in a different repo from the server:

1. **Server repo:** Generate types and entity definitions:
   ```ts
   const { schema } = buildSchemaFromDrizzle(drizzleSchema, graphqlConfig)
   await Bun.write('generated/types.ts', generateTypes(schema, options))
   await Bun.write('generated/entity-defs.ts', generateEntityDefs(schema, options))
   ```

2. **Client repo:** Import generated code:
   ```ts
   import { createClient } from 'graphql-suite/client'
   import { schema, type EntityDefs } from './generated/entity-defs'

   const client = createClient<typeof schema, EntityDefs>({
     schema,
     url: '/api/graphql',
   })
   ```

See [examples/codegen-script.md](../examples/codegen-script.md) for a complete codegen script.
