# @graphql-suite/query

> Part of [`graphql-suite`](https://github.com/annexare/graphql-suite).
> See also: [`schema`](../schema/README.md) | [`client`](../client/README.md)

TanStack React Query hooks for `graphql-suite/client` — type-safe data fetching with caching, pagination, and mutations.

## Installation

```bash
bun add @graphql-suite/query
```

```bash
npm install @graphql-suite/query
```

Or install the full suite:

```bash
bun add graphql-suite
```

```bash
npm install graphql-suite
```

## Setup

### Provider

Wrap your app with `<GraphQLProvider>` inside a `<QueryClientProvider>`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { GraphQLProvider } from 'graphql-suite/query'
import { client } from './graphql-client'

const queryClient = new QueryClient()

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <GraphQLProvider client={client}>
        {/* your app */}
      </GraphQLProvider>
    </QueryClientProvider>
  )
}
```

### `useGraphQLClient()`

Access the raw `GraphQLClient` instance from context:

```ts
import { useGraphQLClient } from 'graphql-suite/query'

function MyComponent() {
  const client = useGraphQLClient()
  // client.entity('user'), client.execute(query, variables), etc.
}
```

### `useEntity(entityName)`

Get a typed `EntityClient` for use with query and mutation hooks:

```ts
import { useEntity } from 'graphql-suite/query'

function UserList() {
  const user = useEntity('user')
  // Pass `user` to useEntityList, useEntityQuery, etc.
}
```

## Query Hooks

### `useEntityList(entity, params, options?)`

Fetch a list of records. Returns `UseQueryResult<T[]>`.

**Params**: `select`, `where`, `limit`, `offset`, `orderBy`

```tsx
import { useEntity, useEntityList } from 'graphql-suite/query'

function UserList() {
  const user = useEntity('user')
  const { data, isLoading, error } = useEntityList(user, {
    select: { id: true, name: true, email: true },
    where: { role: { eq: 'admin' } },
    orderBy: { name: { direction: 'asc', priority: 1 } },
    limit: 20,
  })

  if (isLoading) return <div>Loading...</div>
  if (error) return <div>Error: {error.message}</div>

  return (
    <ul>
      {data?.map((u) => <li key={u.id}>{u.name} ({u.email})</li>)}
    </ul>
  )
}
```

### `useEntityQuery(entity, params, options?)`

Fetch a single record. Returns `UseQueryResult<T | null>`.

**Params**: `select`, `where`, `offset`, `orderBy`

```tsx
function UserDetail({ userId }: { userId: string }) {
  const user = useEntity('user')
  const { data } = useEntityQuery(user, {
    select: { id: true, name: true, email: true, role: true },
    where: { id: { eq: userId } },
  })

  if (!data) return null
  return <div>{data.name} — {data.role}</div>
}
```

### `useEntityInfiniteQuery(entity, params, options?)`

Infinite scrolling with cursor-based pagination. Returns `UseInfiniteQueryResult` with pages containing `{ items: T[], count: number }`.

**Params**: `select`, `where`, `pageSize`, `orderBy`

```tsx
function InfiniteUserList() {
  const user = useEntity('user')
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useEntityInfiniteQuery(user, {
      select: { id: true, name: true },
      pageSize: 20,
      orderBy: { name: { direction: 'asc', priority: 1 } },
    })

  const allUsers = data?.pages.flatMap((page) => page.items) ?? []

  return (
    <div>
      <ul>
        {allUsers.map((u) => <li key={u.id}>{u.name}</li>)}
      </ul>
      {hasNextPage && (
        <button onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
          {isFetchingNextPage ? 'Loading...' : 'Load more'}
        </button>
      )}
    </div>
  )
}
```

### Query Options

All query hooks accept an optional `options` parameter:

| Option | Type | Description |
|--------|------|-------------|
| `enabled` | `boolean` | Disable automatic fetching |
| `gcTime` | `number` | Garbage collection time (ms) |
| `staleTime` | `number` | Time until data is considered stale (ms) |
| `refetchOnWindowFocus` | `boolean` | Refetch when window regains focus |
| `queryKey` | `unknown[]` | Override the auto-generated query key |

## Mutation Hooks

### `useEntityInsert(entity, returning?, options?)`

Insert records. Call `.mutate({ values })` to execute.

```tsx
function CreateUser() {
  const user = useEntity('user')
  const { mutate, isPending } = useEntityInsert(
    user,
    { id: true, name: true },
    { onSuccess: (data) => console.log('Created:', data) },
  )

  return (
    <button
      disabled={isPending}
      onClick={() => mutate({
        values: [{ name: 'Alice', email: 'alice@example.com' }],
      })}
    >
      Create User
    </button>
  )
}
```

### `useEntityUpdate(entity, returning?, options?)`

Update records. Call `.mutate({ set, where })` to execute.

```tsx
function UpdateRole({ userId }: { userId: string }) {
  const user = useEntity('user')
  const { mutate } = useEntityUpdate(user, { id: true, role: true })

  return (
    <button onClick={() => mutate({
      set: { role: 'admin' },
      where: { id: { eq: userId } },
    })}>
      Make Admin
    </button>
  )
}
```

### `useEntityDelete(entity, returning?, options?)`

Delete records. Call `.mutate({ where })` to execute.

```tsx
function DeleteUser({ userId }: { userId: string }) {
  const user = useEntity('user')
  const { mutate } = useEntityDelete(user, { id: true })

  return (
    <button onClick={() => mutate({
      where: { id: { eq: userId } },
    })}>
      Delete
    </button>
  )
}
```

### Mutation Options

All mutation hooks accept an optional `options` parameter:

| Option | Type | Description |
|--------|------|-------------|
| `invalidate` | `boolean` | Invalidate queries after mutation (default: `true`) |
| `invalidateKey` | `unknown[]` | Custom query key prefix to invalidate |
| `onSuccess` | `(data) => void` | Callback after successful mutation |
| `onError` | `(error) => void` | Callback after failed mutation |

## Cache Invalidation

By default, all mutations invalidate queries with the `['gql']` key prefix. Since all query hooks use keys starting with `['gql', ...]`, this means every mutation refreshes all GraphQL queries.

### Custom Invalidation Key

Narrow invalidation to specific queries:

```ts
const { mutate } = useEntityUpdate(user, { id: true }, {
  invalidateKey: ['gql', 'list'], // only invalidate list queries
})
```

### Disable Invalidation

```ts
const { mutate } = useEntityInsert(user, undefined, {
  invalidate: false,
})
```

### Query Key Override

Override the auto-generated key on query hooks for fine-grained cache control:

```ts
const { data } = useEntityList(user, params, {
  queryKey: ['users', 'admin-list'],
})
```

## Type Inference Flow

Types flow end-to-end from your Drizzle schema to hook return types:

```
Drizzle Schema (tables + relations)
  ↓ InferEntityDefs
EntityDefs (fields, filters, inputs, orderBy per table)
  ↓ createDrizzleClient
GraphQLClient<SchemaDescriptor, EntityDefs>
  ↓ useEntity / client.entity()
EntityClient<EntityDefs, EntityDef>
  ↓ useEntityList / useEntityQuery (select param)
InferResult<EntityDefs, EntityDef, Select>
  ↓
Fully typed data: only selected fields, relations resolve to T[] or T | null
```
