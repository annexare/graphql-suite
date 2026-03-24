# Auth Hooks

Hook patterns for authentication, authorization, and data transformation.

```ts
import type { BuildSchemaConfig, HooksConfig } from '@graphql-suite/schema'
import { mergeHooks } from '@graphql-suite/schema'

// ─── Auth Guard Hook ─────────────────────────────────────────
// Block unauthenticated access to all operations on a table.

const authGuardHooks: HooksConfig = {
  user: {
    query: {
      before: async ({ context }) => {
        if (!context.user) throw new Error('Unauthorized')
      },
    },
    querySingle: {
      before: async ({ context }) => {
        if (!context.user) throw new Error('Unauthorized')
      },
    },
    count: {
      before: async ({ context }) => {
        if (!context.user) throw new Error('Unauthorized')
      },
    },
    insert: {
      before: async ({ context }) => {
        if (!context.user) throw new Error('Unauthorized')
      },
    },
    insertSingle: {
      before: async ({ context }) => {
        if (!context.user) throw new Error('Unauthorized')
      },
    },
    update: {
      before: async ({ context }) => {
        if (!context.user) throw new Error('Unauthorized')
      },
    },
    delete: {
      before: async ({ context }) => {
        if (!context.user?.role === 'admin') throw new Error('Admin only')
      },
    },
  },
}

// ─── Auto-Set Author Hook ────────────────────────────────────
// Automatically inject the authenticated user's ID on insert.

const autoAuthorHooks: HooksConfig = {
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

// ─── Audit Log Hook ──────────────────────────────────────────
// Log mutations with before/after data.

const auditLogHooks: HooksConfig = {
  user: {
    update: {
      before: async ({ args, context }) => {
        // Store original args for audit trail
        return { data: { originalArgs: structuredClone(args), userId: context.user?.id } }
      },
      after: async ({ result, beforeData }) => {
        console.log('User updated:', {
          by: beforeData.userId,
          changes: beforeData.originalArgs,
          result,
        })
        return result
      },
    },
    delete: {
      before: async ({ args, context }) => {
        return { data: { userId: context.user?.id, filter: args.where } }
      },
      after: async ({ result, beforeData }) => {
        console.log('User deleted:', {
          by: beforeData.userId,
          filter: beforeData.filter,
          deleted: result,
        })
        return result
      },
    },
  },
}

// ─── Resolve Hook (Full Control) ─────────────────────────────
// Replace the entire resolver for custom logic.

const customResolverHooks: HooksConfig = {
  post: {
    query: {
      resolve: async ({ args, context, defaultResolve }) => {
        // Add default filter: only show published posts for non-admins
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

// ─── Composing Multiple Hook Configs ─────────────────────────
// Use the built-in mergeHooks to deep-merge with proper before/after chaining.

const allHooks = mergeHooks(authGuardHooks, autoAuthorHooks, auditLogHooks, customResolverHooks)

// ─── Full Schema Config ──────────────────────────────────────

const config: BuildSchemaConfig = {
  suffixes: { list: 's' },
  tables: { exclude: ['session'] },
  hooks: allHooks,
}
```

## Permissions-Based Auth

Use `withPermissions` for role-based schema selection instead of (or alongside) hooks:

```ts
import {
  buildSchema,
  permissive,
  readOnly,
  restricted,
} from '@graphql-suite/schema'

const { schema: adminSchema, withPermissions } = buildSchema(db, {
  suffixes: { list: 's' },
  tables: { exclude: ['session'] },
})

// Each role gets a different schema — introspection reflects actual access
const schemas = {
  admin: adminSchema,
  maintainer: withPermissions(permissive('maintainer', { audit: false, users: readOnly() })),
  user: withPermissions(restricted('user', { posts: { query: true }, users: readOnly() })),
  anon: withPermissions(restricted('anon')),
}

// In your server, select schema per request:
// schema: (request) => schemas[getUserRole(request)]
```

## Row-Level Security + Auth Hooks

Combine `withRowSecurity` and auth hooks using `mergeHooks`:

```ts
import {
  buildSchema,
  mergeHooks,
  withRowSecurity,
} from '@graphql-suite/schema'

const rlsHooks = withRowSecurity({
  posts: (context) => ({ authorId: { eq: context.user.id } }),
})

const autoAuthor = {
  posts: {
    insert: {
      before: async ({ args, context }: { args: any; context: any }) => {
        args.values = args.values.map((v: Record<string, unknown>) => ({
          ...v,
          authorId: context.user.id,
        }))
        return { args }
      },
    },
  },
}

const { schema } = buildSchema(db, {
  hooks: mergeHooks(rlsHooks, autoAuthor),
})
```
