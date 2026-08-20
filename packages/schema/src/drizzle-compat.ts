import { type Column, getTableColumns, getTableName, is, type Table } from 'drizzle-orm'
import { PgTable } from 'drizzle-orm/pg-core'
/**
 * `drizzle-orm/relations` resolves on both majors, but to *different* modules:
 * the v1 relations API on 0.4x, the v2 (`defineRelations`) API on 1.x. A
 * namespace import is what makes that safe — unlike a named import, it does not
 * fail when a name is absent, so one static import covers both and `buildSchema`
 * stays synchronous.
 */
import * as drizzleRelations from 'drizzle-orm/relations'

// ─── Version Detection ───────────────────────────────────────

// biome-ignore lint/suspicious/noExplicitAny: module shape differs per drizzle major
const relationsModule = drizzleRelations as any

/** True when the installed drizzle exposes the v2 relations API (drizzle >= 1.0). */
export const hasRelationsV2: boolean = typeof relationsModule.defineRelations === 'function'

/** v1-only helpers. `undefined` on drizzle 1.x, where the v1 API is gone. */
const RelationsV1 = relationsModule.Relations
const createTableRelationsHelpersV1 = relationsModule.createTableRelationsHelpers
const extractTablesRelationalConfigV1 = relationsModule.extractTablesRelationalConfig
const normalizeRelationV1 = relationsModule.normalizeRelation
const OneV1 = relationsModule.One

// ─── Column Data Types ───────────────────────────────────────

/**
 * The column classifications this package maps to GraphQL types. These are the
 * `dataType` values drizzle 0.4x reports directly; on 1.x they are derived from
 * the codec-qualified string (see {@link normalizeDataType}).
 */
export type NormalizedDataType =
  | 'array'
  | 'bigint'
  | 'boolean'
  | 'buffer'
  | 'date'
  | 'json'
  | 'number'
  | 'string'

/**
 * Normalize a column's `dataType` to the 0.4x vocabulary.
 *
 * drizzle 1.0 replaced the flat `dataType` with a codec-qualified pair,
 * `"<base> <codec>"` — `uuid` became `'string uuid'`, `integer` `'number int32'`,
 * `json` `'object json'`. Every base carries over unchanged except `object`,
 * which is new in 1.x and splits by codec.
 *
 * Verified exhaustive against every pg column builder on both majors: the 1.x
 * bases are `array`, `bigint`, `boolean`, `number`, `object` and `string`, and
 * the only `object` codecs are `buffer`, `date`, `geometry` and `json`.
 * `object geometry` is `PgGeometryObject`, which 0.4x reported as `json`.
 */
export const normalizeDataType = (column: Column): string => {
  const dataType = column.dataType as string
  const separator = dataType.indexOf(' ')

  // drizzle 0.4x, plus the 1.x types that need no codec ('boolean', 'string').
  if (separator === -1) return dataType

  const base = dataType.slice(0, separator)
  if (base !== 'object') return base

  switch (dataType.slice(separator + 1)) {
    case 'buffer':
      return 'buffer'
    case 'date':
      return 'date'
    default:
      // 'json' and 'geometry' (PgGeometryObject); both were 'json' on 0.4x.
      return 'json'
  }
}

/**
 * Whether a column holds an array.
 *
 * 0.4x modelled arrays as a distinct `PgArray` column wrapping a `baseColumn`;
 * 1.x drops both and instead marks the column itself with `dimensions >= 1`.
 * `PgVector`, `PgHalfVector` and `PgGeometry` report a `dataType` of `array`
 * on both majors without being arrays in this sense — they keep `dimensions: 0`
 * on 1.x and are matched by `columnType` downstream.
 */
export const isArrayColumn = (column: Column): boolean => {
  // biome-ignore lint/suspicious/noExplicitAny: `dimensions` is drizzle 1.x only
  const dimensions = (column as any).dimensions as number | undefined
  if (typeof dimensions === 'number') return dimensions > 0
  return normalizeDataType(column) === 'array' && Boolean(getArrayBaseColumn(column))
}

/**
 * The element column of an array column.
 *
 * On 0.4x this is the wrapped `baseColumn`. On 1.x there is no wrapper: the
 * column *is* the element type, distinguished only by its `dimensions`, so it
 * describes its own elements and is returned as-is.
 */
export const getArrayBaseColumn = (column: Column): Column | undefined => {
  // biome-ignore lint/suspicious/noExplicitAny: `baseColumn` is drizzle 0.4x only
  const baseColumn = (column as any).baseColumn as Column | undefined
  if (baseColumn) return baseColumn
  // biome-ignore lint/suspicious/noExplicitAny: `dimensions` is drizzle 1.x only
  return ((column as any).dimensions as number | undefined) ? column : undefined
}

// ─── Relations ───────────────────────────────────────────────

/** A relation from either major. Structural access only — see the helpers below. */
// biome-ignore lint/suspicious/noExplicitAny: the two majors ship unrelated classes
export type AnyRelation = any

/** Whether a relation is to-one (as opposed to to-many). */
export const isOneRelation = (relation: AnyRelation): boolean => {
  // drizzle 1.x pre-resolves this; `$brand` is type-only and absent at runtime.
  if (typeof relation?.relationType === 'string') return relation.relationType === 'one'
  return OneV1 ? is(relation, OneV1) : false
}

/** The table a relation points at. */
export const getRelationTargetTable = (relation: AnyRelation): Table =>
  relation.targetTable ?? relation.referencedTable

/**
 * The column pairs that join a relation's source to its target.
 *
 * 0.4x stored these only for the owning side, so `normalizeRelation` had to walk
 * the schema to resolve the inverse; 1.x pre-resolves both sides onto the
 * relation itself.
 */
export const getRelationJoinColumns = (
  relation: AnyRelation,
  // biome-ignore lint/suspicious/noExplicitAny: v1 relational config, unused on 1.x
  relationalSchema: any,
  tableNamesMap: Record<string, string>,
): { fields: Column[]; references: Column[] } => {
  if (relation.sourceColumns && relation.targetColumns) {
    return { fields: relation.sourceColumns, references: relation.targetColumns }
  }

  if (!normalizeRelationV1) return { fields: [], references: [] }
  const { fields, references } = normalizeRelationV1(relationalSchema, tableNamesMap, relation)
  return { fields: fields ?? [], references: references ?? [] }
}

// ─── Schema Metadata ─────────────────────────────────────────

export type TableNamedRelation = { relation: AnyRelation; targetTableName: string }

export type DrizzleMetadata = {
  /** Tables keyed by their schema (TS) name. */
  tables: Record<string, PgTable>
  /** Relations per table, keyed by table then relation name. */
  relationMap: Record<string, Record<string, TableNamedRelation>>
  /** v1 relational config. Synthesized on 1.x, where it backs nothing but lookups. */
  // biome-ignore lint/suspicious/noExplicitAny: shape differs per drizzle major
  relationalSchema: any
  /** SQL table name -> schema (TS) name. */
  tableNamesMap: Record<string, string>
}

/** Read the table/relation metadata out of a drizzle database instance. */
// biome-ignore lint/suspicious/noExplicitAny: Drizzle generic parameters
export const extractMetadataFromDb = (db: any): DrizzleMetadata => {
  const internal = db?._

  // drizzle 1.x: relations are pre-built and the raw schema is no longer kept.
  if (internal?.relations && !internal.fullSchema) {
    return extractMetadataFromRelationsV2(internal.relations)
  }

  const fullSchema = internal?.fullSchema
  if (!fullSchema) {
    throw new Error(
      'GraphQL-Suite Error: Schema not found in drizzle instance. Make sure schema is passed to the drizzle() constructor.',
    )
  }

  return extractMetadataFromSchemaV1(fullSchema, internal.schema, internal.tableNamesMap)
}

/**
 * Build metadata from a bare set of drizzle schema exports — tables and, on
 * 0.4x, `relations()` objects. Used by `buildSchemaFromDrizzle`, which has no
 * database instance to read from.
 */
export const extractMetadataFromSchemaExports = (
  drizzleSchema: Record<string, unknown>,
): DrizzleMetadata => {
  // A prebuilt v2 relations config passed straight through.
  if (isRelationsV2Config(drizzleSchema)) {
    return extractMetadataFromRelationsV2(drizzleSchema)
  }

  if (!extractTablesRelationalConfigV1 || !createTableRelationsHelpersV1) {
    throw new Error(
      'GraphQL-Suite Error: buildSchemaFromDrizzle() needs either drizzle 0.4x `relations()` exports, or the relations config returned by `defineRelations()` on drizzle 1.x.',
    )
  }

  const { tables, tableNamesMap } = extractTablesRelationalConfigV1(
    drizzleSchema,
    createTableRelationsHelpersV1,
  )
  return extractMetadataFromSchemaV1(drizzleSchema, tables, tableNamesMap)
}

/** Whether a value is a `defineRelations()` result rather than schema exports. */
const isRelationsV2Config = (value: Record<string, unknown>): boolean => {
  const entries = Object.values(value)
  if (!entries.length) return false
  return entries.every(
    (entry) =>
      typeof entry === 'object' &&
      entry !== null &&
      'table' in entry &&
      'relations' in entry &&
      is((entry as { table: unknown }).table, PgTable),
  )
}

// ─── Metadata: drizzle 1.x ───────────────────────────────────

const extractMetadataFromRelationsV2 = (
  // biome-ignore lint/suspicious/noExplicitAny: v2 TablesRelationalConfig
  relations: Record<string, any>,
): DrizzleMetadata => {
  const tables: Record<string, PgTable> = {}
  const tableNamesMap: Record<string, string> = {}
  // biome-ignore lint/suspicious/noExplicitAny: synthesized v1-shaped config
  const relationalSchema: Record<string, any> = {}

  for (const [tsName, config] of Object.entries(relations)) {
    const table = config?.table
    if (!is(table, PgTable)) continue

    tables[tsName] = table as PgTable
    tableNamesMap[getTableName(table as PgTable)] = tsName

    const columns = getTableColumns(table as PgTable)
    relationalSchema[tsName] = {
      tsName,
      dbName: getTableName(table as PgTable),
      columns,
      relations: config.relations ?? {},
      primaryKey: Object.values(columns).filter((column) => column.primary),
    }
  }

  if (!Object.keys(tables).length) {
    throw new Error(
      "GraphQL-Suite Error: No tables detected in Drizzle-ORM's database instance. Did you forget to pass schema to drizzle constructor?",
    )
  }

  const relationMap: Record<string, Record<string, TableNamedRelation>> = {}
  for (const [tsName, config] of Object.entries(relations)) {
    if (!tables[tsName]) continue

    const named: Record<string, TableNamedRelation> = {}
    for (const [relationName, relation] of Object.entries(config.relations ?? {})) {
      const targetTableName = (relation as AnyRelation)?.targetTableName
      // Skip relations pointing at a table that was excluded from the schema.
      if (!targetTableName || !tables[targetTableName]) continue
      named[relationName] = { relation, targetTableName }
    }
    relationMap[tsName] = named
  }

  return { tables, relationMap, relationalSchema, tableNamesMap }
}

// ─── Metadata: drizzle 0.4x ──────────────────────────────────

const extractMetadataFromSchemaV1 = (
  fullSchema: Record<string, unknown>,
  // biome-ignore lint/suspicious/noExplicitAny: v1 TablesRelationalConfig
  relationalSchema: any,
  tableNamesMap: Record<string, string>,
): DrizzleMetadata => {
  const tableEntries = Object.entries(fullSchema).filter(([, value]) => is(value, PgTable)) as [
    string,
    PgTable,
  ][]

  if (!tableEntries.length) {
    throw new Error(
      "GraphQL-Suite Error: No tables detected in Drizzle-ORM's database instance. Did you forget to pass schema to drizzle constructor?",
    )
  }

  const tables = Object.fromEntries(tableEntries)
  const relationMap: Record<string, Record<string, TableNamedRelation>> = {}

  if (RelationsV1 && createTableRelationsHelpersV1) {
    for (const value of Object.values(fullSchema)) {
      if (!is(value, RelationsV1)) continue

      // biome-ignore lint/suspicious/noExplicitAny: v1 Relations instance
      const relationsValue = value as any
      const owner = tableEntries.find(([, table]) => table === relationsValue.table)
      if (!owner) continue // table was excluded

      const [tableName] = owner
      const config = relationsValue.config(createTableRelationsHelpersV1(tables[tableName]))

      const named: Record<string, TableNamedRelation> = {}
      for (const [relationName, relation] of Object.entries(config)) {
        const target = tableEntries.find(
          ([, table]) => table === getRelationTargetTable(relation as AnyRelation),
        )
        if (!target) continue // target table was excluded
        named[relationName] = { relation, targetTableName: target[0] }
      }
      relationMap[tableName] = named
    }
  }

  return { tables, relationMap, relationalSchema, tableNamesMap }
}
