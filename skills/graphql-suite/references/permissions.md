# Permissions Reference

`@graphql-suite/schema` — Runtime permissions, row-level security, and hook composition.

## Permission Helpers

### `permissive(id, tables?)`

Create a permissive permission config. All tables are allowed by default; entries in `tables` deny or restrict access.

```ts
import { permissive, readOnly } from '@graphql-suite/schema'

const config = permissive('maintainer', {
  audit: false,          // exclude entirely
  users: readOnly(),     // queries only, no mutations
  posts: { query: true, insert: true, update: true, delete: false },
})
```

**Signature:**
```ts
function permissive(
  id: string,
  tables?: Record<string, boolean | TableAccess>,
): PermissionConfig
```

### `restricted(id, tables?)`

Create a restricted permission config. Nothing is allowed by default; entries in `tables` grant access.

```ts
import { restricted } from '@graphql-suite/schema'

const config = restricted('viewer', {
  posts: { query: true },
  comments: { query: true },
})
```

**Signature:**
```ts
function restricted(
  id: string,
  tables?: Record<string, boolean | TableAccess>,
): PermissionConfig
```

### `readOnly()`

Shorthand for a `TableAccess` that allows queries but disables all mutations.

```ts
import { readOnly } from '@graphql-suite/schema'

readOnly()
// Returns: { query: true, insert: false, update: false, delete: false }
```

**Signature:**
```ts
function readOnly(): TableAccess
```

## `withPermissions(permissions)`

Method returned by `buildSchema()` and `buildSchemaFromDrizzle()`. Builds a filtered `GraphQLSchema` from a `PermissionConfig`.

```ts
const { schema, withPermissions, clearPermissionCache } = buildSchema(db, baseConfig)

const adminSchema = schema  // full schema
const userSchema = withPermissions(restricted('user', { posts: { query: true } }))
```

**Signature:**
```ts
withPermissions: (permissions: PermissionConfig) => GraphQLSchema
```

### Caching

Schemas are cached by `permissions.id`. Calling `withPermissions` with the same `id` returns the identical `GraphQLSchema` instance. This makes it safe to call on every request without rebuilding:

```ts
// Both return the same object reference
const schema1 = withPermissions(restricted('user', { posts: { query: true } }))
const schema2 = withPermissions(restricted('user', { posts: { query: true } }))
schema1 === schema2  // true (same id = 'user')
```

### Cache Management

Use `clearPermissionCache` to evict cached schemas — useful when permission IDs come from per-user data and the cache can grow without bound.

```ts
// Clear all cached permission schemas
clearPermissionCache()

// Clear a specific cached entry (e.g., on user logout)
clearPermissionCache('user-123')
```

> **Note:** When using per-user IDs (e.g., `withPermissions(restricted(user.id, ...))`), consider evicting the entry on logout or periodically clearing the full cache to prevent unbounded growth.

### Empty Schemas

When all tables are excluded (e.g., `restricted('anon')` with no tables granted), a minimal schema is returned:

```graphql
type Query {
  _empty: Boolean
}
```

## Type Definitions

### `PermissionConfig`

```ts
type PermissionConfig = {
  id: string                                    // Unique ID for caching
  mode: 'permissive' | 'restricted'             // Default access mode
  tables?: Record<string, boolean | TableAccess> // Per-table overrides
}
```

### `TableAccess`

```ts
type TableAccess = {
  query?: boolean   // Controls: list, single, count queries
  insert?: boolean  // Controls: insert, insertSingle mutations
  update?: boolean  // Controls: update mutation
  delete?: boolean  // Controls: delete mutation
}
```

## Permissive vs Restricted Behavior

| Scenario | Permissive | Restricted |
|----------|-----------|------------|
| Table not in `tables` | Full access | No access (excluded) |
| Table set to `true` | Full access | Full access |
| Table set to `false` | Excluded entirely | Excluded entirely |
| `TableAccess` field omitted | Defaults to `true` | Defaults to `false` |
| `readOnly()` | Queries only | Queries only |

### Examples

```ts
// Permissive: users table gets read-only, everything else is fully accessible
permissive('editor', { users: readOnly() })

// Restricted: only posts table is accessible (queries only), everything else excluded
restricted('reader', { posts: { query: true } })

// Restricted with full access to one table
restricted('writer', { posts: true })

// Permissive with one table excluded
permissive('staff', { secretData: false })
```

## Introspection Behavior

The filtered schema fully reflects permissions in GraphQL introspection:

| Access Level | Introspection Result |
|-------------|---------------------|
| `false` (excluded) | Table removed from everywhere: no entry points, no relation fields on other types, no filter inputs |
| `readOnly()` | Table types exist and are reachable via relations; only query entry points in Query root; no mutations |
| Granular (e.g., `{ query: true, delete: false }`) | Query entry points present; only allowed mutation entry points included (e.g., `insertIntoPost` exists but `deleteFromPost` does not) |
| All operations excluded on a table | Table excluded entirely (same as `false`) |

## Edge Cases

- **Unknown table names** in `PermissionConfig.tables` are silently ignored — they do not cause errors.
- **Tables already excluded** in the base `BuildSchemaConfig` remain excluded regardless of permission settings.
- **Empty schemas** (`restricted` with no tables granted) produce a valid `GraphQLSchema` with only `Query { _empty: Boolean }`.

## Row-Level Security

### `withRowSecurity(rules)`

Generate a `HooksConfig` that injects WHERE clauses for row-level filtering. Rules are applied as `before` hooks on `query`, `querySingle`, `count`, `update`, and `delete` operations (not `insert` or `insertSingle`).

```ts
import { withRowSecurity } from '@graphql-suite/schema'

const rlsHooks = withRowSecurity({
  posts: (context) => ({ authorId: { eq: context.user.id } }),
  comments: (context) => ({ userId: { eq: context.user.id } }),
})
```

**Signature:**
```ts
function withRowSecurity(
  rules: Record<string, (context: any) => Record<string, unknown>>,
): HooksConfig
```

Each rule function receives the GraphQL `context` and returns a filter object matching the table's `where` input shape. The generated hook merges this filter with any existing `where` argument from the query. When both the user-supplied filter and the security rule target the same field, the security rule's value **overrides** the user-supplied one (it is not ANDed). User-supplied filters on other fields are preserved.

## Hook Composition

### `mergeHooks(...configs)`

Deep-merge multiple `HooksConfig` objects with proper hook chaining.

```ts
import { mergeHooks, withRowSecurity } from '@graphql-suite/schema'

const hooks = mergeHooks(
  withRowSecurity({ posts: (ctx) => ({ authorId: { eq: ctx.user.id } }) }),
  authHooks,
  auditHooks,
)
```

**Signature:**
```ts
function mergeHooks(...configs: (HooksConfig | undefined)[]): HooksConfig
```

### Merge Behavior

| Hook Type | Behavior |
|-----------|----------|
| `before` | Chained sequentially — each hook receives the previous hook's modified `args` |
| `after` | Chained sequentially — each hook receives the previous hook's `result` |
| `resolve` | Last one wins (cannot be composed) |
| `resolve` + `before/after` | If existing is `resolve` and new has `before/after`, the new one replaces entirely |

`undefined` values in the arguments are skipped, making conditional composition safe:

```ts
mergeHooks(
  baseHooks,
  isProduction ? auditHooks : undefined,
  rlsHooks,
)
```

## Source Files

- `packages/schema/src/permissions.ts` — `permissive()`, `restricted()`, `readOnly()`, config merging
- `packages/schema/src/row-security.ts` — `withRowSecurity()`, `mergeHooks()`
- `packages/schema/src/types.ts` — `PermissionConfig`, `TableAccess` type definitions
- `packages/schema/src/schema-builder.ts` — `build()` method with `withPermissions` closure
