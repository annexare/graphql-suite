# Client Operations

Type-safe GraphQL client with all 7 entity operations.

```ts
import { createDrizzleClient, GraphQLClientError, NetworkError } from 'graphql-suite/client'

import * as schema from './db/schema'

// ─── Create Client ───────────────────────────────────────────

const client = createDrizzleClient({
  schema,
  config: {
    // Must match server config
    suffixes: { list: 's', single: 'Single' },
    tables: { exclude: ['session'] },
  },
  url: '/api/graphql',
  // Dynamic headers (supports async functions)
  headers: async () => {
    const token = await getAuthToken()
    return { Authorization: `Bearer ${token}` }
  },
})

// ─── Query: List ─────────────────────────────────────────────

const users = await client.entity('user').query({
  select: {
    id: true,
    name: true,
    email: true,
    // Nested relation selection
    posts: {
      id: true,
      title: true,
      comments: { id: true, body: true },
    },
  },
  where: {
    name: { ilike: '%john%' },
    // Relation filtering: users who have at least one published post
    posts: { some: { published: { eq: 'published' } } },
  },
  limit: 10,
  offset: 0,
  orderBy: {
    name: { direction: 'asc', priority: 1 },
    createdAt: { direction: 'desc', priority: 2 },
  },
})

// ─── Query: Single ───────────────────────────────────────────

const user = await client.entity('user').querySingle({
  select: { id: true, name: true, email: true },
  where: { id: { eq: 'some-uuid' } },
})
// Returns: { id, name, email } | null

// ─── Query: Count ────────────────────────────────────────────

const totalUsers = await client.entity('user').count({
  where: { email: { ilike: '%@company.com' } },
})
// Returns: number

// ─── Mutation: Insert ────────────────────────────────────────

const newUsers = await client.entity('user').insert({
  values: [
    { name: 'Alice', email: 'alice@example.com' },
    { name: 'Bob', email: 'bob@example.com' },
  ],
  returning: { id: true, name: true, email: true },
})
// Returns: { id, name, email }[]

// ─── Mutation: Insert Single ─────────────────────────────────

const newUser = await client.entity('user').insertSingle({
  values: { name: 'Charlie', email: 'charlie@example.com' },
  returning: { id: true, name: true },
})
// Returns: { id, name } | null

// ─── Mutation: Update ────────────────────────────────────────

const updated = await client.entity('user').update({
  set: { name: 'Updated Name' },
  where: { id: { eq: 'some-uuid' } },
  returning: { id: true, name: true },
})
// Returns: { id, name }[]

// ─── Mutation: Delete ────────────────────────────────────────

const deleted = await client.entity('user').delete({
  where: { email: { eq: 'old@example.com' } },
  returning: { id: true },
})
// Returns: { id }[]

// ─── Error Handling ──────────────────────────────────────────

try {
  await client.entity('user').query({ select: { id: true } })
} catch (e) {
  if (e instanceof NetworkError) {
    console.error(`Network error (HTTP ${e.status}):`, e.message)
  }
  if (e instanceof GraphQLClientError) {
    console.error('GraphQL errors:', e.errors)
    // e.errors: Array<{ message, locations?, path?, extensions? }>
  }
}

// ─── Raw GraphQL Execution ───────────────────────────────────

const result = await client.execute(
  `query GetUser($id: String!) {
    userSingle(where: { id: { eq: $id } }) { id name email }
  }`,
  { id: 'some-uuid' },
)

// Placeholder
async function getAuthToken(): Promise<string> {
  return 'token'
}
```
