# Configuration Reference

## `BuildSchemaConfig` (Server)

Used by `buildSchema()`, `buildEntities()`, and `buildSchemaFromDrizzle()`.

```ts
type BuildSchemaConfig = {
  mutations?: boolean
  limitRelationDepth?: number
  limitSelfRelationDepth?: number
  suffixes?: { list?: string; single?: string }
  hooks?: HooksConfig
  tables?: {
    exclude?: string[]
    config?: Record<string, TableOperations>
  }
  pruneRelations?: Record<string, RelationPruneRule>
  debug?: boolean | { schemaSize?: boolean; relationTree?: boolean }
}
```

### Fields

#### `mutations`
- **Type:** `boolean`
- **Default:** `true`
- **Description:** Set to `false` to omit all mutation operations from the schema.

#### `limitRelationDepth`
- **Type:** `number | undefined`
- **Default:** `3`
- **Description:** Maximum nesting depth for relation fields on query types. Set to `0` to omit relations entirely. Set to `undefined` for no limit (not recommended for large schemas).
- **Validation:** Must be a non-negative integer or `undefined`.

#### `limitSelfRelationDepth`
- **Type:** `number`
- **Default:** `1`
- **Description:** Max occurrences of the same table via direct self-relations in a type path. `1` means self-relation fields are omitted. `2` allows one level of expansion (e.g., `node.parentNode` exists but nested node has no parent/children).
- **Validation:** Must be a positive integer >= 1.
- **Note:** Only applies to direct self-relations (source table === target table). Cross-table circular paths are governed by `limitRelationDepth`.

#### `suffixes`
- **Type:** `{ list?: string; single?: string }`
- **Default:** `{ list: '', single: 'Single' }`
- **Description:** Customize query name suffixes. For a table `user`:
  - `list: ''` → query `user` (list), `list: 's'` → query `users`
  - `single: 'Single'` → query `userSingle`
- **Validation:** List and single suffixes must be different.

#### `hooks`
- **Type:** `HooksConfig`
- **Description:** Per-table hooks for intercepting query and mutation execution. See [SKILL.md](../SKILL.md#hooks) for patterns.

#### `tables`
- **Type:** `{ exclude?: string[]; config?: Record<string, TableOperations> }`
- **Description:** Table-level configuration.
  - `exclude`: Tables to omit entirely (no types, no operations, relations to them skipped).
  - `config`: Per-table operation overrides. Tables not listed get default behavior.

```ts
tables: {
  exclude: ['session', 'migration'],
  config: {
    auditLog: { queries: true, mutations: false },
    user: { queries: true, mutations: true },
  },
}
```

#### `pruneRelations`
- **Type:** `Record<string, RelationPruneRule>`
- **Description:** Fine-grained per-relation control. Keys are `tableName.relationName`.

```ts
pruneRelations: {
  'user.passwordHash': false,                // Omit entirely
  'post.comments': 'leaf',                   // Scalars only, no nested relations
  'organization.members': { only: ['profile'] }, // Only 'profile' sub-relation
}
```

#### `debug`
- **Type:** `boolean | { schemaSize?: boolean; relationTree?: boolean }`
- **Description:** Enable diagnostic logging.
  - `true`: Logs SDL byte size and type count.
  - `{ schemaSize: true }`: Log only size metrics.
  - `{ relationTree: true }`: Log relation tree structure.

## `ClientSchemaConfig` (Client)

Used by `createDrizzleClient()` and `buildSchemaDescriptor()`.

```ts
type ClientSchemaConfig = {
  mutations?: boolean
  suffixes?: { list?: string; single?: string }
  tables?: { exclude?: readonly string[] }
  pruneRelations?: Record<string, false | 'leaf' | { only: string[] }>
}
```

### Config Alignment

The client config must match the server config for correct query/mutation generation. These fields must be aligned:

| Field | Server (`BuildSchemaConfig`) | Client (`ClientSchemaConfig`) |
|-------|-----|--------|
| `mutations` | Controls generation | Controls query builder |
| `suffixes` | Names the operations | Builds matching query strings |
| `tables.exclude` | Excludes from schema | Excludes from descriptor |
| `pruneRelations` | Prunes from schema types | Prunes from descriptor |

**Example of aligned configs:**

```ts
// Server
const { schema } = buildSchema(db, {
  mutations: true,
  suffixes: { list: 's', single: 'Single' },
  tables: { exclude: ['session'] },
  pruneRelations: { 'user.passwordHash': false },
})

// Client
const client = createDrizzleClient({
  schema: drizzleSchema,
  config: {
    mutations: true,
    suffixes: { list: 's', single: 'Single' },
    tables: { exclude: ['session'] },
    pruneRelations: { 'user.passwordHash': false },
  },
  url: '/api/graphql',
})
```

Fields that only exist on the server config (`limitRelationDepth`, `limitSelfRelationDepth`, `hooks`, `tables.config`, `debug`) do not need to be specified on the client.

## `PermissionConfig`

Used by `withPermissions()` (returned from `buildSchema` and `buildSchemaFromDrizzle`).

```ts
type PermissionConfig = {
  id: string
  mode: 'permissive' | 'restricted'
  tables?: Record<string, boolean | TableAccess>
}
```

### Fields

#### `id`
- **Type:** `string`
- **Description:** Unique identifier for caching. Calling `withPermissions` with the same `id` returns the same `GraphQLSchema` instance.

#### `mode`
- **Type:** `'permissive' | 'restricted'`
- **Description:** Controls default access for tables not listed in `tables`.
  - `'permissive'`: All tables allowed by default. Entries in `tables` deny or restrict access.
  - `'restricted'`: Nothing allowed by default. Entries in `tables` grant access.

#### `tables`
- **Type:** `Record<string, boolean | TableAccess>`
- **Description:** Per-table access overrides. Each entry can be:
  - `true` — all operations allowed
  - `false` — table excluded entirely (no types, no operations, no relation fields)
  - `TableAccess` — granular operation control

## `TableAccess`

Granular per-table operation control used in `PermissionConfig.tables`.

```ts
type TableAccess = {
  query?: boolean   // list + single + count
  insert?: boolean  // insert + insertSingle
  update?: boolean
  delete?: boolean
}
```

In **permissive** mode, omitted fields default to `true`. In **restricted** mode, omitted fields default to `false`.

### Relationship to `BuildSchemaConfig`

Internally, `withPermissions()` converts a `PermissionConfig` into `BuildSchemaConfig` overrides:

- Tables set to `false` are added to `tables.exclude`
- Tables with `readOnly()` get `{ queries: true, mutations: false }` in `tables.config`
- Granular access (e.g., `{ query: true, insert: true, delete: false }`) uses `tables.config` for queries/mutations control, with individual mutation entry points (`insertInto*`, `update*`, `deleteFrom*`) post-filtered after schema build

This means permissions compose on top of the base config — a table already excluded in the base config stays excluded regardless of permission settings.

## `CodegenOptions`

Used by `generateTypes()` and `generateEntityDefs()`.

```ts
type CodegenOptions = {
  drizzle?: {
    importPath: string                      // Import path for Drizzle schema types
    typeNames?: Record<string, string>      // Override: tableName → TypeName
  }
}
```

**Example:**

```ts
generateTypes(schema, {
  drizzle: {
    importPath: '@/db/schema',
    typeNames: { assetType: 'AssetCategory' },  // Custom type name override
  },
})
```

When `drizzle.importPath` is provided, wire format types use Drizzle's inferred types with `Date` fields converted to `string`. Without it, types fall back to `Record<string, unknown>`.
