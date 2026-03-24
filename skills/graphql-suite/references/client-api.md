# Client API Reference

`@graphql-suite/client` — Type-safe GraphQL client with entity-based API for graphql-suite servers.

## Functions

### `createDrizzleClient(options)`

Recommended entry point. Creates a `GraphQLClient` from your Drizzle schema with full type inference for filters, inputs, and results.

```ts
import { createDrizzleClient } from 'graphql-suite/client'
import * as schema from './db/schema'

const client = createDrizzleClient({
  schema,
  config: { suffixes: { list: 's' } },
  url: '/api/graphql',
  headers: () => ({ Authorization: `Bearer ${getToken()}` }),
})
```

**Parameters:**

```ts
type DrizzleClientConfig<TSchema, TConfig> = {
  schema: TSchema                                // Drizzle schema module (tables + relations)
  config: TConfig                                // ClientSchemaConfig
  url: string | (() => string)                   // GraphQL endpoint (static or dynamic)
  headers?: HeadersInit | (() => HeadersInit | Promise<HeadersInit>)  // Optional headers
}
```

**Returns:** `GraphQLClient<SchemaDescriptor, InferEntityDefs<TSchema, TConfig>>`

### `createClient(config)`

Alternative entry point for pre-generated schema descriptors (from codegen workflow).

```ts
import { createClient } from 'graphql-suite/client'
import { schema, type EntityDefs } from './generated/entity-defs'

const client = createClient<typeof schema, EntityDefs>({
  schema,
  url: '/api/graphql',
})
```

**Parameters:**

```ts
type ClientConfig<TSchema extends SchemaDescriptor> = {
  url: string | (() => string)
  schema: TSchema
  headers?: HeadersInit | (() => HeadersInit | Promise<HeadersInit>)
}
```

**Returns:** `GraphQLClient<TSchema, TDefs>`

### `buildSchemaDescriptor(schema, config?)`

Build a schema descriptor from Drizzle schema exports. Used internally by `createDrizzleClient` and in codegen workflows.

```ts
import { buildSchemaDescriptor } from 'graphql-suite/client'
import * as schema from './db/schema'

const descriptor = buildSchemaDescriptor(schema, { suffixes: { list: 's' } })
```

**Parameters:**
- `schema: Record<string, unknown>` — Drizzle schema module
- `config?: ClientSchemaConfig` — Optional configuration

**Returns:** `SchemaDescriptor` (record of entity descriptors)

## GraphQLClient Class

### `client.entity(entityName)`

Get a typed entity client for performing operations on a specific table.

```ts
const users = client.entity('user')
```

**Returns:** `EntityClient<TDefs, TDefs[TEntityName]>`
**Throws:** `Error` if entity name not found in schema

### `client.execute(query, variables?)`

Execute a raw GraphQL query.

```ts
const result = await client.execute(
  `query { user { id name } }`,
  { limit: 10 }
)
```

**Returns:** `Promise<Record<string, unknown>>`
**Throws:** `NetworkError` on HTTP failures, `GraphQLClientError` on GraphQL errors

## EntityClient Methods

All methods return promises and build GraphQL queries/mutations automatically.

### `query(params)`

List query with filtering, pagination, and ordering.

```ts
const users = await entity.query({
  select: { id: true, name: true, posts: { id: true, title: true } },
  where: { name: { ilike: '%john%' } },
  limit: 10,
  offset: 0,
  orderBy: { name: { direction: 'asc', priority: 1 } },
})
// Returns: InferResult<...>[]
```

### `querySingle(params)`

Single entity query (first match).

```ts
const user = await entity.querySingle({
  select: { id: true, name: true },
  where: { id: { eq: 'some-uuid' } },
})
// Returns: InferResult<...> | null
```

### `count(params?)`

Count matching entities.

```ts
const total = await entity.count({
  where: { active: { eq: true } },
})
// Returns: number
```

### `insert(params)`

Insert multiple entities.

```ts
const created = await entity.insert({
  values: [
    { name: 'Alice', email: 'alice@example.com' },
    { name: 'Bob', email: 'bob@example.com' },
  ],
  returning: { id: true, name: true },
})
// Returns: InferResult<...>[]
```

### `insertSingle(params)`

Insert a single entity.

```ts
const created = await entity.insertSingle({
  values: { name: 'Alice', email: 'alice@example.com' },
  returning: { id: true, name: true },
})
// Returns: InferResult<...> | null
```

### `update(params)`

Update matching entities.

```ts
const updated = await entity.update({
  set: { name: 'Updated Name' },
  where: { id: { eq: 'some-uuid' } },
  returning: { id: true, name: true },
})
// Returns: InferResult<...>[]
```

### `delete(params)`

Delete matching entities.

```ts
const deleted = await entity.delete({
  where: { active: { eq: false } },
  returning: { id: true },
})
// Returns: InferResult<...>[]
```

## Dynamic URL and Headers

Both URL and headers support static values and functions:

```ts
// Static
createDrizzleClient({ url: 'https://api.example.com/graphql', ... })

// Dynamic URL (called on each request)
createDrizzleClient({ url: () => `${getBaseUrl()}/graphql`, ... })

// Dynamic headers (supports async)
createDrizzleClient({
  headers: async () => {
    const token = await getToken()
    return { Authorization: `Bearer ${token}` }
  },
  ...
})
```

## Error Classes

### `GraphQLClientError`

Thrown when the GraphQL response contains errors.

```ts
import { GraphQLClientError } from 'graphql-suite/client'

class GraphQLClientError extends Error {
  readonly errors: GraphQLErrorEntry[]  // All GraphQL errors
  readonly status: number               // HTTP status (default: 200)
}

type GraphQLErrorEntry = {
  message: string
  locations?: { line: number; column: number }[]
  path?: (string | number)[]
  extensions?: Record<string, unknown>
}
```

### `NetworkError`

Thrown on HTTP/network failures (non-OK status, fetch errors).

```ts
import { NetworkError } from 'graphql-suite/client'

class NetworkError extends Error {
  readonly status: number  // HTTP status code
}
```

## Types

### `SchemaDescriptor`

```ts
type SchemaDescriptor = Record<string, EntityDescriptor>
```

### `EntityDescriptor`

```ts
type EntityDescriptor = {
  queryName: string           // e.g., 'user'
  queryListName: string       // e.g., 'users'
  countName: string           // e.g., 'userCount'
  insertName: string          // e.g., 'insertIntoUser'
  insertSingleName: string    // e.g., 'insertIntoUserSingle'
  updateName: string          // e.g., 'updateUser'
  deleteName: string          // e.g., 'deleteFromUser'
  fields: readonly string[]
  relations: Record<string, { entity: string; type: 'one' | 'many' }>
}
```

### `EntityDef`

```ts
type EntityDef = {
  fields: Record<string, unknown>
  relations: Record<string, { entity: string; type: 'one' | 'many' }>
  filters?: Record<string, unknown>
  insertInput?: Record<string, unknown>
  updateInput?: Record<string, unknown>
  orderBy?: Record<string, unknown>
}
```

### `SelectInput<TDefs, TEntity>`

Recursive type for nested field selection. Set scalar fields to `true` and relation fields to a nested `SelectInput`.

### `InferResult<TDefs, TEntity, TSelect>`

Infers the return type from a select object. Scalars resolve to their wire format types (Date becomes string), relations resolve recursively.

### `InferEntityDefs<TSchema, TConfig>`

Master type that builds `EntityDefs` from Drizzle schema. Used internally by `createDrizzleClient`.

### `ClientSchemaConfig`

```ts
type ClientSchemaConfig = {
  mutations?: boolean
  suffixes?: { list?: string; single?: string }
  tables?: { exclude?: readonly string[] }
  pruneRelations?: Record<string, false | 'leaf' | { only: string[] }>
}
```

## Source Files

- `packages/client/src/index.ts` — Public API exports
- `packages/client/src/client.ts` — GraphQLClient class, createDrizzleClient factory
- `packages/client/src/entity.ts` — EntityClient type and factory
- `packages/client/src/errors.ts` — GraphQLClientError, NetworkError
- `packages/client/src/schema-builder.ts` — buildSchemaDescriptor, ClientSchemaConfig
- `packages/client/src/query-builder.ts` — GraphQL query/mutation string builders
- `packages/client/src/infer.ts` — TypeScript type inference utilities
- `packages/client/src/types.ts` — Core type definitions
