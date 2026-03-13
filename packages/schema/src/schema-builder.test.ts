import { describe, expect, test } from 'bun:test'
import {
  createTableRelationsHelpers,
  extractTablesRelationalConfig,
  getTableColumns,
  relations,
  type SQL,
} from 'drizzle-orm'
import { integer, pgSchema, pgTable, text, uuid } from 'drizzle-orm/pg-core'

import { SchemaBuilder } from './schema-builder'

// ─── Test Schema (unqualified) ──────────────────────────────

const parent = pgTable('parent', {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
})

const child = pgTable('child', {
  id: uuid().primaryKey().defaultRandom(),
  parentId: uuid()
    .notNull()
    .references(() => parent.id),
  label: text().notNull(),
})

const parentRelations = relations(parent, ({ many }) => ({
  children: many(child),
}))

const childRelations = relations(child, ({ one }) => ({
  parent: one(parent, { fields: [child.parentId], references: [parent.id] }),
}))

const testSchema = { parent, child, parentRelations, childRelations }

// ─── Test Schema (schema-qualified) ─────────────────────────

const testPgSchema = pgSchema('test')

const schemaParent = testPgSchema.table('parent', {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
})

const schemaChild = testPgSchema.table('child', {
  id: uuid().primaryKey().defaultRandom(),
  parentId: uuid()
    .notNull()
    .references(() => schemaParent.id),
  label: text().notNull(),
})

const schemaParentRelations = relations(schemaParent, ({ many }) => ({
  children: many(schemaChild),
}))

const schemaChildRelations = relations(schemaChild, ({ one }) => ({
  parent: one(schemaParent, { fields: [schemaChild.parentId], references: [schemaParent.id] }),
}))

const schemaQualifiedSchema = {
  schemaParent,
  schemaChild,
  schemaParentRelations,
  schemaChildRelations,
}

// ─── Mock DB ────────────────────────────────────────────────

function createMockDb(schema: Record<string, unknown> = testSchema) {
  const { tables, tableNamesMap } = extractTablesRelationalConfig(
    schema,
    createTableRelationsHelpers,
  )

  return {
    _: { fullSchema: schema, schema: tables, tableNamesMap },
    query: {},
    select: () => ({ from: () => ({ where: () => ({}) }) }),
  }
}

// ─── Test Schema (self-referencing) ─────────────────────────

const node = pgTable('node', {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  // biome-ignore lint/suspicious/noExplicitAny: Drizzle circular self-reference requires any
  parentNodeId: uuid().references((): any => node.id),
})

const tag = pgTable('tag', {
  id: uuid().primaryKey().defaultRandom(),
  label: text().notNull(),
  nodeId: uuid()
    .notNull()
    .references(() => node.id),
})

const nodeRelations = relations(node, ({ one, many }) => ({
  parentNode: one(node, {
    fields: [node.parentNodeId],
    references: [node.id],
    relationName: 'nodeTree',
  }),
  childNodes: many(node, { relationName: 'nodeTree' }),
  tags: many(tag),
}))

const tagRelations = relations(tag, ({ one }) => ({
  node: one(node, { fields: [tag.nodeId], references: [node.id] }),
}))

const selfRefSchema = { node, tag, nodeRelations, tagRelations }

// ─── Tests ──────────────────────────────────────────────────

describe('SchemaBuilder', () => {
  test('constructs without error from test schema', () => {
    const mockDb = createMockDb()
    // biome-ignore lint/suspicious/noExplicitAny: mock db for testing
    expect(() => new SchemaBuilder(mockDb as any)).not.toThrow()
  })

  test('buildEntities generates queries and mutations', () => {
    const mockDb = createMockDb()
    // db.query needs stubs for each table so createQueryResolver doesn't throw
    const findStub = {
      findMany: () => Promise.resolve([]),
      findFirst: () => Promise.resolve(null),
    }
    // biome-ignore lint/suspicious/noExplicitAny: mock db for testing
    ;(mockDb as any).query = { parent: findStub, child: findStub }
    // biome-ignore lint/suspicious/noExplicitAny: mock db for testing
    const builder = new SchemaBuilder(mockDb as any)
    const entities = builder.buildEntities()

    expect(entities.queries).toBeDefined()
    expect(entities.mutations).toBeDefined()
    expect(entities.queries.parent).toBeDefined()
    expect(entities.queries.child).toBeDefined()
    expect(entities.queries.parentCount).toBeDefined()
    expect(entities.queries.childCount).toBeDefined()
  })
})

describe('buildJoinCondition', () => {
  test('One relation (child.parent) returns SQL join condition', () => {
    const mockDb = createMockDb()
    // biome-ignore lint/suspicious/noExplicitAny: accessing private method for testing
    const builder = new SchemaBuilder(mockDb as any) as any

    const relations = builder.relationMap.child
    const { relation } = relations.parent
    const parentTable = builder.tables.parent
    const childTable = builder.tables.child

    const result: SQL | undefined = builder.buildJoinCondition(childTable, parentTable, relation)
    expect(result).toBeDefined()
    expect(result).not.toBeNull()
  })

  test('Many relation (parent.children) returns SQL join condition', () => {
    const mockDb = createMockDb()
    // biome-ignore lint/suspicious/noExplicitAny: accessing private method for testing
    const builder = new SchemaBuilder(mockDb as any) as any

    const relations = builder.relationMap.parent
    const { relation } = relations.children
    const parentTable = builder.tables.parent
    const childTable = builder.tables.child

    const result: SQL | undefined = builder.buildJoinCondition(parentTable, childTable, relation)
    expect(result).toBeDefined()
    expect(result).not.toBeNull()
  })

  test('broken relation returns undefined', () => {
    const mockDb = createMockDb()
    // biome-ignore lint/suspicious/noExplicitAny: accessing private method for testing
    const builder = new SchemaBuilder(mockDb as any) as any

    // Construct a fake relation object that normalizeRelation cannot resolve
    const fakeRelation = { referencedTable: parent, fieldName: 'fake' }

    const result: SQL | undefined = builder.buildJoinCondition(parent, child, fakeRelation)
    expect(result).toBeUndefined()
  })
})

describe('buildJoinCondition (schema-qualified tables)', () => {
  test('One relation uses unqualified table name for parent column', () => {
    const mockDb = createMockDb(schemaQualifiedSchema)
    // biome-ignore lint/suspicious/noExplicitAny: accessing private method for testing
    const builder = new SchemaBuilder(mockDb as any) as any

    const relations = builder.relationMap.schemaChild
    const { relation } = relations.parent
    const parentTable = builder.tables.schemaParent
    const childTable = builder.tables.schemaChild

    const result: SQL | undefined = builder.buildJoinCondition(childTable, parentTable, relation)
    expect(result).toBeDefined()

    // The SQL should use unqualified "child" not schema-qualified "test"."child"
    if (!result) throw new Error('expected result to be defined')
    const chunks = result.queryChunks
    const sqlString = chunks
      .map((c: unknown) => {
        if (typeof c === 'string') return c
        if (c && typeof c === 'object' && 'value' in c)
          return String((c as { value: unknown }).value)
        return ''
      })
      .join('')

    // Should contain unqualified "child" identifier (the parent table in this One relation)
    expect(sqlString).toContain('child')
    // Should NOT contain schema-qualified reference for the parent column
    expect(sqlString).not.toContain('test.child')
  })

  test('Many relation uses unqualified table name for parent column', () => {
    const mockDb = createMockDb(schemaQualifiedSchema)
    // biome-ignore lint/suspicious/noExplicitAny: accessing private method for testing
    const builder = new SchemaBuilder(mockDb as any) as any

    const relations = builder.relationMap.schemaParent
    const { relation } = relations.children
    const parentTable = builder.tables.schemaParent
    const childTable = builder.tables.schemaChild

    const result: SQL | undefined = builder.buildJoinCondition(parentTable, childTable, relation)
    expect(result).toBeDefined()

    // The SQL should use unqualified "parent" not schema-qualified "test"."parent"
    if (!result) throw new Error('expected result to be defined')
    const chunks = result.queryChunks
    const sqlString = chunks
      .map((c: unknown) => {
        if (typeof c === 'string') return c
        if (c && typeof c === 'object' && 'value' in c)
          return String((c as { value: unknown }).value)
        return ''
      })
      .join('')

    expect(sqlString).toContain('parent')
    expect(sqlString).not.toContain('test.parent')
  })

  test('constructs without error from schema-qualified schema', () => {
    const mockDb = createMockDb(schemaQualifiedSchema)
    // biome-ignore lint/suspicious/noExplicitAny: mock db for testing
    expect(() => new SchemaBuilder(mockDb as any)).not.toThrow()
  })
})

// ─── Table Configuration ────────────────────────────────────

describe('table exclusion', () => {
  test('excluded tables are removed from the schema', () => {
    const mockDb = createMockDb()
    const findStub = { findMany: () => Promise.resolve([]), findFirst: () => Promise.resolve(null) }
    // biome-ignore lint/suspicious/noExplicitAny: mock db for testing
    ;(mockDb as any).query = { parent: findStub }

    // biome-ignore lint/suspicious/noExplicitAny: mock db for testing
    const builder = new SchemaBuilder(mockDb as any, {
      tables: { exclude: ['child'] },
    })
    const entities = builder.buildEntities()

    expect(entities.queries.parent).toBeDefined()
    expect(entities.queries.child).toBeUndefined()
    expect(entities.queries.childSingle).toBeUndefined()
    expect(entities.queries.childCount).toBeUndefined()
  })

  test('relations to excluded tables are silently skipped', () => {
    const mockDb = createMockDb()
    const findStub = { findMany: () => Promise.resolve([]), findFirst: () => Promise.resolve(null) }
    // biome-ignore lint/suspicious/noExplicitAny: mock db for testing
    ;(mockDb as any).query = { parent: findStub }

    // biome-ignore lint/suspicious/noExplicitAny: mock db for testing
    const builder = new SchemaBuilder(mockDb as any, {
      tables: { exclude: ['child'] },
    })
    const result = builder.build()
    const typeMap = result.schema.getTypeMap()

    // Parent type should exist but without children relation
    const parentType = typeMap.ParentSelectItem
    expect(parentType).toBeDefined()
    if ('getFields' in parentType) {
      // biome-ignore lint/suspicious/noExplicitAny: accessing GraphQL type fields
      const fields = (parentType as any).getFields()
      expect(fields.id).toBeDefined()
      expect(fields.name).toBeDefined()
      expect(fields.children).toBeUndefined()
    }
  })
})

describe('per-table operation control', () => {
  test('queries: false suppresses query generation', () => {
    const mockDb = createMockDb()
    const findStub = { findMany: () => Promise.resolve([]), findFirst: () => Promise.resolve(null) }
    // biome-ignore lint/suspicious/noExplicitAny: mock db for testing
    ;(mockDb as any).query = { parent: findStub, child: findStub }

    // biome-ignore lint/suspicious/noExplicitAny: mock db for testing
    const builder = new SchemaBuilder(mockDb as any, {
      tables: { config: { child: { queries: false } } },
    })
    const entities = builder.buildEntities()

    // Child queries should be absent
    expect(entities.queries.child).toBeUndefined()
    expect(entities.queries.childSingle).toBeUndefined()
    expect(entities.queries.childCount).toBeUndefined()

    // Child mutations should still exist
    expect(entities.mutations.insertIntoChild).toBeDefined()
    expect(entities.mutations.deleteFromChild).toBeDefined()
  })

  test('mutations: false suppresses mutation generation', () => {
    const mockDb = createMockDb()
    const findStub = { findMany: () => Promise.resolve([]), findFirst: () => Promise.resolve(null) }
    // biome-ignore lint/suspicious/noExplicitAny: mock db for testing
    ;(mockDb as any).query = { parent: findStub, child: findStub }

    // biome-ignore lint/suspicious/noExplicitAny: mock db for testing
    const builder = new SchemaBuilder(mockDb as any, {
      tables: { config: { child: { mutations: false } } },
    })
    const entities = builder.buildEntities()

    // Child queries should still exist
    expect(entities.queries.child).toBeDefined()

    // Child mutations should be absent
    expect(entities.mutations.insertIntoChild).toBeUndefined()
    expect(entities.mutations.deleteFromChild).toBeUndefined()
    expect(entities.mutations.updateChild).toBeUndefined()
  })

  test('queries: false + mutations: false skips table entirely but preserves relation types', () => {
    const mockDb = createMockDb()
    const findStub = { findMany: () => Promise.resolve([]), findFirst: () => Promise.resolve(null) }
    // biome-ignore lint/suspicious/noExplicitAny: mock db for testing
    ;(mockDb as any).query = { parent: findStub }

    // biome-ignore lint/suspicious/noExplicitAny: mock db for testing
    const builder = new SchemaBuilder(mockDb as any, {
      tables: { config: { child: { queries: false, mutations: false } } },
    })
    const entities = builder.buildEntities()
    const result = builder.build()
    const typeMap = result.schema.getTypeMap()

    // No top-level child operations
    expect(entities.queries.child).toBeUndefined()
    expect(entities.mutations.insertIntoChild).toBeUndefined()

    // Parent's children relation type should still exist (lazy-created)
    const parentType = typeMap.ParentSelectItem
    expect(parentType).toBeDefined()
    if ('getFields' in parentType) {
      // biome-ignore lint/suspicious/noExplicitAny: accessing GraphQL type fields
      const fields = (parentType as any).getFields()
      expect(fields.children).toBeDefined()
    }
  })
})

describe('self-relation depth limiting', () => {
  test('self-referencing schema builds without error', () => {
    const mockDb = createMockDb(selfRefSchema)
    // biome-ignore lint/suspicious/noExplicitAny: mock db for testing
    expect(() => new SchemaBuilder(mockDb as any, { limitRelationDepth: 5 })).not.toThrow()
  })

  test('limitSelfRelationDepth: 1 omits self-relation fields entirely', () => {
    const mockDb = createMockDb(selfRefSchema)
    const findStub = { findMany: () => Promise.resolve([]), findFirst: () => Promise.resolve(null) }
    // biome-ignore lint/suspicious/noExplicitAny: mock db for testing
    ;(mockDb as any).query = { node: findStub, tag: findStub }

    // limitSelfRelationDepth: 1 (default) — self-relation fields omitted
    // biome-ignore lint/suspicious/noExplicitAny: mock db for testing
    const builder = new SchemaBuilder(mockDb as any, {
      limitRelationDepth: 5,
      limitSelfRelationDepth: 1,
    })
    const result = builder.build()
    const typeMap = result.schema.getTypeMap()

    const nodeType = typeMap.NodeSelectItem
    expect(nodeType).toBeDefined()
    if ('getFields' in nodeType) {
      // biome-ignore lint/suspicious/noExplicitAny: accessing GraphQL type fields
      const nodeFields = (nodeType as any).getFields()
      // Self-relation fields should be omitted
      expect(nodeFields.parentNode).toBeUndefined()
      expect(nodeFields.childNodes).toBeUndefined()
      // Non-self relations should still be present
      expect(nodeFields.tags).toBeDefined()
    }
  })

  test('limitSelfRelationDepth: 2 expands one level of self-relations', () => {
    const mockDb = createMockDb(selfRefSchema)
    const findStub = { findMany: () => Promise.resolve([]), findFirst: () => Promise.resolve(null) }
    // biome-ignore lint/suspicious/noExplicitAny: mock db for testing
    ;(mockDb as any).query = { node: findStub, tag: findStub }

    // biome-ignore lint/suspicious/noExplicitAny: mock db for testing
    const builder = new SchemaBuilder(mockDb as any, {
      limitRelationDepth: 5,
      limitSelfRelationDepth: 2,
    })
    const result = builder.build()
    const typeMap = result.schema.getTypeMap()

    const nodeType = typeMap.NodeSelectItem
    expect(nodeType).toBeDefined()
    if ('getFields' in nodeType) {
      // biome-ignore lint/suspicious/noExplicitAny: accessing GraphQL type fields
      const nodeFields = (nodeType as any).getFields()
      // Self-relation fields should exist at first level
      expect(nodeFields.parentNode).toBeDefined()
      expect(nodeFields.childNodes).toBeDefined()
      // Non-self relations should still be present
      expect(nodeFields.tags).toBeDefined()

      // Navigate into parentNode's type — self-relations should be omitted at this level
      let parentNodeType = nodeFields.parentNode.type
      while (parentNodeType.ofType) parentNodeType = parentNodeType.ofType
      if ('getFields' in parentNodeType) {
        const parentNodeFields = parentNodeType.getFields()
        // Scalar fields present
        expect(parentNodeFields.id).toBeDefined()
        expect(parentNodeFields.name).toBeDefined()
        // Non-self relations present (tags still available)
        expect(parentNodeFields.tags).toBeDefined()
        // Self-relations omitted at depth 2
        expect(parentNodeFields.parentNode).toBeUndefined()
        expect(parentNodeFields.childNodes).toBeUndefined()
      }
    }
  })

  test('cross-table paths reset the self-relation counter', () => {
    const mockDb = createMockDb(selfRefSchema)
    const findStub = { findMany: () => Promise.resolve([]), findFirst: () => Promise.resolve(null) }
    // biome-ignore lint/suspicious/noExplicitAny: mock db for testing
    ;(mockDb as any).query = { node: findStub, tag: findStub }

    // biome-ignore lint/suspicious/noExplicitAny: mock db for testing
    const builder = new SchemaBuilder(mockDb as any, {
      limitRelationDepth: 5,
      limitSelfRelationDepth: 2,
    })
    const result = builder.build()
    const typeMap = result.schema.getTypeMap()

    // Path: node → tags → node (cross-table hop resets self-depth)
    const nodeType = typeMap.NodeSelectItem
    expect(nodeType).toBeDefined()
    if ('getFields' in nodeType) {
      // biome-ignore lint/suspicious/noExplicitAny: accessing GraphQL type fields
      const nodeFields = (nodeType as any).getFields()
      expect(nodeFields.tags).toBeDefined()

      // Navigate: node → tags
      let tagsType = nodeFields.tags.type
      while (tagsType.ofType) tagsType = tagsType.ofType
      if ('getFields' in tagsType) {
        const tagFields = tagsType.getFields()
        expect(tagFields.node).toBeDefined()

        // Navigate: tags → node (cross-table: self-depth resets to 0)
        let innerNodeType = tagFields.node.type
        while (innerNodeType.ofType) innerNodeType = innerNodeType.ofType
        if ('getFields' in innerNodeType) {
          const innerNodeFields = innerNodeType.getFields()
          // Self-relations should be present (fresh self-depth budget)
          expect(innerNodeFields.parentNode).toBeDefined()
          expect(innerNodeFields.childNodes).toBeDefined()
        }
      }
    }
  })

  test('type count stays reasonable with limitSelfRelationDepth: 2', () => {
    const mockDb = createMockDb(selfRefSchema)
    const findStub = { findMany: () => Promise.resolve([]), findFirst: () => Promise.resolve(null) }
    // biome-ignore lint/suspicious/noExplicitAny: mock db for testing
    ;(mockDb as any).query = { node: findStub, tag: findStub }

    // biome-ignore lint/suspicious/noExplicitAny: mock db for testing
    const builder = new SchemaBuilder(mockDb as any, {
      limitRelationDepth: 5,
      limitSelfRelationDepth: 2,
    })
    const result = builder.build()
    const typeMap = result.schema.getTypeMap()
    const typeCount = Object.keys(typeMap).filter((t) => !t.startsWith('__')).length

    // With self-relation + cross-table cycle limiting, types should stay reasonable
    expect(typeCount).toBeLessThan(100)
  })

  test('invalid limitSelfRelationDepth throws', () => {
    const mockDb = createMockDb(selfRefSchema)
    // biome-ignore lint/suspicious/noExplicitAny: mock db for testing
    expect(() => new SchemaBuilder(mockDb as any, { limitSelfRelationDepth: 0 })).toThrow()
    // biome-ignore lint/suspicious/noExplicitAny: mock db for testing
    expect(() => new SchemaBuilder(mockDb as any, { limitSelfRelationDepth: -1 })).toThrow()
    // biome-ignore lint/suspicious/noExplicitAny: mock db for testing
    expect(() => new SchemaBuilder(mockDb as any, { limitSelfRelationDepth: 1.5 })).toThrow()
  })
})

// ─── Prune Relations ─────────────────────────────────────────

describe('pruneRelations', () => {
  function buildWithPrune(pruneRelations: Record<string, false | 'leaf' | { only: string[] }>) {
    const mockDb = createMockDb(selfRefSchema)
    const findStub = { findMany: () => Promise.resolve([]), findFirst: () => Promise.resolve(null) }
    // biome-ignore lint/suspicious/noExplicitAny: mock db for testing
    ;(mockDb as any).query = { node: findStub, tag: findStub }

    // biome-ignore lint/suspicious/noExplicitAny: mock db for testing
    const builder = new SchemaBuilder(mockDb as any, {
      limitRelationDepth: 5,
      limitSelfRelationDepth: 2,
      pruneRelations,
    })
    return builder.build()
  }

  // biome-ignore lint/suspicious/noExplicitAny: accessing GraphQL type fields
  function getFields(typeMap: Record<string, any>, typeName: string): Record<string, any> {
    const type = typeMap[typeName]
    if (!type || !('getFields' in type)) return {}
    return type.getFields()
  }

  test('false omits relation from parent type', () => {
    const result = buildWithPrune({ 'tag.node': false })
    const typeMap = result.schema.getTypeMap()

    const tagFields = getFields(typeMap, 'TagSelectItem')
    expect(tagFields.id).toBeDefined()
    expect(tagFields.label).toBeDefined()
    // node relation should be omitted
    expect(tagFields.node).toBeUndefined()
  })

  test('false does not affect other tables with the same relation target', () => {
    const result = buildWithPrune({ 'tag.node': false })
    const typeMap = result.schema.getTypeMap()

    // Top-level node should still have its fields (tags, parentNode, childNodes)
    const nodeFields = getFields(typeMap, 'NodeSelectItem')
    expect(nodeFields.tags).toBeDefined()
    expect(nodeFields.parentNode).toBeDefined()
  })

  test("'leaf' expands with scalars only (no child relations)", () => {
    const result = buildWithPrune({ 'node.tags': 'leaf' })
    const typeMap = result.schema.getTypeMap()

    const nodeFields = getFields(typeMap, 'NodeSelectItem')
    expect(nodeFields.tags).toBeDefined()

    // Navigate into tags type
    let tagsType = nodeFields.tags.type
    while (tagsType.ofType) tagsType = tagsType.ofType
    if ('getFields' in tagsType) {
      const tagFields = tagsType.getFields()
      // Scalar fields present
      expect(tagFields.id).toBeDefined()
      expect(tagFields.label).toBeDefined()
      // Relation fields omitted (leaf)
      expect(tagFields.node).toBeUndefined()
    }
  })

  test('{ only: [...] } includes only listed child relations', () => {
    const result = buildWithPrune({ 'tag.node': { only: ['tags'] } })
    const typeMap = result.schema.getTypeMap()

    const tagFields = getFields(typeMap, 'TagSelectItem')
    expect(tagFields.node).toBeDefined()

    // Navigate into tag's node relation type
    let nodeType = tagFields.node.type
    while (nodeType.ofType) nodeType = nodeType.ofType
    if ('getFields' in nodeType) {
      const innerNodeFields = nodeType.getFields()
      // Scalars always present
      expect(innerNodeFields.id).toBeDefined()
      expect(innerNodeFields.name).toBeDefined()
      // 'tags' should be included
      expect(innerNodeFields.tags).toBeDefined()
      // 'parentNode' and 'childNodes' should be excluded
      expect(innerNodeFields.parentNode).toBeUndefined()
      expect(innerNodeFields.childNodes).toBeUndefined()
    }
  })

  test('prune rules are path-independent (only affect the specific parent.relation)', () => {
    // Pruning tag.node should not affect top-level node type
    const result = buildWithPrune({ 'tag.node': 'leaf' })
    const typeMap = result.schema.getTypeMap()

    // Top-level node should still have full relations
    const nodeFields = getFields(typeMap, 'NodeSelectItem')
    expect(nodeFields.tags).toBeDefined()
    expect(nodeFields.parentNode).toBeDefined()
    expect(nodeFields.childNodes).toBeDefined()

    // tag's node should be leaf (scalars only)
    const tagFields = getFields(typeMap, 'TagSelectItem')
    let tagNodeType = tagFields.node.type
    while (tagNodeType.ofType) tagNodeType = tagNodeType.ofType
    if ('getFields' in tagNodeType) {
      const innerFields = tagNodeType.getFields()
      expect(innerFields.id).toBeDefined()
      expect(innerFields.tags).toBeUndefined()
      expect(innerFields.parentNode).toBeUndefined()
    }
  })
})

// ─── Constructor error paths ─────────────────────────────────

describe('constructor error paths', () => {
  test('missing schema throws', () => {
    const badDb = { _: { fullSchema: undefined } }
    // biome-ignore lint/suspicious/noExplicitAny: mock db for testing
    expect(() => new SchemaBuilder(badDb as any)).toThrow('Schema not found')
  })

  test('negative limitRelationDepth throws', () => {
    const mockDb = createMockDb()
    // biome-ignore lint/suspicious/noExplicitAny: mock db for testing
    expect(() => new SchemaBuilder(mockDb as any, { limitRelationDepth: -1 })).toThrow(
      'nonnegative integer',
    )
  })

  test('float limitRelationDepth throws', () => {
    const mockDb = createMockDb()
    // biome-ignore lint/suspicious/noExplicitAny: mock db for testing
    expect(() => new SchemaBuilder(mockDb as any, { limitRelationDepth: 2.5 })).toThrow(
      'nonnegative integer',
    )
  })

  test('same list/single suffixes throws', () => {
    const mockDb = createMockDb()
    expect(
      // biome-ignore lint/suspicious/noExplicitAny: mock db for testing
      () => new SchemaBuilder(mockDb as any, { suffixes: { list: 'X', single: 'X' } }),
    ).toThrow('cannot be the same')
  })
})

// ─── mutations: false ───────────────────────────────────────

describe('mutations: false config', () => {
  test('build() with mutations: false returns schema with no mutation type', () => {
    const mockDb = createMockDb()
    const findStub = { findMany: () => Promise.resolve([]), findFirst: () => Promise.resolve(null) }
    // biome-ignore lint/suspicious/noExplicitAny: mock db for testing
    ;(mockDb as any).query = { parent: findStub, child: findStub }

    // biome-ignore lint/suspicious/noExplicitAny: mock db for testing
    const builder = new SchemaBuilder(mockDb as any, { mutations: false })
    const result = builder.build()

    expect(result.schema.getMutationType()).toBeUndefined()
  })
})

// ─── logDebugInfo ───────────────────────────────────────────

describe('logDebugInfo', () => {
  test('debug: true does not throw', () => {
    const mockDb = createMockDb()
    const findStub = { findMany: () => Promise.resolve([]), findFirst: () => Promise.resolve(null) }
    // biome-ignore lint/suspicious/noExplicitAny: mock db for testing
    ;(mockDb as any).query = { parent: findStub, child: findStub }

    // biome-ignore lint/suspicious/noExplicitAny: mock db for testing
    const builder = new SchemaBuilder(mockDb as any, { debug: true })
    expect(() => builder.build()).not.toThrow()
  })

  test('debug: { relationTree: true } does not throw', () => {
    const mockDb = createMockDb()
    const findStub = { findMany: () => Promise.resolve([]), findFirst: () => Promise.resolve(null) }
    // biome-ignore lint/suspicious/noExplicitAny: mock db for testing
    ;(mockDb as any).query = { parent: findStub, child: findStub }

    // biome-ignore lint/suspicious/noExplicitAny: mock db for testing
    const builder = new SchemaBuilder(mockDb as any, { debug: { relationTree: true } })
    expect(() => builder.build()).not.toThrow()
  })
})

// ─── extractColumnFilters ───────────────────────────────────

describe('extractColumnFilters', () => {
  function getBuilder() {
    const mockDb = createMockDb()
    const findStub = { findMany: () => Promise.resolve([]), findFirst: () => Promise.resolve(null) }
    // biome-ignore lint/suspicious/noExplicitAny: mock db for testing
    ;(mockDb as any).query = { parent: findStub, child: findStub }
    // biome-ignore lint/suspicious/noExplicitAny: accessing private method for testing
    return new SchemaBuilder(mockDb as any) as any
  }

  const parentTable = pgTable('filter_test', {
    id: uuid().primaryKey().defaultRandom(),
    name: text().notNull(),
    age: integer(),
  })
  const parentCols = getTableColumns(parentTable)

  test('eq operator', () => {
    const builder = getBuilder()
    const result = builder.extractColumnFilters(parentCols.name, 'name', { eq: 'Alice' })
    expect(result).toBeDefined()
  })

  test('ne operator', () => {
    const builder = getBuilder()
    const result = builder.extractColumnFilters(parentCols.name, 'name', { ne: 'Bob' })
    expect(result).toBeDefined()
  })

  test('gt operator', () => {
    const builder = getBuilder()
    const result = builder.extractColumnFilters(parentCols.age, 'age', { gt: 18 })
    expect(result).toBeDefined()
  })

  test('gte operator', () => {
    const builder = getBuilder()
    const result = builder.extractColumnFilters(parentCols.age, 'age', { gte: 18 })
    expect(result).toBeDefined()
  })

  test('lt operator', () => {
    const builder = getBuilder()
    const result = builder.extractColumnFilters(parentCols.age, 'age', { lt: 65 })
    expect(result).toBeDefined()
  })

  test('lte operator', () => {
    const builder = getBuilder()
    const result = builder.extractColumnFilters(parentCols.age, 'age', { lte: 65 })
    expect(result).toBeDefined()
  })

  test('like operator', () => {
    const builder = getBuilder()
    const result = builder.extractColumnFilters(parentCols.name, 'name', { like: '%Alice%' })
    expect(result).toBeDefined()
  })

  test('notLike operator', () => {
    const builder = getBuilder()
    const result = builder.extractColumnFilters(parentCols.name, 'name', { notLike: '%Bob%' })
    expect(result).toBeDefined()
  })

  test('ilike operator', () => {
    const builder = getBuilder()
    const result = builder.extractColumnFilters(parentCols.name, 'name', { ilike: '%alice%' })
    expect(result).toBeDefined()
  })

  test('notIlike operator', () => {
    const builder = getBuilder()
    const result = builder.extractColumnFilters(parentCols.name, 'name', { notIlike: '%bob%' })
    expect(result).toBeDefined()
  })

  test('inArray operator', () => {
    const builder = getBuilder()
    const result = builder.extractColumnFilters(parentCols.name, 'name', {
      inArray: ['Alice', 'Bob'],
    })
    expect(result).toBeDefined()
  })

  test('notInArray operator', () => {
    const builder = getBuilder()
    const result = builder.extractColumnFilters(parentCols.name, 'name', {
      notInArray: ['Eve'],
    })
    expect(result).toBeDefined()
  })

  test('inArray with empty array throws', () => {
    const builder = getBuilder()
    expect(() => builder.extractColumnFilters(parentCols.name, 'name', { inArray: [] })).toThrow(
      'empty array',
    )
  })

  test('isNull operator', () => {
    const builder = getBuilder()
    const result = builder.extractColumnFilters(parentCols.age, 'age', { isNull: true })
    expect(result).toBeDefined()
  })

  test('isNotNull operator', () => {
    const builder = getBuilder()
    const result = builder.extractColumnFilters(parentCols.age, 'age', { isNotNull: true })
    expect(result).toBeDefined()
  })

  test('null/false operator values are skipped', () => {
    const builder = getBuilder()
    const result = builder.extractColumnFilters(parentCols.name, 'name', {
      eq: null,
      ne: false,
    })
    expect(result).toBeUndefined()
  })

  test('multiple operators combine with AND', () => {
    const builder = getBuilder()
    const result = builder.extractColumnFilters(parentCols.age, 'age', { gt: 18, lt: 65 })
    expect(result).toBeDefined()
  })

  test('OR with variants', () => {
    const builder = getBuilder()
    const result = builder.extractColumnFilters(parentCols.name, 'name', {
      OR: [{ eq: 'Alice' }, { eq: 'Bob' }],
    })
    expect(result).toBeDefined()
  })

  test('OR with other fields ANDs them', () => {
    const builder = getBuilder()
    const result = builder.extractColumnFilters(parentCols.name, 'name', {
      eq: 'Alice',
      OR: [{ eq: 'Bob' }, { eq: 'Charlie' }],
    })
    expect(result).toBeDefined()
  })
})

// ─── extractOrderBy ─────────────────────────────────────────

describe('extractOrderBy', () => {
  function getBuilder() {
    const mockDb = createMockDb()
    const findStub = { findMany: () => Promise.resolve([]), findFirst: () => Promise.resolve(null) }
    // biome-ignore lint/suspicious/noExplicitAny: mock db for testing
    ;(mockDb as any).query = { parent: findStub, child: findStub }
    // biome-ignore lint/suspicious/noExplicitAny: accessing private method for testing
    return new SchemaBuilder(mockDb as any) as any
  }

  test('asc direction', () => {
    const builder = getBuilder()
    const result = builder.extractOrderBy(parent, { name: { direction: 'asc', priority: 1 } })
    expect(result).toHaveLength(1)
  })

  test('desc direction', () => {
    const builder = getBuilder()
    const result = builder.extractOrderBy(parent, { name: { direction: 'desc', priority: 1 } })
    expect(result).toHaveLength(1)
  })

  test('priority sorting (higher priority first)', () => {
    const builder = getBuilder()
    const result = builder.extractOrderBy(parent, {
      id: { direction: 'asc', priority: 1 },
      name: { direction: 'desc', priority: 10 },
    })
    expect(result).toHaveLength(2)
  })

  test('null config values skipped', () => {
    const builder = getBuilder()
    const result = builder.extractOrderBy(parent, {
      name: null,
      id: { direction: 'asc', priority: 1 },
    })
    expect(result).toHaveLength(1)
  })

  test('unknown column names skipped', () => {
    const builder = getBuilder()
    const result = builder.extractOrderBy(parent, {
      nonexistent: { direction: 'asc', priority: 1 },
    })
    expect(result).toHaveLength(0)
  })
})

// ─── extractColumns ─────────────────────────────────────────

describe('extractColumns', () => {
  function getBuilder() {
    const mockDb = createMockDb()
    const findStub = { findMany: () => Promise.resolve([]), findFirst: () => Promise.resolve(null) }
    // biome-ignore lint/suspicious/noExplicitAny: mock db for testing
    ;(mockDb as any).query = { parent: findStub, child: findStub }
    // biome-ignore lint/suspicious/noExplicitAny: accessing private method for testing
    return new SchemaBuilder(mockDb as any) as any
  }

  test('selects matching table columns', () => {
    const builder = getBuilder()
    const tree = {
      id: { name: 'id', fieldsByTypeName: {} },
      name: { name: 'name', fieldsByTypeName: {} },
    }
    const result = builder.extractColumns(tree, parent)
    expect(result).toEqual({ id: true, name: true })
  })

  test('ignores non-column fields (relations)', () => {
    const builder = getBuilder()
    const tree = {
      id: { name: 'id', fieldsByTypeName: {} },
      children: { name: 'children', fieldsByTypeName: {} },
    }
    const result = builder.extractColumns(tree, parent)
    expect(result.id).toBe(true)
    expect(result.children).toBeUndefined()
  })

  test('falls back to first column when no columns match', () => {
    const builder = getBuilder()
    const tree = {
      children: { name: 'children', fieldsByTypeName: {} },
    }
    const result = builder.extractColumns(tree, parent)
    // Should have exactly one key (the first column)
    expect(Object.keys(result)).toHaveLength(1)
  })
})
