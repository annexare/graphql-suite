# Code Generation Reference

`@graphql-suite/schema` includes code generation functions for producing SDL, TypeScript types, and entity definitions from a GraphQL schema.

**When to use:** Only when the client is in a separate repository that cannot import the Drizzle schema directly. For same-repo setups, `createDrizzleClient` infers all types automatically from the Drizzle schema — no codegen needed.

## Functions

### `generateSDL(schema)`

Generate GraphQL Schema Definition Language string.

```ts
import { buildSchemaFromDrizzle, generateSDL } from '@graphql-suite/schema'
import * as drizzleSchema from './db/schema'

const { schema } = buildSchemaFromDrizzle(drizzleSchema)
const sdl = generateSDL(schema)
// Write to file: await Bun.write('schema.graphql', sdl)
```

**Parameters:**
- `schema: GraphQLSchema` — GraphQL schema instance

**Returns:** `string` — Full SDL representation

### `generateTypes(schema, options?)`

Generate TypeScript type definitions including wire format types, filter types, input types, and orderBy types.

```ts
import { buildSchemaFromDrizzle, generateTypes } from '@graphql-suite/schema'
import * as drizzleSchema from './db/schema'

const { schema } = buildSchemaFromDrizzle(drizzleSchema)
const types = generateTypes(schema, {
  drizzle: {
    importPath: '@/db/schema',
    typeNames: { assetType: 'AssetCategory' },
  },
})
// Write to file: await Bun.write('generated/types.ts', types)
```

**Parameters:**
- `schema: GraphQLSchema`
- `options?: CodegenOptions`

**Returns:** `string` — TypeScript source with:
- `DateKeys<T>` utility type
- Drizzle type imports (when `drizzle.importPath` is set)
- `{Entity}Wire` — Wire format types (Date → string)
- `{Entity}Filters` — Filter types with all operators
- `{Entity}InsertInput` — Insert input types
- `{Entity}UpdateInput` — Update input types
- `{Entity}OrderBy` — OrderBy types

### `generateEntityDefs(schema, options?)`

Generate runtime entity definitions and TypeScript types for the client package.

```ts
import { buildSchemaFromDrizzle, generateEntityDefs } from '@graphql-suite/schema'
import * as drizzleSchema from './db/schema'

const { schema } = buildSchemaFromDrizzle(drizzleSchema)
const entityDefs = generateEntityDefs(schema)
// Write to file: await Bun.write('generated/entity-defs.ts', entityDefs)
```

**Parameters:**
- `schema: GraphQLSchema`
- `options?: CodegenOptions`

**Returns:** `string` — TypeScript source with:
- Import statements for generated types
- `schema` const — Runtime entity descriptors (query/mutation names, fields, relations)
- `EntityDefs` type — Type information for client inference
- `TableNameMap` type — Maps Drizzle table types to entity keys

## `CodegenOptions`

```ts
type CodegenOptions = {
  drizzle?: {
    importPath: string                      // Import path for Drizzle types
    typeNames?: Record<string, string>      // tableName → TypeName overrides
  }
}
```

When `drizzle.importPath` is provided:
- Wire format types reference Drizzle's inferred `$inferSelect` types with Date fields converted to string
- Generated code imports the Drizzle types with `Drizzle` prefix aliasing

Without `drizzle.importPath`:
- Wire format types fall back to `Record<string, unknown>`

## When to Use Codegen vs `createDrizzleClient`

| Approach | Use When |
|----------|----------|
| `createDrizzleClient` | Client has access to Drizzle schema at build time (same repo, shared package). Simpler setup, full type inference at compile time. |
| Codegen | Client is in a separate repo or can't import Drizzle schema. Generate types + entity defs, commit to the client repo, use `createClient()`. |

### Codegen Workflow

1. Build schema from Drizzle exports (no DB needed):
   ```ts
   const { schema } = buildSchemaFromDrizzle(drizzleSchema)
   ```

2. Generate files:
   ```ts
   await Bun.write('generated/schema.graphql', generateSDL(schema))
   await Bun.write('generated/types.ts', generateTypes(schema, options))
   await Bun.write('generated/entity-defs.ts', generateEntityDefs(schema, options))
   ```

3. Use in client:
   ```ts
   import { createClient } from '@graphql-suite/client'
   import { schema, type EntityDefs } from './generated/entity-defs'

   const client = createClient<typeof schema, EntityDefs>({
     schema,
     url: '/api/graphql',
   })
   ```

## Generated Output Examples

### Wire Format Type (with Drizzle import)
```ts
export type UserWire = Omit<DrizzleUser, DateKeys<DrizzleUser>>
  & { [K in DateKeys<DrizzleUser>]: string }
```

### Filter Type
```ts
export type UserFilters = {
  id?: {
    eq?: string | null
    ne?: string | null
    lt?: string | null
    lte?: string | null
    gt?: string | null
    gte?: string | null
    like?: string | null
    notLike?: string | null
    ilike?: string | null
    notIlike?: string | null
    inArray?: string[] | null
    notInArray?: string[] | null
    isNull?: boolean | null
    isNotNull?: boolean | null
    OR?: Array<Omit<UserFilters['id'], 'OR'>> | null
  }
  posts?: { some?: PostFilters; every?: PostFilters; none?: PostFilters }
  OR?: UserFilters[]
}
```

### Entity Definitions
```ts
export const schema = {
  user: {
    queryName: 'user',
    queryListName: 'users',
    countName: 'userCount',
    insertName: 'insertIntoUser',
    insertSingleName: 'insertIntoUserSingle',
    updateName: 'updateUser',
    deleteName: 'deleteFromUser',
    fields: ['id', 'name', 'email'],
    relations: {
      posts: { entity: 'post', type: 'many' },
    },
  },
} as const
```

## Source Files

- `packages/schema/src/codegen.ts` — All code generation functions
- `packages/schema/src/index.ts` — Public exports
