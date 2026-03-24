# PostgreSQL to GraphQL Type Mapping

## Column Type Mapping Table

| Drizzle Column | DataType | GraphQL Type | Notes |
|---------------|----------|-------------|-------|
| `boolean()` | `boolean` | `GraphQLBoolean` | |
| `text()` | `string` | `GraphQLString` | |
| `varchar()` | `string` | `GraphQLString` | |
| `char()` | `string` | `GraphQLString` | |
| `text().notNull()` with enum values | `string` | `GraphQLEnumType` | Enum generated from `enumValues` |
| `integer()` | `number` | `GraphQLInt` | |
| `smallint()` | `number` | `GraphQLInt` | |
| `bigint({ mode: 'number' })` | `number` | `GraphQLInt` | PgBigInt53 |
| `serial()` | `number` | `GraphQLInt` | |
| `smallserial()` | `number` | `GraphQLInt` | |
| `bigserial({ mode: 'number' })` | `number` | `GraphQLInt` | PgBigSerial53 |
| `real()` | `number` | `GraphQLFloat` | |
| `doublePrecision()` | `number` | `GraphQLFloat` | |
| `numeric()` | `number` | `GraphQLFloat` | |
| `bigint({ mode: 'bigint' })` | `bigint` | `GraphQLString` | String representation |
| `date()` | `date` | `GraphQLString` | ISO string format |
| `timestamp()` | `date` | `GraphQLString` | ISO string format |
| `json()` | `json` | `GraphQLJSON` | Custom JSON scalar |
| `jsonb()` | `json` | `GraphQLJSON` | Custom JSON scalar |
| `bytea()` | `buffer` | `[GraphQLInt!]!` | Array of integers |
| `pgTable` with `PgVector` | `array` | `[GraphQLFloat!]!` | Vector array |
| `pgTable` with `PgGeometry` | `array` | `[GraphQLFloat!]!` | Geometry tuple [x, y] |
| `pgTable` with `PgGeometryObject` | `json` | `PgGeometryObject` type | `{ x: Float!, y: Float! }` |
| Array columns (e.g., `text().array()`) | `array` | `[BaseType!]!` | Array of the base column type |
| `uuid()` | `string` | `GraphQLString` | |

## Nullability Rules

### Select (Output) Types

- `notNull()` columns → `GraphQLNonNull<T>` (non-nullable)
- Nullable columns → `T` (nullable)

### Insert Input Types

- `notNull()` without default → `GraphQLNonNull<T>` (required)
- `notNull()` with `.default()` or `.defaultRandom()` → `T` (optional, nullable in input)
- Nullable columns → `T` (optional)

### Update Input Types

- All columns are nullable (optional) — you only set fields you want to change.

### Filter Types

- All filter operator values are nullable (filters are always optional).

## Special Type Handling

### JSON (`GraphQLJSON`)

Custom scalar that serializes/parses JSON values. Handles AST types: `STRING`, `BOOLEAN`, `INT`, `FLOAT`, `OBJECT`, `LIST`, `NULL`.

### Geometry Object (`PgGeometryObject`)

Output type:
```graphql
type PgGeometryObject {
  x: Float!
  y: Float!
}
```

Input type:
```graphql
input PgGeometryObjectInput {
  x: Float!
  y: Float!
}
```

### Data Transformations

Values are automatically converted between Drizzle and GraphQL formats:

| Direction | Type | Conversion |
|-----------|------|-----------|
| DB → GraphQL | `Date` | `.toISOString()` (ISO string) |
| DB → GraphQL | `Buffer` | `Array.from(buffer)` (integer array) |
| DB → GraphQL | `bigint` | `String(value)` |
| GraphQL → DB | date string | `new Date(value)` with validation |
| GraphQL → DB | integer array | `Buffer.from(array)` |
| GraphQL → DB | bigint string | `BigInt(value)` |
| GraphQL → DB | geometry array | Validated as length-2 array `[x, y]` |

## Enum Generation

Columns with `enumValues` generate a `GraphQLEnumType`:
- Enum name: `{TableName}{ColumnName}Enum` (PascalCase)
- Values are cached via WeakMap to avoid duplicate enum types

## Source Files

- `packages/schema/src/graphql/type-builder.ts` — Column to GraphQL type conversion
- `packages/schema/src/graphql/scalars.ts` — GraphQLJSON scalar
- `packages/schema/src/data-mappers.ts` — Data transformation functions
