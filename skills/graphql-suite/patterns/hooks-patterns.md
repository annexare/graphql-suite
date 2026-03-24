# Hook Recipes

Common patterns for using `BuildSchemaConfig.hooks` to add authentication, authorization, data transformation, and business logic to your GraphQL API.

## Hook Types Overview

Two mutually exclusive hook patterns per operation:

1. **Before/After:** Intercept before and/or after the default resolver runs
2. **Resolve:** Replace the entire resolver (receives `defaultResolve` to call the original)

Operations that support hooks: `query`, `querySingle`, `count`, `insert`, `insertSingle`, `update`, `delete`.

## Authentication Guard

Block unauthenticated access:

```ts
const hooks = {
  user: {
    query: {
      before: async ({ context }) => {
        if (!context.user) throw new Error('Unauthorized')
      },
    },
    // Repeat for querySingle, count, insert, insertSingle, update, delete
  },
}
```

To apply the same guard to all operations on a table:

```ts
function authGuard(tableName: string): HooksConfig {
  const check = {
    before: async ({ context }: { context: any }) => {
      if (!context.user) throw new Error('Unauthorized')
    },
  }
  return {
    [tableName]: {
      query: check,
      querySingle: check,
      count: check,
      insert: check,
      insertSingle: check,
      update: check,
      delete: check,
    },
  }
}
```

## Role-Based Access Control

Restrict operations by user role:

```ts
const hooks = {
  user: {
    delete: {
      before: async ({ context }) => {
        if (context.user?.role !== 'admin') {
          throw new Error('Only admins can delete users')
        }
      },
    },
    update: {
      resolve: async ({ args, context, defaultResolve }) => {
        // Non-admins can only update their own profile
        if (context.user?.role !== 'admin') {
          args.where = { ...args.where, id: { eq: context.user.id } }
        }
        return defaultResolve(args)
      },
    },
  },
}
```

## Auto-Inject User ID on Insert

Automatically set the author/owner field:

```ts
const hooks = {
  post: {
    insertSingle: {
      before: async ({ args, context }) => {
        if (!context.user) throw new Error('Unauthorized')
        args.values.userId = context.user.id
        return { args }
      },
    },
    insert: {
      before: async ({ args, context }) => {
        if (!context.user) throw new Error('Unauthorized')
        args.values = args.values.map((v: Record<string, unknown>) => ({
          ...v,
          userId: context.user.id,
        }))
        return { args }
      },
    },
  },
}
```

## Default Filter (Published Only)

Show only published content to non-admin users:

```ts
const hooks = {
  post: {
    query: {
      resolve: async ({ args, context, defaultResolve }) => {
        if (context.user?.role !== 'admin') {
          args.where = {
            ...args.where,
            published: { eq: 'published' },
          }
        }
        return defaultResolve(args)
      },
    },
    querySingle: {
      resolve: async ({ args, context, defaultResolve }) => {
        if (context.user?.role !== 'admin') {
          args.where = {
            ...args.where,
            published: { eq: 'published' },
          }
        }
        return defaultResolve(args)
      },
    },
  },
}
```

## Audit Logging

Log mutations with before/after data:

```ts
const hooks = {
  user: {
    update: {
      before: async ({ args, context }) => {
        return {
          data: {
            userId: context.user?.id,
            changes: structuredClone(args),
            timestamp: new Date().toISOString(),
          },
        }
      },
      after: async ({ result, beforeData }) => {
        await auditLog.insert({
          action: 'user.update',
          performedBy: beforeData.userId,
          changes: beforeData.changes,
          timestamp: beforeData.timestamp,
          affectedRows: result.length,
        })
        return result
      },
    },
    delete: {
      before: async ({ args, context }) => {
        return {
          data: { userId: context.user?.id, filter: args.where },
        }
      },
      after: async ({ result, beforeData }) => {
        await auditLog.insert({
          action: 'user.delete',
          performedBy: beforeData.userId,
          filter: beforeData.filter,
          deletedCount: result.length,
        })
        return result
      },
    },
  },
}
```

## Data Transformation

Transform data before insert or after query:

```ts
const hooks = {
  user: {
    insertSingle: {
      before: async ({ args }) => {
        // Normalize email to lowercase
        if (args.values.email) {
          args.values.email = args.values.email.toLowerCase().trim()
        }
        return { args }
      },
    },
    query: {
      after: async ({ result }) => {
        // Mask email for privacy
        return result.map((user: Record<string, unknown>) => ({
          ...user,
          email: typeof user.email === 'string'
            ? user.email.replace(/(.{2}).*(@.*)/, '$1***$2')
            : user.email,
        }))
      },
    },
  },
}
```

## Rate Limiting

Simple in-memory rate limit (use Redis in production):

```ts
const rateLimits = new Map<string, number[]>()
const WINDOW_MS = 60_000
const MAX_REQUESTS = 100

function checkRateLimit(userId: string) {
  const now = Date.now()
  const timestamps = rateLimits.get(userId)?.filter((t) => now - t < WINDOW_MS) ?? []
  if (timestamps.length >= MAX_REQUESTS) {
    throw new Error('Rate limit exceeded')
  }
  timestamps.push(now)
  rateLimits.set(userId, timestamps)
}

const hooks = {
  post: {
    insert: {
      before: async ({ context }) => {
        if (context.user) checkRateLimit(context.user.id)
      },
    },
  },
}
```

## Composing Hooks with `mergeHooks`

Use the built-in `mergeHooks` to deep-merge multiple `HooksConfig` objects with proper hook chaining:

```ts
import { buildSchema, mergeHooks } from '@graphql-suite/schema'

const hooks = mergeHooks(
  authGuard('user'),
  authGuard('post'),
  auditLogHooks,
  dataTransformHooks,
)

buildSchema(db, { hooks })
```

**Merge behavior:**
- `before` hooks on the same table+operation are **chained** — each receives the previous hook's modified args
- `after` hooks on the same table+operation are **chained** — each receives the previous hook's result
- `resolve` hooks — last one wins (cannot be composed)
- `undefined` values are skipped, enabling conditional composition:

```ts
const hooks = mergeHooks(
  baseHooks,
  isProduction ? auditHooks : undefined,
  rlsHooks,
)
```

## Row-Level Security

Use `withRowSecurity` to generate hooks that inject WHERE clauses for row-level filtering:

```ts
import { buildSchema, withRowSecurity, mergeHooks } from '@graphql-suite/schema'

const rlsHooks = withRowSecurity({
  posts: (context) => ({ authorId: { eq: context.user.id } }),
  comments: (context) => ({ userId: { eq: context.user.id } }),
})

const { schema } = buildSchema(db, { hooks: rlsHooks })
```

Rules apply `before` hooks on `query`, `querySingle`, `count`, `update`, and `delete` operations. Insert operations are not filtered (they create new rows, not read existing ones).

## Combined RLS + Auth

Compose row-level security with authentication hooks:

```ts
import { buildSchema, withRowSecurity, mergeHooks } from '@graphql-suite/schema'

const rlsHooks = withRowSecurity({
  posts: (context) => ({ authorId: { eq: context.user.id } }),
})

const authHooks = {
  posts: {
    insert: {
      before: async ({ args, context }: { args: any; context: any }) => {
        if (!context.user) throw new Error('Unauthorized')
        args.values = args.values.map((v: Record<string, unknown>) => ({
          ...v,
          authorId: context.user.id,
        }))
        return { args }
      },
    },
  },
}

// RLS filters run first (WHERE injection), then auth hooks chain after
const { schema } = buildSchema(db, {
  hooks: mergeHooks(rlsHooks, authHooks),
})
