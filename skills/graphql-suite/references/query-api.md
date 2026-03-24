# Query API Reference

`@graphql-suite/query` — TanStack React Query hooks for the graphql-suite client.

## Provider

### `<GraphQLProvider>`

Provides the `GraphQLClient` to all hooks via React context. Must be nested inside `<QueryClientProvider>`.

```tsx
import { GraphQLProvider } from 'graphql-suite/query'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const queryClient = new QueryClient()

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <GraphQLProvider client={graphqlClient}>
        {children}
      </GraphQLProvider>
    </QueryClientProvider>
  )
}
```

**Props:**
- `client: GraphQLClient<TSchema, TDefs>` — GraphQL client instance
- `children: ReactNode`

### `useGraphQLClient()`

Access the `GraphQLClient` from context.

```ts
const client = useGraphQLClient()
```

**Throws:** Error if used outside `<GraphQLProvider>`

## Entity Access

### `useEntity(entityName)`

Get a typed `EntityClient` by entity name. Memoized — safe to call in render.

```ts
const user = useEntity('user')
// Returns EntityClient with full type inference
```

## Query Hooks

### `useEntityQuery(entity, params, options?)`

Fetch a single entity (first match).

```ts
const user = useEntity('user')
const { data, isLoading, error } = useEntityQuery(user, {
  select: { id: true, name: true, email: true },
  where: { id: { eq: userId } },
})
// data: InferResult<...> | null
```

**Params:**
| Field | Type | Description |
|-------|------|-------------|
| `select` | `Record<string, unknown>` | Fields to fetch (required) |
| `where` | Entity filters | Filter conditions |
| `offset` | `number` | Skip N results |
| `orderBy` | Entity orderBy | Sort order |

**Options:**
| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | `boolean` | `true` | Enable/disable the query |
| `gcTime` | `number` | TanStack default | Garbage collection time (ms) |
| `staleTime` | `number` | TanStack default | Stale time (ms) |
| `refetchOnWindowFocus` | `boolean` | TanStack default | Refetch on window focus |
| `queryKey` | `unknown[]` | auto-generated | Custom query key |

**Default query key:** `['gql', 'single', select, where, orderBy, offset]`

### `useEntityList(entity, params, options?)`

Fetch a list of entities with pagination.

```ts
const user = useEntity('user')
const { data, isLoading } = useEntityList(user, {
  select: { id: true, name: true },
  where: { active: { eq: true } },
  limit: 20,
  offset: 0,
  orderBy: { name: { direction: 'asc', priority: 1 } },
})
// data: InferResult<...>[]
```

**Params:**
| Field | Type | Description |
|-------|------|-------------|
| `select` | `Record<string, unknown>` | Fields to fetch (required) |
| `where` | Entity filters | Filter conditions |
| `limit` | `number` | Max results |
| `offset` | `number` | Skip N results |
| `orderBy` | Entity orderBy | Sort order |

**Options:** Same as `useEntityQuery`

**Default query key:** `['gql', 'list', select, where, orderBy, limit, offset]`

### `useEntityInfiniteQuery(entity, params, options?)`

Infinite scroll pagination. Fetches pages of data with automatic next-page detection via count query.

```tsx
const user = useEntity('user')
const {
  data,
  fetchNextPage,
  hasNextPage,
  isFetchingNextPage,
} = useEntityInfiniteQuery(user, {
  select: { id: true, name: true },
  pageSize: 20,
  orderBy: { name: { direction: 'asc', priority: 1 } },
})

// Flatten pages for rendering
const allUsers = data?.pages.flatMap((page) => page.items) ?? []
```

**Params:**
| Field | Type | Description |
|-------|------|-------------|
| `select` | `Record<string, unknown>` | Fields to fetch (required) |
| `pageSize` | `number` | Items per page (required) |
| `where` | Entity filters | Filter conditions |
| `orderBy` | Entity orderBy | Sort order |

**Options:**
| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | `boolean` | `true` | Enable/disable the query |
| `gcTime` | `number` | TanStack default | Garbage collection time (ms) |
| `staleTime` | `number` | TanStack default | Stale time (ms) |
| `queryKey` | `unknown[]` | auto-generated | Custom query key |

**Page data structure:**
```ts
type PageData<T> = { items: T[]; count: number }
// data.pages: PageData<InferResult<...>>[]
```

**Default query key:** `['gql', 'infinite', select, where, orderBy, pageSize]`

## Mutation Hooks

All mutation hooks return TanStack `UseMutationResult`. By default, successful mutations invalidate all queries with the `['gql']` key prefix.

### `useEntityInsert(entity, returning?, options?)`

```tsx
const user = useEntity('user')
const insertMutation = useEntityInsert(user, { id: true, name: true })

// Usage
insertMutation.mutate({
  values: [{ name: 'Alice', email: 'alice@example.com' }],
})
```

**Mutation variables:** `{ values: InsertInput[] }`
**Returns data:** `InferResult<...>[]`

### `useEntityUpdate(entity, returning?, options?)`

```tsx
const user = useEntity('user')
const updateMutation = useEntityUpdate(user, { id: true, name: true })

// Usage
updateMutation.mutate({
  set: { name: 'Updated Name' },
  where: { id: { eq: userId } },
})
```

**Mutation variables:** `{ set: UpdateInput; where?: Filters }`
**Returns data:** `InferResult<...>[]`

### `useEntityDelete(entity, returning?, options?)`

```tsx
const user = useEntity('user')
const deleteMutation = useEntityDelete(user, { id: true })

// Usage
deleteMutation.mutate({
  where: { id: { eq: userId } },
})
```

**Mutation variables:** `{ where?: Filters }`
**Returns data:** `InferResult<...>[]`

### Mutation Options

All three mutation hooks accept the same options:

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `invalidate` | `boolean` | `true` | Invalidate queries on success |
| `invalidateKey` | `unknown[]` | `['gql']` | Query key prefix to invalidate |
| `onSuccess` | `(data) => void` | — | Callback after successful mutation + invalidation |
| `onError` | `(error) => void` | — | Callback on mutation failure |

## Cache Invalidation

### Default Behavior

All mutations invalidate queries with the `['gql']` prefix by default. This means all `useEntityQuery`, `useEntityList`, and `useEntityInfiniteQuery` results are invalidated.

### Custom Invalidation

```ts
// Invalidate only user-related queries
useEntityInsert(user, { id: true }, {
  invalidateKey: ['gql', 'user'],
})

// Disable invalidation entirely
useEntityUpdate(user, { id: true }, {
  invalidate: false,
})
```

### Custom Query Keys

Override the default query key to control invalidation scope:

```ts
useEntityList(user, { select, limit: 10 }, {
  queryKey: ['gql', 'user', 'active-list'],
})
```

## Source Files

- `packages/query/src/index.ts` — Public API exports
- `packages/query/src/provider.tsx` — GraphQLProvider component, useGraphQLClient hook
- `packages/query/src/useEntity.ts` — useEntity hook
- `packages/query/src/useEntityQuery.ts` — useEntityQuery hook
- `packages/query/src/useEntityList.ts` — useEntityList hook
- `packages/query/src/useEntityInfiniteQuery.ts` — useEntityInfiniteQuery hook
- `packages/query/src/useEntityMutation.ts` — useEntityInsert, useEntityUpdate, useEntityDelete hooks
