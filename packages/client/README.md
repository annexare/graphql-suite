# @graphql-suite/client

> Part of [`graphql-suite`](https://github.com/annexare/graphql-suite).
> See also: [`schema`](../schema/README.md) | [`query`](../query/README.md)

Type-safe GraphQL client auto-generated from Drizzle schemas, with full TypeScript inference for queries, mutations, filters, and relations.

## Installation

```bash
bun add @graphql-suite/client
```

```bash
npm install @graphql-suite/client
```

Or install the full suite:

```bash
bun add graphql-suite
```

```bash
npm install graphql-suite
```

## Quick Start

### From Drizzle Schema (recommended)

Use `createDrizzleClient` to create a client that infers all types directly from your Drizzle schema module — no code generation needed.

```ts
import { createDrizzleClient } from '@graphql-suite/client'
import * as schema from './db/schema'

const client = createDrizzleClient({
  schema,
  config: {
    suffixes: { list: 's' },
    tables: { exclude: ['session', 'verification'] },
  },
  url: '/api/graphql',
  headers: { Authorization: 'Bearer ...' },
})
```

### From Schema Descriptor (separate-repo setups)

Use `createClient` with a codegen-generated schema descriptor when the client is in a separate repository that can't import the Drizzle schema directly.

```ts
import { createClient } from '@graphql-suite/client'
import { schema, type EntityDefs } from './generated/entity-defs'

const client = createClient<typeof schema, EntityDefs>({
  schema,
  url: '/api/graphql',
})
```

## EntityClient API

Access a typed entity client via `client.entity('name')`:

```ts
const user = client.entity('user')
```

Each entity client provides the following methods:

### `query(params)`

Fetch a list of records with optional filtering, pagination, and ordering. Returns `T[]`.

```ts
const users = await user.query({
  select: {
    id: true,
    name: true,
    email: true,
    posts: {
      id: true,
      title: true,
      comments: { id: true, body: true },
    },
  },
  where: { email: { ilike: '%@example.com' } },
  orderBy: { name: { direction: 'asc', priority: 1 } },
  limit: 20,
  offset: 0,
})
```

### `querySingle(params)`

Fetch a single record. Returns `T | null`.

```ts
const found = await user.querySingle({
  select: { id: true, name: true, email: true },
  where: { id: { eq: 'some-uuid' } },
})
```

### `count(params?)`

Count matching records. Returns `number`.

```ts
const total = await user.count({
  where: { role: { eq: 'admin' } },
})
```

### `insert(params)`

Insert multiple records. Returns `T[]` of inserted rows.

```ts
const created = await user.insert({
  values: [
    { name: 'Alice', email: 'alice@example.com' },
    { name: 'Bob', email: 'bob@example.com' },
  ],
  returning: { id: true, name: true },
})
```

### `insertSingle(params)`

Insert a single record. Returns `T | null`.

```ts
const created = await user.insertSingle({
  values: { name: 'Alice', email: 'alice@example.com' },
  returning: { id: true, name: true },
})
```

### `update(params)`

Update records matching a filter. Returns `T[]` of updated rows.

```ts
const updated = await user.update({
  set: { role: 'admin' },
  where: { id: { eq: 'some-uuid' } },
  returning: { id: true, role: true },
})
```

### `delete(params)`

Delete records matching a filter. Returns `T[]` of deleted rows.

```ts
const deleted = await user.delete({
  where: { deletedAt: { isNotNull: true } },
  returning: { id: true },
})
```

## Schema Descriptor

A `SchemaDescriptor` is a runtime object mapping entity names to their operation names, fields, and relations. It tells the client how to build GraphQL queries.

### `buildSchemaDescriptor(schema, config?)`

Builds a `SchemaDescriptor` from a Drizzle schema module. This is called internally by `createDrizzleClient`, but can be used directly if you need the descriptor.

```ts
import { buildSchemaDescriptor } from '@graphql-suite/client'
import * as schema from './db/schema'

const descriptor = buildSchemaDescriptor(schema, {
  suffixes: { list: 's' },
  tables: { exclude: ['session'] },
  pruneRelations: { 'user.sessions': false },
})
```

Config options mirror the schema package: `mutations`, `suffixes`, `tables.exclude`, and `pruneRelations`.

## Type Inference

The client provides end-to-end type inference from Drizzle schema to query results:

### `InferEntityDefs<TSchema, TConfig>`

Infers the complete entity type definitions from a Drizzle schema module, including fields (with Date → string wire conversion), relations, filters, insert inputs, update inputs, and orderBy types.

```ts
import type { InferEntityDefs } from '@graphql-suite/client'
import type * as schema from './db/schema'

type MyEntityDefs = InferEntityDefs<typeof schema, { tables: { exclude: ['session'] } }>
```

### `InferResult<TDefs, TEntity, TSelect>`

Infers the return type of a query from the `select` object. Only selected scalar fields and relations are included in the result type. Relations resolve to arrays or `T | null` based on their cardinality.

### `SelectInput<TDefs, TEntity>`

Describes the valid shape of a `select` parameter — `true` for scalar fields, nested objects for relations.

## Dynamic URL and Headers

Both `url` and `headers` support static values or functions (sync or async) that are called per-request:

```ts
const client = createDrizzleClient({
  schema,
  config: {},
  // Dynamic URL
  url: () => `${getApiBase()}/graphql`,
  // Async headers (e.g., refresh token)
  headers: async () => ({
    Authorization: `Bearer ${await getAccessToken()}`,
  }),
})
```

## Error Handling

The client throws two error types:

### `GraphQLClientError`

Thrown when the server returns GraphQL errors in the response body.

- **`errors`** — `Array<{ message, locations?, path?, extensions? }>` — individual GraphQL errors
- **`status`** — HTTP status code (usually `200`)
- **`message`** — concatenated error messages

### `NetworkError`

Thrown when the HTTP request fails (network error or non-2xx status).

- **`status`** — HTTP status code (`0` for network failures)
- **`message`** — error description

```ts
import { GraphQLClientError, NetworkError } from '@graphql-suite/client'

try {
  const users = await client.entity('user').query({
    select: { id: true, name: true },
  })
} catch (e) {
  if (e instanceof GraphQLClientError) {
    console.error('GraphQL errors:', e.errors)
  } else if (e instanceof NetworkError) {
    console.error('Network error:', e.status, e.message)
  }
}
```
