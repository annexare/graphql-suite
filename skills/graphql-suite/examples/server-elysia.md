# ElysiaJS Integration

ElysiaJS integration with `@elysiajs/graphql-yoga` plugin.

```ts
import { yoga } from '@elysiajs/graphql-yoga'
import { buildSchema } from 'graphql-suite/schema'
import { Elysia } from 'elysia'

import { db } from './db'

const { schema } = buildSchema(db, {
  suffixes: { list: 's' },
  tables: { exclude: ['session'] },
})

new Elysia().use(yoga({ schema })).listen(3000, () => {
  console.log('GraphQL server running at http://localhost:3000/graphql')
})
```
