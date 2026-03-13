import type { Many, One, Relations, Table } from 'drizzle-orm'

// ─── Wire Format ──────────────────────────────────────────
// GraphQL serializes Date as string

type ToWire<T> = T extends Date ? string : T

type WireFormat<T> = { [K in keyof T]: ToWire<T[K]> }

// ─── Extract Tables ───────────────────────────────────────

type ExtractTables<TSchema> = {
  [K in keyof TSchema as TSchema[K] extends Table ? K : never]: TSchema[K]
}

// ─── Extract Relations ────────────────────────────────────

// Given a schema module and a table name, find the Relations export whose
// first type param matches that table name, then extract the config return type.
type FindRelationConfig<TSchema, TTableName extends string> = {
  [K in keyof TSchema]: TSchema[K] extends Relations<TTableName, infer TConfig> ? TConfig : never
}[keyof TSchema]

type MapRelation<T> =
  T extends One<infer N, infer TIsNullable>
    ? // Drizzle's One<_, TIsNullable>: true = FK is notNull (relation required), false = FK is nullable
      { entity: N; type: 'one'; required: TIsNullable }
    : T extends Many<infer N>
      ? { entity: N; type: 'many' }
      : never

type InferRelationDefs<TSchema, TTableName extends string> = {
  [K in keyof FindRelationConfig<TSchema, TTableName>]: MapRelation<
    FindRelationConfig<TSchema, TTableName>[K]
  >
}

// ─── Filter Types ─────────────────────────────────────────

type ScalarFilterOps<T> = {
  eq?: T | null
  ne?: T | null
  lt?: T | null
  lte?: T | null
  gt?: T | null
  gte?: T | null
  like?: string | null
  notLike?: string | null
  ilike?: string | null
  notIlike?: string | null
  inArray?: T[] | null
  notInArray?: T[] | null
  isNull?: boolean | null
  isNotNull?: boolean | null
}

type ScalarColumnFilters<TFields> = {
  [K in keyof TFields]?: ScalarFilterOps<NonNullable<TFields[K]>>
}

// Relation filter: for "many" relations, wrap target filters in quantifiers
type ManyRelationFilter<TFilter> = {
  some?: TFilter
  every?: TFilter
  none?: TFilter
}

// Helper: check if a relation's target entity can be resolved in the schema
type IsResolvableRelation<TSchema, TRel> = TRel extends { entity: infer E }
  ? E extends string
    ? KeyForDbName<TSchema, E> extends keyof ExtractTables<TSchema>
      ? true
      : false
    : false
  : false

// Given a schema and a table's raw relation defs, produce relation filter fields.
// Relations whose target can't be resolved are omitted via key remapping.
type InferRelationFilterFields<TSchema, TRels> = {
  [K in keyof TRels as IsResolvableRelation<TSchema, TRels[K]> extends true
    ? K
    : never]?: TRels[K] extends { entity: infer E; type: infer TRelType }
    ? E extends string
      ? KeyForDbName<TSchema, E> extends infer RK
        ? RK extends keyof ExtractTables<TSchema>
          ? ExtractTables<TSchema>[RK] extends infer TTarget
            ? TTarget extends Table
              ? TRelType extends 'many'
                ? ManyRelationFilter<InferEntityFilters<TSchema, TTarget>>
                : InferEntityFilters<TSchema, TTarget>
              : never
            : never
          : never
        : never
      : never
    : never
}

// Full entity filters: scalar columns + relation filters + OR combinator
type InferEntityFilters<TSchema, T extends Table> = ScalarColumnFilters<
  WireFormat<T['$inferSelect']>
> &
  InferRelationFilterFields<TSchema, InferRelationDefs<TSchema, TableDbName<T>>> & {
    OR?: InferEntityFilters<TSchema, T>[]
  }

// ─── Input Types ──────────────────────────────────────────

type InferInsertInput<T> = T extends Table ? WireFormat<T['$inferInsert']> : never

type InferUpdateInput<T> = T extends Table
  ? { [K in keyof T['$inferInsert']]?: ToWire<T['$inferInsert'][K]> | null }
  : never

// ─── OrderBy ──────────────────────────────────────────────

type InferOrderBy<T> = T extends Table
  ? { [K in keyof T['$inferSelect']]?: { direction: 'asc' | 'desc'; priority: number } }
  : never

// ─── Config Exclusions ────────────────────────────────────

type ExcludedNames<TConfig> = TConfig extends { tables: { exclude: readonly (infer T)[] } }
  ? T
  : never

// ─── DB Name Resolution ──────────────────────────────────

// Extract the database name from a Table type
type TableDbName<T> =
  T extends Table<infer TConfig>
    ? TConfig['name'] extends string
      ? TConfig['name']
      : string
    : string

// Maps JS export key → database table name
type DbNameToKey<TSchema> = {
  [K in keyof ExtractTables<TSchema>]: TableDbName<ExtractTables<TSchema>[K]>
}

// Reverse lookup: given a DB name, find the JS key
type KeyForDbName<TSchema, TDbName extends string> = {
  [K in keyof DbNameToKey<TSchema>]: DbNameToKey<TSchema>[K] extends TDbName ? K : never
}[keyof DbNameToKey<TSchema>]

// Resolve a relation's entity name (DB name) to the JS key in the schema
type ResolveRelationEntity<TSchema, TDbName extends string> =
  KeyForDbName<TSchema, TDbName> extends infer K ? (K extends string ? K : TDbName) : TDbName

// Map relations with resolved entity names
type ResolveRelationDefs<TSchema, TRels> = {
  [K in keyof TRels]: TRels[K] extends { entity: infer E; type: infer T }
    ? E extends string
      ? Omit<TRels[K], 'entity'> & { entity: ResolveRelationEntity<TSchema, E>; type: T }
      : TRels[K]
    : TRels[K]
}

// ─── Per-Entity Def Builder ───────────────────────────────
// Uses conditional type to ensure T is narrowed to Table

type BuildEntityDef<TSchema, T> = T extends Table
  ? {
      fields: WireFormat<T['$inferSelect']>
      relations: ResolveRelationDefs<TSchema, InferRelationDefs<TSchema, TableDbName<T>>>
      filters: InferEntityFilters<TSchema, T>
      insertInput: InferInsertInput<T>
      updateInput: InferUpdateInput<T>
      orderBy: InferOrderBy<T>
    }
  : never

// ─── Master EntityDefs ────────────────────────────────────

export type InferEntityDefs<TSchema, TConfig = Record<string, never>> = {
  [K in keyof ExtractTables<TSchema> as K extends ExcludedNames<TConfig>
    ? never
    : K extends string
      ? K
      : never]: BuildEntityDef<TSchema, ExtractTables<TSchema>[K]>
}
