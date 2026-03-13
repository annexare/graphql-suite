// ─── Entity Definition Types ───────────────────────────────
// These mirror the generated EntityDefs structure

export type RelationDef = {
  entity: string
  type: 'one' | 'many'
  required?: boolean
}

export type EntityDef = {
  fields: Record<string, unknown>
  relations: Record<string, RelationDef>
  filters?: Record<string, unknown>
  insertInput?: Record<string, unknown>
  updateInput?: Record<string, unknown>
  orderBy?: Record<string, unknown>
}

export type AnyEntityDefs = Record<string, EntityDef>

// ─── Schema Descriptor Types ───────────────────────────────
// These mirror the generated runtime schema object

export type EntityDescriptor = {
  queryName: string
  queryListName: string
  countName: string
  insertName: string
  insertSingleName: string
  updateName: string
  deleteName: string
  fields: readonly string[]
  relations: Record<string, { entity: string; type: 'one' | 'many' }>
}

export type SchemaDescriptor = Record<string, EntityDescriptor>

// ─── Select Input ──────────────────────────────────────────
// What the user passes as `select` — true for scalars, nested object for relations

export type SelectInput<TDefs extends AnyEntityDefs, TEntity extends EntityDef> = {
  [K in keyof TEntity['fields'] | keyof TEntity['relations']]?: K extends keyof TEntity['relations']
    ? TEntity['relations'][K] extends RelationDef
      ? TEntity['relations'][K]['entity'] extends keyof TDefs
        ? SelectInput<TDefs, TDefs[TEntity['relations'][K]['entity']]>
        : never
      : never
    : K extends keyof TEntity['fields']
      ? true
      : never
}

// ─── Infer Result ──────────────────────────────────────────
// Infers the return type from the select object

type Simplify<T> = { [K in keyof T]: T[K] } & {}

export type InferResult<TDefs extends AnyEntityDefs, TEntity extends EntityDef, TSelect> = Simplify<
  InferScalars<TEntity, TSelect> & InferRelations<TDefs, TEntity, TSelect>
>

type InferScalars<TEntity extends EntityDef, TSelect> = Pick<
  TEntity['fields'],
  keyof TSelect & keyof TEntity['fields']
>

type InferRelations<TDefs extends AnyEntityDefs, TEntity extends EntityDef, TSelect> = {
  // Note: one-to-one relations are always typed as nullable because Drizzle's
  // One<_, TIsNullable> flag only reflects FK column nullability, not whether a
  // matching row exists. Reverse relations (where the FK is on the other table)
  // can have notNull FK columns yet still have no matching row.
  [K in keyof TSelect & keyof TEntity['relations'] as TSelect[K] extends Record<string, unknown>
    ? K
    : never]: TEntity['relations'][K] extends RelationDef
    ? TEntity['relations'][K]['entity'] extends keyof TDefs
      ? TEntity['relations'][K]['type'] extends 'many'
        ? InferResult<TDefs, TDefs[TEntity['relations'][K]['entity']], TSelect[K]>[]
        : InferResult<TDefs, TDefs[TEntity['relations'][K]['entity']], TSelect[K]> | null
      : never
    : never
}

// ─── Client Config ─────────────────────────────────────────

export type ClientConfig<TSchema extends SchemaDescriptor = SchemaDescriptor> = {
  url: string | (() => string)
  schema: TSchema
  headers?: HeadersInit | (() => HeadersInit | Promise<HeadersInit>)
}
