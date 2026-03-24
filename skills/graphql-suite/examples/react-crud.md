# React CRUD

Full React CRUD component using all query and mutation hooks.

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  GraphQLProvider,
  useEntity,
  useEntityDelete,
  useEntityInfiniteQuery,
  useEntityInsert,
  useEntityList,
  useEntityQuery,
  useEntityUpdate,
} from '@graphql-suite/query'
import { useState } from 'react'

import { client } from './graphql-client' // Your createDrizzleClient instance

// ─── App Setup ───────────────────────────────────────────────

const queryClient = new QueryClient()

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <GraphQLProvider client={client}>
        <UserManager />
      </GraphQLProvider>
    </QueryClientProvider>
  )
}

// ─── User List with Pagination ───────────────────────────────

function UserManager() {
  const user = useEntity('user')

  // List query with filters and pagination
  const { data: users, isLoading } = useEntityList(user, {
    select: { id: true, name: true, email: true },
    limit: 20,
    orderBy: { name: { direction: 'asc', priority: 1 } },
  })

  // Insert mutation
  const insertMutation = useEntityInsert(
    user,
    { id: true, name: true, email: true }, // returning fields
    {
      onSuccess: (data) => console.log('Created:', data),
      onError: (error) => console.error('Insert failed:', error),
    },
  )

  // Update mutation
  const updateMutation = useEntityUpdate(
    user,
    { id: true, name: true },
    { invalidateKey: ['gql'] }, // invalidate all gql queries
  )

  // Delete mutation
  const deleteMutation = useEntityDelete(user, { id: true })

  if (isLoading) return <div>Loading users...</div>

  return (
    <div>
      <h1>Users</h1>
      <button
        type="button"
        onClick={() =>
          insertMutation.mutate({
            values: [{ name: 'New User', email: 'new@example.com' }],
          })
        }
      >
        Add User
      </button>

      <ul>
        {users?.map((u) => (
          <li key={u.id}>
            {u.name} ({u.email})
            <button
              type="button"
              onClick={() =>
                updateMutation.mutate({
                  set: { name: `${u.name} (edited)` },
                  where: { id: { eq: u.id } },
                })
              }
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() =>
                deleteMutation.mutate({
                  where: { id: { eq: u.id } },
                })
              }
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ─── Single Entity Query ────────────────────────────────────

function UserDetail({ userId }: { userId: string }) {
  const user = useEntity('user')
  const { data, isLoading, error } = useEntityQuery(user, {
    select: {
      id: true,
      name: true,
      email: true,
      posts: { id: true, title: true },
    },
    where: { id: { eq: userId } },
  })

  if (isLoading) return <div>Loading...</div>
  if (error) return <div>Error: {error.message}</div>
  if (!data) return <div>User not found</div>

  return (
    <div>
      <h2>{data.name}</h2>
      <p>{data.email}</p>
      <h3>Posts</h3>
      <ul>
        {data.posts?.map((p) => (
          <li key={p.id}>{p.title}</li>
        ))}
      </ul>
    </div>
  )
}

// ─── Infinite Scroll ─────────────────────────────────────────

function InfiniteUserList() {
  const user = useEntity('user')
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useEntityInfiniteQuery(user, {
    select: { id: true, name: true },
    pageSize: 20,
    orderBy: { name: { direction: 'asc', priority: 1 } },
  })

  const allUsers = data?.pages.flatMap((page) => page.items) ?? []

  return (
    <div>
      <ul>
        {allUsers.map((u) => (
          <li key={u.id}>{u.name}</li>
        ))}
      </ul>
      {hasNextPage && (
        <button type="button" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
          {isFetchingNextPage ? 'Loading...' : 'Load More'}
        </button>
      )}
    </div>
  )
}

// ─── Conditional Query ───────────────────────────────────────

function SearchUsers() {
  const [search, setSearch] = useState('')
  const user = useEntity('user')

  // Only runs when search has 2+ characters
  const { data } = useEntityList(
    user,
    {
      select: { id: true, name: true },
      where: { name: { ilike: `%${search}%` } },
      limit: 10,
    },
    { enabled: search.length >= 2 },
  )

  return (
    <div>
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search users..."
      />
      <ul>
        {data?.map((u) => (
          <li key={u.id}>{u.name}</li>
        ))}
      </ul>
    </div>
  )
}
```
