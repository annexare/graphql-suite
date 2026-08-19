import { beforeEach, describe, expect, test } from 'bun:test'
import type { SQL } from 'drizzle-orm'
import { createTableRelationsHelpers, extractTablesRelationalConfig, relations } from 'drizzle-orm'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import { integer, json, pgTable, text, uuid } from 'drizzle-orm/pg-core'
import { graphql } from 'graphql'

import { buildSchema } from './index'
import type { BuildSchemaConfig } from './types'

// ─── Test Schema ─────────────────────────────────────────────
// Modelled on a production consumer: junction tables, several named
// self-relations on one table, and relation chains long enough to reach the
// configured depth limit. Column pruning and relation-argument extraction are
// driven entirely by `parseResolveInfo`, so this is where a selection-tree
// regression shows up.

const assetType = pgTable('assetType', {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  label: text(),
})

const fileInfo = pgTable('fileInfo', {
  id: uuid().primaryKey().defaultRandom(),
  assetId: uuid().notNull(),
  fileExt: text(),
  fileSize: integer(),
})

const asset = pgTable('asset', {
  id: uuid().primaryKey().defaultRandom(),
  assetTypeId: uuid().notNull(),
  templateId: uuid(),
  selectedVariantId: uuid(),
  name: text().notNull(),
  label: text(),
})

const attributeType = pgTable('attributeType', {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  label: text(),
})

const attribute = pgTable('attribute', {
  id: uuid().primaryKey().defaultRandom(),
  assetId: uuid().notNull(),
  attributeTypeId: uuid().notNull(),
  parentId: uuid(),
  name: text().notNull(),
  order: integer(),
})

const override = pgTable('override', {
  id: uuid().primaryKey().defaultRandom(),
  assetId: uuid(),
  attributeId: uuid().notNull(),
  parentId: uuid(),
  value: json(),
  order: integer(),
})

const overrideToAsset = pgTable('overrideToAsset', {
  id: uuid().primaryKey().defaultRandom(),
  overrideId: uuid().notNull(),
  assetId: uuid().notNull(),
})

const overrideToAttribute = pgTable('overrideToAttribute', {
  id: uuid().primaryKey().defaultRandom(),
  overrideId: uuid().notNull(),
  attributeId: uuid().notNull(),
})

const assetRelations = relations(asset, ({ one, many }) => ({
  assetType: one(assetType, { fields: [asset.assetTypeId], references: [assetType.id] }),
  fileInfo: one(fileInfo, { fields: [asset.id], references: [fileInfo.assetId] }),
  attributes: many(attribute),
  overrides: many(override, { relationName: 'asset' }),
  template: one(asset, {
    fields: [asset.templateId],
    references: [asset.id],
    relationName: 'template',
  }),
  selectedVariant: one(asset, {
    fields: [asset.selectedVariantId],
    references: [asset.id],
    relationName: 'selectedVariant',
  }),
}))

const fileInfoRelations = relations(fileInfo, ({ one }) => ({
  asset: one(asset, { fields: [fileInfo.assetId], references: [asset.id] }),
}))

const assetTypeRelations = relations(assetType, ({ many }) => ({ assets: many(asset) }))

const attributeRelations = relations(attribute, ({ one }) => ({
  asset: one(asset, { fields: [attribute.assetId], references: [asset.id] }),
  attributeType: one(attributeType, {
    fields: [attribute.attributeTypeId],
    references: [attributeType.id],
  }),
}))

const attributeTypeRelations = relations(attributeType, ({ many }) => ({
  attributes: many(attribute),
}))

const overrideRelations = relations(override, ({ one }) => ({
  asset: one(asset, { fields: [override.assetId], references: [asset.id], relationName: 'asset' }),
  attribute: one(attribute, { fields: [override.attributeId], references: [attribute.id] }),
  connectedAsset: one(overrideToAsset, {
    fields: [override.id],
    references: [overrideToAsset.overrideId],
    relationName: 'connectedAsset',
  }),
  connectedAttribute: one(overrideToAttribute, {
    fields: [override.id],
    references: [overrideToAttribute.overrideId],
    relationName: 'connectedAttribute',
  }),
}))

const overrideToAssetRelations = relations(overrideToAsset, ({ one }) => ({
  override: one(override, {
    fields: [overrideToAsset.overrideId],
    references: [override.id],
    relationName: 'connectedAsset',
  }),
  asset: one(asset, { fields: [overrideToAsset.assetId], references: [asset.id] }),
}))

const overrideToAttributeRelations = relations(overrideToAttribute, ({ one }) => ({
  override: one(override, {
    fields: [overrideToAttribute.overrideId],
    references: [override.id],
    relationName: 'connectedAttribute',
  }),
  attribute: one(attribute, {
    fields: [overrideToAttribute.attributeId],
    references: [attribute.id],
  }),
}))

const drizzleSchema = {
  assetType,
  fileInfo,
  asset,
  attributeType,
  attribute,
  override,
  overrideToAsset,
  overrideToAttribute,
  assetTypeRelations,
  fileInfoRelations,
  assetRelations,
  attributeTypeRelations,
  attributeRelations,
  overrideRelations,
  overrideToAssetRelations,
  overrideToAttributeRelations,
}

// Mirrors the consumer's configuration: deeper relations than the default,
// two levels of self-relation, and natural plural/singular query names.
const config = {
  limitRelationDepth: 5,
  limitSelfRelationDepth: 2,
  suffixes: { list: 's', single: '' },
  pruneRelations: {
    'assetType.assets': false,
    'fileInfo.asset': false,
    'overrideToAsset.override': false,
    'overrideToAttribute.override': false,
  },
} satisfies BuildSchemaConfig

// ─── Recording Mock DB ───────────────────────────────────────

type FindConfig = {
  columns?: Record<string, true>
  with?: Record<string, FindConfig>
  limit?: number
  offset?: number
  where?: SQL
  orderBy?: unknown[]
}

let calls: { table: string; config: FindConfig }[] = []

function createRecordingDb(): PgDatabase<PgQueryResultHKT, Record<string, unknown>> {
  const { tables, tableNamesMap } = extractTablesRelationalConfig(
    drizzleSchema,
    createTableRelationsHelpers,
  )

  const query = Object.fromEntries(
    Object.keys(tables).map((name) => [
      name,
      {
        findMany: (c: FindConfig = {}) => {
          calls.push({ table: name, config: c })
          return Promise.resolve([])
        },
        findFirst: (c: FindConfig = {}) => {
          calls.push({ table: name, config: c })
          return Promise.resolve(null)
        },
      },
    ]),
  )

  return {
    _: { fullSchema: drizzleSchema, schema: tables, tableNamesMap },
    query,
  } as unknown as PgDatabase<PgQueryResultHKT, Record<string, unknown>>
}

const { schema } = buildSchema(createRecordingDb(), config)

beforeEach(() => {
  calls = []
})

async function run(source: string, variableValues?: Record<string, unknown>) {
  const result = await graphql({ schema, source, variableValues })
  if (result.errors?.length) throw result.errors[0]
  return result
}

/** The `with` sub-tree of the recorded query, walked by relation name. */
const relationAt = (...path: string[]) => {
  let node: FindConfig | undefined = calls[0]?.config
  for (const key of path) node = node?.with?.[key]
  return node
}

const columnsAt = (...path: string[]) => Object.keys(relationAt(...path)?.columns ?? {}).sort()

// ─── Tests ───────────────────────────────────────────────────

describe('deep relation selection', () => {
  test('generates the consumer-style query names', () => {
    const fields = Object.keys(
      // biome-ignore lint/style/noNonNullAssertion: query type always exists
      schema.getQueryType()!.getFields(),
    )

    expect(fields).toContain('assets')
    expect(fields).toContain('asset')
    expect(fields).toContain('assetCount')
  })

  test('walks a five-level relation chain through junction tables', async () => {
    await run(`{
      asset {
        id
        name
        overrides {
          id
          connectedAttribute {
            id
            attribute {
              id
              asset {
                id
                selectedVariant { id name }
              }
            }
          }
        }
      }
    }`)

    expect(columnsAt()).toEqual(['id', 'name'])
    expect(columnsAt('overrides')).toEqual(['id'])
    expect(columnsAt('overrides', 'connectedAttribute')).toEqual(['id'])
    expect(columnsAt('overrides', 'connectedAttribute', 'attribute')).toEqual(['id'])
    expect(columnsAt('overrides', 'connectedAttribute', 'attribute', 'asset')).toEqual(['id'])
    expect(
      columnsAt('overrides', 'connectedAttribute', 'attribute', 'asset', 'selectedVariant'),
    ).toEqual(['id', 'name'])
  })

  test('keeps named self-relations distinct at depth', async () => {
    await run('{ asset { id template { id name } selectedVariant { id label } } }')

    expect(columnsAt('template')).toEqual(['id', 'name'])
    expect(columnsAt('selectedVariant')).toEqual(['id', 'label'])
  })

  test('carries arguments to a relation nested four levels down', async () => {
    await run(`{
      asset {
        id
        overrides(limit: 2, offset: 1) {
          id
          connectedAsset {
            id
            asset {
              id
              attributes(limit: 7, orderBy: { order: { direction: asc, priority: 1 } }) { id }
            }
          }
        }
      }
    }`)

    expect(relationAt('overrides')?.limit).toBe(2)
    expect(relationAt('overrides')?.offset).toBe(1)

    const attributes = relationAt('overrides', 'connectedAsset', 'asset', 'attributes')
    expect(attributes?.limit).toBe(7)
    expect(attributes?.orderBy).toHaveLength(1)
  })

  test('resolves deeply nested relation arguments from variables', async () => {
    await run(
      `query ($n: Int) {
        asset { id overrides { id attribute { id asset { id attributes(limit: $n) { id } } } } }
      }`,
      { n: 3 },
    )

    expect(relationAt('overrides', 'attribute', 'asset', 'attributes')?.limit).toBe(3)
  })

  test('merges a deep selection split across fragments', async () => {
    await run(`
      { asset { id ...A ...B } }
      fragment A on AssetSelectItem { overrides { id attribute { id name } } }
      fragment B on AssetSelectItem { overrides { order attribute { order } } }
    `)

    expect(columnsAt('overrides')).toEqual(['id', 'order'])
    expect(columnsAt('overrides', 'attribute')).toEqual(['id', 'name', 'order'])
  })

  test('applies @skip to a relation nested deep in the tree', async () => {
    await run(
      `
      query ($hide: Boolean!) {
        asset { id overrides { id attribute @skip(if: $hide) { id } } }
      }`,
      { hide: true },
    )

    expect(relationAt('overrides', 'attribute')).toBeUndefined()
    expect(columnsAt('overrides')).toEqual(['id'])
  })

  test('prunes relations the configuration removed', async () => {
    // `assetType.assets` is pruned, so the back-reference is not selectable.
    const result = await graphql({
      schema,
      source: '{ asset { id assetType { id assets { id } } } }',
    })

    expect(result.errors?.[0]?.message).toContain('Cannot query field "assets"')
  })
})

describe('aliased relations', () => {
  // Drizzle's `with` is keyed by relation name, so several aliases of one
  // relation collapse to a single fetch and the first occurrence supplies the
  // arguments. Long-standing behaviour — pinned here so a selection-tree change
  // cannot alter it silently.
  test('collapse to one relation fetch, first occurrence winning', async () => {
    await run(`{
      asset {
        id
        first: overrides(limit: 2) { id }
        second: overrides(limit: 9) { order }
      }
    }`)

    expect(Object.keys(calls[0]?.config.with ?? {})).toEqual(['overrides'])
    expect(relationAt('overrides')?.limit).toBe(2)
  })

  // The columns follow the same first-occurrence rule, so a second alias asking
  // for different columns reads back null. Verified identical on the published
  // 0.9.1 build, so this is long-standing behaviour rather than a regression.
  test('take their columns from the first occurrence too', async () => {
    await run('{ asset { id a: overrides { id } b: overrides { order } } }')

    expect(columnsAt('overrides')).toEqual(['id'])
  })
})

describe('selection parsing performance', () => {
  test('walks a wide, deep selection well within budget', async () => {
    // 60 aliased columns plus four distinct relation chains — far more nodes
    // than a UI sends, guarding against the selection walk degrading
    // super-linearly or dropping entries under volume.
    const aliases = Array.from({ length: 60 }, (_, i) => `n${i}: name`).join(' ')
    const source = `{
      asset {
        id ${aliases}
        assetType { id ${Array.from({ length: 20 }, (_, i) => `l${i}: label`).join(' ')} }
        fileInfo { id fileExt fileSize }
        template { id name assetType { id } }
        overrides {
          id
          connectedAttribute { id attribute { id asset { id name } } }
        }
      }
    }`

    const start = performance.now()
    await run(source)
    const elapsed = performance.now() - start

    // Aliases of one column collapse to that single column...
    expect(columnsAt()).toEqual(['id', 'name'])
    // ...while every distinct relation branch is still walked.
    expect(Object.keys(calls[0]?.config.with ?? {}).sort()).toEqual([
      'assetType',
      'fileInfo',
      'overrides',
      'template',
    ])
    expect(columnsAt('template')).toEqual(['id', 'name'])
    expect(columnsAt('overrides', 'connectedAttribute', 'attribute', 'asset')).toEqual([
      'id',
      'name',
    ])
    expect(elapsed).toBeLessThan(1000)
  })

  test('repeated resolution does not accumulate cost', async () => {
    const source = `{
      asset { id overrides { id connectedAttribute { id attribute { id asset { id } } } } }
    }`

    const start = performance.now()
    for (let i = 0; i < 50; i++) {
      calls = []
      await run(source)
    }
    const elapsed = performance.now() - start

    expect(elapsed).toBeLessThan(2000)
  })
})
