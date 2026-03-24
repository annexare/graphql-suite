# GraphQL Yoga Server

GraphQL Yoga server with `buildSchema`, hooks, and table exclusion.

```ts
import { createServer } from 'node:http'
import { buildSchema } from 'graphql-suite/schema'
import { createYoga } from 'graphql-yoga'

import { db } from './db' // Your Drizzle db instance

// Build GraphQL schema from Drizzle
const { schema } = buildSchema(db, {
  // Customize query suffixes: user → users (list), userSingle (single)
  suffixes: { list: 's', single: 'Single' },

  // Exclude internal tables from the API
  tables: {
    exclude: ['session', 'verification'],
    config: {
      // Allow read-only access to audit logs
      auditLog: { queries: true, mutations: false },
    },
  },

  // Limit relation nesting depth
  limitRelationDepth: 3,

  // Add hooks for auth and data transformation
  hooks: {
    user: {
      // Auth guard on all user queries
      query: {
        before: async ({ context }) => {
          if (!context.user) throw new Error('Unauthorized')
        },
      },
      // Inject userId on insert
      insert: {
        resolve: async ({ args, context, defaultResolve }) => {
          // The resolve hook replaces the entire resolver
          // Use defaultResolve to call the original with modified args
          return defaultResolve(args)
        },
      },
    },
    post: {
      // Auto-set author on insert
      insertSingle: {
        before: async ({ args, context }) => {
          args.values.userId = context.user.id
          return { args }
        },
      },
    },
  },
})

// Create GraphQL Yoga server
const yoga = createYoga({
  schema,
  // Pass request context (e.g., authenticated user)
  context: async ({ request }) => {
    const token = request.headers.get('authorization')?.replace('Bearer ', '')
    // Verify token and get user...
    return { user: token ? { id: 'user-id', role: 'admin' } : null }
  },
})

const server = createServer(yoga)
server.listen(4000, () => {
  console.log('GraphQL server running at http://localhost:4000/graphql')
})
```
