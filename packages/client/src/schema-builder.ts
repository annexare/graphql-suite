import type { BuildSchemaConfig } from '@graphql-suite/schema'
import { getTableColumns, getTableName, is, Many, One, Relations, Table } from 'drizzle-orm'

import type { SchemaDescriptor } from './types'

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export function buildSchemaDescriptor(
  schema: Record<string, unknown>,
  config: BuildSchemaConfig = {},
): SchemaDescriptor {
  const excludeSet = new Set(config.tables?.exclude ?? [])
  const listSuffix = config.suffixes?.list ?? 's'

  // Phase 1: Collect tables — map JS key → { table, dbName, columns }
  const tableMap = new Map<string, { table: Table; dbName: string; columns: string[] }>()
  // Also build dbName → jsKey lookup for relation resolution
  const dbNameToKey = new Map<string, string>()

  for (const [key, value] of Object.entries(schema)) {
    if (is(value, Table)) {
      if (excludeSet.has(key)) continue
      const dbName = getTableName(value)
      const cols = Object.keys(getTableColumns(value))
      tableMap.set(key, { table: value, dbName, columns: cols })
      dbNameToKey.set(dbName, key)
    }
  }

  // Phase 2: Collect relations — map dbName → { relationName → { entity, type } }
  const relationsMap = new Map<string, Record<string, { entity: string; type: 'one' | 'many' }>>()

  for (const value of Object.values(schema)) {
    if (!is(value, Relations)) continue

    // Relations.table gives us the source table
    const sourceDbName = getTableName(value.table as Table)
    const sourceKey = dbNameToKey.get(sourceDbName)
    if (!sourceKey || !tableMap.has(sourceKey)) continue

    // Call the config function with helpers to extract relation definitions
    const helpers = {
      one: (referencedTable: Table, cfg?: unknown) => {
        return new One(value.table as Table, referencedTable, cfg as never, false)
      },
      many: (referencedTable: Table, cfg?: { relationName?: string }) => {
        return new Many(value.table as Table, referencedTable, cfg as never)
      },
    }

    // biome-ignore lint/suspicious/noExplicitAny: drizzle helpers typing
    const relConfig = value.config(helpers as any)
    const rels: Record<string, { entity: string; type: 'one' | 'many' }> = {}

    for (const [relName, relValue] of Object.entries(relConfig)) {
      const rel = relValue as One | Many<string>
      const targetDbName = rel.referencedTableName
      if (!targetDbName) continue

      const targetKey = dbNameToKey.get(targetDbName)
      if (!targetKey) continue

      const type = is(rel, One) ? 'one' : 'many'
      rels[relName] = { entity: targetKey, type }
    }

    relationsMap.set(sourceKey, rels)
  }

  // Phase 3: Apply pruneRelations config
  const pruneRelations = config.pruneRelations ?? {}
  for (const [sourceKey, rels] of relationsMap) {
    for (const relName of Object.keys(rels)) {
      const pruneKey = `${sourceKey}.${relName}`
      const pruneValue = pruneRelations[pruneKey]
      if (pruneValue === false) {
        delete rels[relName]
      }
      // 'leaf' and { only } don't remove the relation from the descriptor —
      // they only limit traversal depth, which is a server-side concern.
      // The client still needs to know the relation exists.
    }
  }

  // Phase 4: Build schema descriptor
  const descriptor: SchemaDescriptor = {}

  for (const [key, { columns }] of tableMap) {
    const rels = relationsMap.get(key) ?? {}

    descriptor[key] = {
      queryName: key,
      queryListName: `${key}${listSuffix}`,
      countName: `${key}Count`,
      insertName: `insertInto${capitalize(key)}`,
      insertSingleName: `insertInto${capitalize(key)}Single`,
      updateName: `update${capitalize(key)}`,
      deleteName: `deleteFrom${capitalize(key)}`,
      fields: columns,
      relations: rels,
    }
  }

  return descriptor
}
