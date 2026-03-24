# Codegen Script

Code generation script for separate-repo setups where the client can't import the Drizzle schema directly. For same-repo setups, use `createDrizzleClient` instead — it infers all types automatically. Run with `bun run codegen.ts`.

```ts
import {
  buildSchemaFromDrizzle,
  generateEntityDefs,
  generateSDL,
  generateTypes,
} from 'graphql-suite/schema'

// Import your Drizzle schema (tables + relations)
import * as drizzleSchema from './db/schema'

// ─── Build Schema (no DB connection needed) ──────────────────

const { schema } = buildSchemaFromDrizzle(drizzleSchema, {
  suffixes: { list: 's' },
  tables: { exclude: ['session', 'verification'] },
})

// ─── Codegen Options ─────────────────────────────────────────

const codegenOptions = {
  drizzle: {
    // Import path used in generated type imports
    importPath: '@/db/schema',
    // Optional: override type names for tables
    // typeNames: { assetType: 'AssetCategory' },
  },
}

// ─── Generate Files ──────────────────────────────────────────

// 1. GraphQL SDL (for schema introspection tools, GraphiQL, etc.)
const sdl = generateSDL(schema)
await Bun.write('generated/schema.graphql', sdl)
console.log(`Generated SDL: ${sdl.length} bytes`)

// 2. TypeScript types (wire formats, filters, inputs, orderBy)
const types = generateTypes(schema, codegenOptions)
await Bun.write('generated/types.ts', types)
console.log(`Generated types: ${types.length} bytes`)

// 3. Entity definitions (runtime descriptors + EntityDefs type for client)
const entityDefs = generateEntityDefs(schema, codegenOptions)
await Bun.write('generated/entity-defs.ts', entityDefs)
console.log(`Generated entity defs: ${entityDefs.length} bytes`)

console.log('Code generation complete!')

// ─── Using Generated Code with Client ────────────────────────
//
// import { createClient } from 'graphql-suite/client'
// import { schema, type EntityDefs } from './generated/entity-defs'
//
// const client = createClient<typeof schema, EntityDefs>({
//   schema,
//   url: '/api/graphql',
// })
//
// // Client has full type safety from generated types
// const users = await client.entity('user').query({
//   select: { id: true, name: true },
// })
```
