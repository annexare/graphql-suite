# Schema API Reference

`@graphql-suite/schema` — Server-side GraphQL schema builder from Drizzle PostgreSQL table definitions.

## Functions

### `buildSchema(db, config?)`

Build a complete GraphQL schema with queries and mutations from a Drizzle database instance.

```ts
import { buildSchema } from '@graphql-suite/schema'

const { schema, entities, withPermissions, clearPermissionCache } = buildSchema(db, {
  tables: { exclude: ['session'] },
  limitRelationDepth: 3,
})
```

**Parameters:**
- `db: PgDatabase` — Drizzle PostgreSQL database instance (must have `db._.fullSchema`)
- `config?: BuildSchemaConfig` — Optional configuration

**Returns:** `{ schema: GraphQLSchema; entities: GeneratedEntities; withPermissions: (permissions: PermissionConfig) => GraphQLSchema; clearPermissionCache: (id?: string) => void }`

**Requirements:** Drizzle ORM v0.30.9+ (needs `db._.fullSchema`)

### `buildEntities(db, config?)`

Build only the entities (queries, mutations, input types, output types) without wrapping in a full `GraphQLSchema`. Useful when composing with other schema tools.

```ts
import { buildEntities } from '@graphql-suite/schema'

const entities = buildEntities(db)
// entities.queries, entities.mutations, entities.inputs, entities.types
```

**Parameters:** Same as `buildSchema`
**Returns:** `GeneratedEntities`

### `buildSchemaFromDrizzle(drizzleSchema, config?)`

Build a schema directly from Drizzle schema exports without a database connection. Creates a mock db with stub resolvers — intended for schema introspection and code generation only, not query execution.

```ts
import { buildSchemaFromDrizzle } from '@graphql-suite/schema'
import * as schema from './db/schema'

const { schema: gqlSchema, withPermissions, clearPermissionCache } = buildSchemaFromDrizzle(schema)
```

**Parameters:**
- `drizzleSchema: Record<string, unknown>` — Drizzle schema module exports (tables + relations)
- `config?: BuildSchemaConfig` — Optional configuration

**Returns:** `{ schema: GraphQLSchema; entities: GeneratedEntities; withPermissions: (permissions: PermissionConfig) => GraphQLSchema; clearPermissionCache: (id?: string) => void }`

### `parseResolveInfo(info)`

```ts
function parseResolveInfo(info: GraphQLResolveInfo): ResolveTree | null
```

Builds a selection tree for the field currently being resolved — what the schema builder uses to
prune columns and derive nested relation arguments. Exported for use in any custom resolver.

```ts
import { parseResolveInfo } from '@graphql-suite/schema'

const resolve = (_source, _args, _context, info) => {
  const tree = parseResolveInfo(info)
  const selected = Object.keys(tree?.fieldsByTypeName.UserSelectItem ?? {})
}
```

Fragments and inline fragments are inlined against their type condition, `@skip` / `@include` are
applied, arguments are coerced (variables and defaults included), and introspection meta-fields are
omitted. Returns `null` when `info` carries no usable field node.

Uses only root exports of `graphql`, so one copy of the library serves both graphql 16 and 17. It
replaces `graphql-parse-resolve-info` (peer range stops at graphql 16) and produces the same
`ResolveTree` shape.

## Types

### `ResolveTree`

```ts
type ResolveTree = {
  name: string                        // field name in the schema
  alias: string                       // response key (alias when present)
  args: Record<string, unknown>       // coerced args, variables and defaults applied
  fieldsByTypeName: FieldsByTypeName  // sub-selection, keyed by the type it was selected on
}

type FieldsByTypeName = Record<string, Record<string, ResolveTree>>
```


### `GeneratedEntities`

```ts
type GeneratedEntities = {
  queries: Record<string, GraphQLFieldConfig<any, any>>
  mutations: Record<string, GraphQLFieldConfig<any, any>>
  inputs: Record<string, GraphQLInputObjectType>
  types: Record<string, GraphQLObjectType>
}
```

### `BuildSchemaConfig`

See [configuration.md](configuration.md) for full details.

```ts
type BuildSchemaConfig = {
  mutations?: boolean                        // default: true
  limitRelationDepth?: number                // default: 3
  limitSelfRelationDepth?: number            // default: 1
  suffixes?: { list?: string; single?: string }
  hooks?: HooksConfig
  tables?: {
    exclude?: string[]
    config?: Record<string, TableOperations>
  }
  pruneRelations?: Record<string, RelationPruneRule>
  debug?: boolean | { schemaSize?: boolean; relationTree?: boolean }
}
```

### `HooksConfig`

```ts
type HooksConfig = {
  [tableName: string]: TableHookConfig
}

type TableHookConfig = {
  [K in OperationType]?: OperationHooks
}

type OperationType =
  | 'query' | 'querySingle' | 'count'
  | 'insert' | 'insertSingle'
  | 'update' | 'delete'
```

### `OperationHooks`

Two mutually exclusive patterns:

```ts
// Pattern 1: Before/After
type OperationHooks = {
  before?: BeforeHookFn
  after?: AfterHookFn
}

// Pattern 2: Resolve (replaces entire resolver)
type OperationHooks = {
  resolve: ResolveHookFn
}
```

### Hook Function Signatures

```ts
type BeforeHookFn = (ctx: HookContext) =>
  Promise<BeforeHookResult | undefined> | BeforeHookResult | undefined

type AfterHookFn = (ctx: AfterHookContext) => Promise<any> | any

type ResolveHookFn = (ctx: ResolveHookContext) => Promise<any> | any

type HookContext = { args: any; context: any; info: GraphQLResolveInfo }
type BeforeHookResult = { args?: any; data?: any }
type AfterHookContext = { result: any; beforeData: any; context: any; info: GraphQLResolveInfo }
type ResolveHookContext = HookContext & { defaultResolve: (overrideArgs?: any) => Promise<any> }
```

### `TableOperations`

```ts
type TableOperations = {
  queries?: boolean     // default: true
  mutations?: boolean   // default: follows global `mutations`
}
```

### `RelationPruneRule`

```ts
type RelationPruneRule =
  | false              // Omit relation entirely
  | 'leaf'             // Expand with scalar columns only (no nested relations)
  | { only: string[] } // Expand with only listed child relation fields
```

### `permissive(id, tables?)`

Create a permissive permission config — all tables allowed by default; overrides deny.

```ts
import { permissive, readOnly } from '@graphql-suite/schema'

const config = permissive('maintainer', {
  audit: false,          // exclude entirely
  users: readOnly(),     // queries only
})
```

**Parameters:**
- `id: string` — Unique identifier for caching
- `tables?: Record<string, boolean | TableAccess>` — Per-table overrides

**Returns:** `PermissionConfig`

### `restricted(id, tables?)`

Create a restricted permission config — nothing allowed by default; overrides grant.

```ts
import { restricted } from '@graphql-suite/schema'

const config = restricted('user', {
  posts: { query: true },
  comments: { query: true },
})
```

**Parameters:**
- `id: string` — Unique identifier for caching
- `tables?: Record<string, boolean | TableAccess>` — Per-table overrides

**Returns:** `PermissionConfig`

### `readOnly()`

Create a `TableAccess` shorthand that allows queries only.

```ts
import { readOnly } from '@graphql-suite/schema'

readOnly() // => { query: true, insert: false, update: false, delete: false }
```

**Returns:** `TableAccess`

### `clearPermissionCache(id?)`

Evict cached permission schemas. Returned alongside `withPermissions` from `buildSchema()` / `buildSchemaFromDrizzle()`.

```ts
const { withPermissions, clearPermissionCache } = buildSchema(db, config)

// Clear all cached permission schemas
clearPermissionCache()

// Clear a specific cached entry
clearPermissionCache('user-123')
```

**Parameters:**
- `id?: string` — If provided, removes only that entry; otherwise clears the entire cache

**Returns:** `void`

> **Note:** When `withPermissions` IDs come from per-user data (e.g., user IDs), the cache can grow without bound. Use `clearPermissionCache` to manage cache size — for example, evict a user's entry on logout or periodically clear the full cache.

### `withRowSecurity(rules)`

Generate a `HooksConfig` that injects WHERE clauses from row-level security rules. Rules are applied as `before` hooks on `query`, `querySingle`, `count`, `update`, and `delete` operations.

```ts
import { withRowSecurity } from '@graphql-suite/schema'

const hooks = withRowSecurity({
  posts: (context) => ({ authorId: { eq: context.user.id } }),
})
```

**Parameters:**
- `rules: Record<string, (context: any) => Record<string, unknown>>` — Per-table rule functions

**Returns:** `HooksConfig`

### `mergeHooks(...configs)`

Deep-merge multiple `HooksConfig` objects with proper hook chaining.

```ts
import { mergeHooks, withRowSecurity } from '@graphql-suite/schema'

const hooks = mergeHooks(withRowSecurity(rules), authHooks, auditHooks)
```

**Parameters:**
- `...configs: (HooksConfig | undefined)[]` — Hook configs to merge (undefined values are skipped)

**Returns:** `HooksConfig`

**Merge behavior:**
- `before` hooks — chained sequentially; each receives the previous hook's modified args
- `after` hooks — chained sequentially; each receives the previous hook's result
- `resolve` hooks — last one wins (cannot be composed)

## Custom Scalar

### `GraphQLJSON`

Custom scalar for `json` and `jsonb` columns. Handles serialization/parsing for both input and output.

```ts
import { GraphQLJSON } from '@graphql-suite/schema'
```

## `SchemaBuilder` Class

The `SchemaBuilder` class is exported for advanced use cases. Usually you'll use `buildSchema()` instead.

```ts
import { SchemaBuilder } from '@graphql-suite/schema'

const builder = new SchemaBuilder(db, config)
const { schema, entities, withPermissions, clearPermissionCache } = builder.build()
// or
const entities = builder.buildEntities()
```

## Generated Schema Structure

For a table named `user` with columns `id`, `name`, `email` and a `posts` relation:

### Queries

| Operation | Generated Name | Arguments |
|-----------|---------------|-----------|
| List | `user` | `offset?: Int, limit?: Int, where?: UserFilters, orderBy?: UserOrderBy` |
| Single | `userSingle` | `offset?: Int, where?: UserFilters, orderBy?: UserOrderBy` |
| Count | `userCount` | `where?: UserFilters` |

### Mutations

| Operation | Generated Name | Arguments |
|-----------|---------------|-----------|
| Insert | `insertIntoUser` | `values: [UserInsertInput!]!` |
| Insert single | `insertIntoUserSingle` | `values: UserInsertInput!` |
| Update | `updateUser` | `set: UserUpdateInput!, where?: UserFilters` |
| Delete | `deleteFromUser` | `where?: UserFilters` |

### Generated Types

| Type | Description |
|------|-------------|
| `UserSelectItem` | Output type with scalars + nested relation fields |
| `UserItem` | Mutation return type (scalar columns only) |
| `UserFilters` | Filter input with column operators + relation filters + `OR` |
| `UserInsertInput` | Insert input (required columns are non-null) |
| `UserUpdateInput` | Update input (all columns optional) |
| `UserOrderBy` | Order by input with `{ direction, priority }` per column |

### Column Filter Operators

Every column filter supports:
- **Comparison:** `eq`, `ne`, `lt`, `lte`, `gt`, `gte`
- **Pattern:** `like`, `notLike`, `ilike`, `notIlike`
- **Array:** `inArray`, `notInArray`
- **Null:** `isNull`, `isNotNull`
- **Logical:** `OR` (array of filter objects)

### Relation Filter Arguments

- **One relations:** Direct filter object (e.g., `author: UserFilters`)
- **Many relations:** Quantifier with `some`, `every`, `none` (e.g., `posts: { some: PostFilters }`)
- **Many relation fields** on SelectItem types also accept: `where`, `orderBy`, `offset`, `limit`

## Error Handling

Schema builder errors are prefixed with `"GraphQL-Suite Error: "`.

In resolvers, errors are caught and re-thrown as `GraphQLError`:

```ts
catch (e: unknown) {
  if (typeof e === 'object' && e !== null && 'message' in e && typeof e.message === 'string') {
    throw new GraphQLError(e.message)
  }
  throw e
}
```

## Source Files

- `packages/schema/src/index.ts` — Public API exports
- `packages/schema/src/types.ts` — Type definitions
- `packages/schema/src/schema-builder.ts` — SchemaBuilder class
- `packages/schema/src/codegen.ts` — Code generation functions
- `packages/schema/src/adapters/pg.ts` — PostgreSQL adapter
- `packages/schema/src/graphql/type-builder.ts` — Drizzle column to GraphQL type converter
- `packages/schema/src/graphql/scalars.ts` — GraphQLJSON scalar
- `packages/schema/src/graphql/resolve-info.ts` — `parseResolveInfo()` selection-tree parser
- `packages/schema/src/data-mappers.ts` — Data transformation between Drizzle and GraphQL
- `packages/schema/src/case-ops.ts` — String case utilities
- `packages/schema/src/permissions.ts` — Permission helpers and config merging
- `packages/schema/src/row-security.ts` — `withRowSecurity()` and `mergeHooks()`
