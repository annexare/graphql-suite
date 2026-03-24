# Permissions Example

Multi-role permission setup with runtime schema selection and row-level security.

## Multi-Role Setup

```ts
import {
  buildSchema,
  mergeHooks,
  permissive,
  readOnly,
  restricted,
  withRowSecurity,
} from '@graphql-suite/schema'
import { db } from './db'

// ─── Build Base Schema ───────────────────────────────────────

const { schema: fullSchema, withPermissions } = buildSchema(db, {
  suffixes: { list: 's' },
  tables: { exclude: ['session', 'migration'] },
})

// ─── Define Role Schemas ─────────────────────────────────────

// Admin: full access to everything
const adminSchema = fullSchema

// Maintainer: everything except audit table; users are read-only
const maintainerSchema = withPermissions(
  permissive('maintainer', {
    audit: false,
    users: readOnly(),
  }),
)

// User: only posts and comments (queries + insert), plus read-only users
const userSchema = withPermissions(
  restricted('user', {
    posts: { query: true, insert: true },
    comments: { query: true, insert: true },
    users: readOnly(),
  }),
)

// Anonymous: nothing allowed (empty schema with only _empty query)
const anonSchema = withPermissions(restricted('anon'))
```

## Server Integration (GraphQL Yoga)

Select the schema per request based on auth context:

```ts
import { createYoga } from 'graphql-yoga'
import { createServer } from 'node:http'

type UserRole = 'admin' | 'maintainer' | 'user' | 'anon'

function getSchemaForRole(role: UserRole) {
  switch (role) {
    case 'admin':
      return adminSchema
    case 'maintainer':
      return maintainerSchema
    case 'user':
      return userSchema
    case 'anon':
      return anonSchema
  }
}

const yoga = createYoga({
  schema: async (request) => {
    const user = await authenticateRequest(request)
    return getSchemaForRole(user?.role ?? 'anon')
  },
  context: async (ctx) => {
    const user = await authenticateRequest(ctx.request)
    return { user }
  },
})

createServer(yoga).listen(4000)
```

## Combined Permissions + Row-Level Security

Use `withPermissions` for schema-level access control and `withRowSecurity` + `mergeHooks` for row-level filtering:

```ts
import {
  buildSchema,
  mergeHooks,
  permissive,
  readOnly,
  restricted,
  withRowSecurity,
} from '@graphql-suite/schema'

// ─── Row-Level Security Rules ────────────────────────────────

const rlsHooks = withRowSecurity({
  // Users can only see/modify their own posts
  posts: (context) => ({ authorId: { eq: context.user.id } }),
  // Users can only see/modify their own comments
  comments: (context) => ({ userId: { eq: context.user.id } }),
})

// ─── Auth Hooks ──────────────────────────────────────────────

const authHooks = {
  posts: {
    insert: {
      before: async ({ args, context }: { args: any; context: any }) => {
        // Auto-inject author ID on insert
        if (context.user) {
          args.values = args.values.map((v: Record<string, unknown>) => ({
            ...v,
            authorId: context.user.id,
          }))
        }
        return { args }
      },
    },
  },
}

// ─── Build Schema with Composed Hooks ────────────────────────

const { schema: fullSchema, withPermissions } = buildSchema(db, {
  suffixes: { list: 's' },
  hooks: mergeHooks(rlsHooks, authHooks),
})

// Admin gets full schema (RLS hooks still apply — use resolve hooks to bypass if needed)
const adminSchema = fullSchema

// Regular user: restricted to specific tables + RLS filters their data
const userSchema = withPermissions(
  restricted('user', {
    posts: { query: true, insert: true, update: true, delete: true },
    comments: { query: true, insert: true },
    users: readOnly(),
  }),
)
```

## Granular Mutation Control

Fine-grained control over which mutations are available per table:

```ts
const editorSchema = withPermissions(
  permissive('editor', {
    posts: { query: true, insert: true, update: true, delete: false },
    // Can create and edit posts, but cannot delete them
    // GraphQL introspection will show insertIntoPosts and updatePosts
    // but NOT deleteFromPosts
  }),
)
```
