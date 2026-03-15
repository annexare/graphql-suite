import { join } from 'node:path'
import { buildSchema } from '@graphql-suite/schema'
import { drizzle } from 'drizzle-orm/bun-sql'
import { createYoga } from 'graphql-yoga'

import { schemaConfig } from './config'
import * as drizzleSchema from './db'
import { createFetchHandler } from './server/routes'

// ─── Database ────────────────────────────────────────────────

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error('DATABASE_URL environment variable is required')
  process.exit(1)
}

const db = drizzle({ connection: DATABASE_URL, schema: drizzleSchema })

// ─── GraphQL ─────────────────────────────────────────────────

const { schema } = buildSchema(db, schemaConfig)

const yoga = createYoga({ schema })

// ─── Routes ──────────────────────────────────────────────────

const fetchHandler = createFetchHandler(yoga)

// ─── Static Files ────────────────────────────────────────────

const distDir = join(import.meta.dir, 'app', 'dist')

function serveStatic(path: string): Response | null {
  try {
    const filePath = join(distDir, path)
    const file = Bun.file(filePath)
    return new Response(file)
  } catch {
    return null
  }
}

// ─── Server ──────────────────────────────────────────────────

const port = Number(process.env.PORT) || 4000

Bun.serve({
  port,
  async fetch(req) {
    const url = new URL(req.url)

    // GraphQL and SSR routes
    if (url.pathname.startsWith('/graphql') || url.pathname.startsWith('/articles')) {
      return fetchHandler(req)
    }

    // Static assets
    if (url.pathname !== '/' && url.pathname.includes('.')) {
      const staticResponse = serveStatic(url.pathname)
      if (staticResponse) return staticResponse
    }

    // SPA fallback
    return fetchHandler(req)
  },
})

console.log(`News App server running at http://localhost:${port}`)
console.log(`GraphQL endpoint: http://localhost:${port}/graphql`)
console.log(`SSR articles: http://localhost:${port}/articles`)
