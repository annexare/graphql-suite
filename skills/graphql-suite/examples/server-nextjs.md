# Next.js Integration

Next.js App Router integration (`app/api/graphql/route.ts`).

```ts
import { buildSchema } from 'graphql-suite/schema'
import { createYoga } from 'graphql-yoga'

import { db } from '@/db'

const { schema } = buildSchema(db, {
  suffixes: { list: 's' },
  tables: { exclude: ['session', 'verification'] },
})

const { handleRequest } = createYoga({
  schema,
  graphqlEndpoint: '/api/graphql',
  fetchAPI: { Response },

  // Optional: pass auth context from Next.js headers
  context: async ({ request }) => {
    const token = request.headers.get('authorization')?.replace('Bearer ', '')
    return { user: token ? { id: 'user-id' } : null }
  },
})

export { handleRequest as GET, handleRequest as POST }
```
