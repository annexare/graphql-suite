import { describe, expect, test } from 'bun:test'
import {
  type Column,
  createTableRelationsHelpers,
  extractTablesRelationalConfig,
  getTableColumns,
  type Relation,
  relations,
  type SQL,
  type Table,
} from 'drizzle-orm'
import {
  integer,
  type PgColumn,
  type PgDatabase,
  type PgQueryResultHKT,
  pgSchema,
  pgTable,
  text,
  uuid,
} from 'drizzle-orm/pg-core'
import { GraphQLObjectType, getNamedType } from 'graphql'

import { SchemaBuilder } from './schema-builder'

// ─── Testable Subclass ──────────────────────────────────────
// Exposes protected methods for direct unit testing with full type safety.

class TestableSchemaBuilder extends SchemaBuilder {
  /** Column-level filter extraction */
  extractColumnFilters(
    column: Column,
    columnName: string,
    operators: Record<string, unknown>,
  ): SQL | undefined {
    return super.extractColumnFilters(column, columnName, operators)
  }

  /** Table-level filter extraction (columns + relations + OR) */
  extractTableColumnFilters(
    table: Table,
    tableName: string,
    filters: Record<string, unknown>,
  ): SQL | undefined {
    return super.extractTableColumnFilters(table, tableName, filters)
  }

  /** Relation filter extraction (some/every/none quantifiers) */
  extractRelationFilters(
    table: Table,
    tableName: string,
    relationName: string,
    filterValue: Record<string, unknown>,
  ): SQL | undefined {
    return super.extractRelationFilters(table, tableName, relationName, filterValue)
  }

  /** Order-by extraction */
  extractOrderBy(table: Table, orderArgs: Record<string, unknown>): SQL[] {
    return super.extractOrderBy(table, orderArgs)
  }

  /** Column selection from resolve tree — only `name` is read by the implementation */
  extractColumns(tree: Record<string, { name: string }>, table: Table): Record<string, true> {
    return super.extractColumns(tree as unknown as Record<string, never>, table)
  }

  /** Join condition building */
  buildJoinCondition(parentTable: Table, targetTable: Table, relation: Relation): SQL | undefined {
    return super.buildJoinCondition(parentTable, targetTable, relation)
  }

  /** Access to internal tables map */
  get _tables() {
    return this.tables
  }

  /** Access to internal relation map */
  get _relationMap() {
    return this.relationMap
  }
}

// ─── SQL Structure Helper ───────────────────────────────────
// Renders a Drizzle SQL object into a human-readable structure string
// for asserting the shape of generated SQL (and/or/eq/exists/not).
function describeSQL(s: { queryChunks: unknown[] }): string {
  const parts: string[] = []
  for (const chunk of s.queryChunks) {
    const c = chunk as { value?: unknown[]; queryChunks?: unknown[] } | undefined
    if (c?.value && Array.isArray(c.value)) {
      const val = c.value.join('')
      if (val.trim()) parts.push(val.trim())
    } else if (c?.queryChunks) {
      parts.push(`(${describeSQL(c as { queryChunks: unknown[] })})`)
    } else {
      parts.push('[param]')
    }
  }
  return parts.join(' ')
}

/** Check if the SQL structure contains the given keyword (and, or, exists, not exists) */
function sqlContains(result: SQL | undefined, keyword: string): boolean {
  if (!result) return false
  return describeSQL(result).includes(keyword)
}

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

/** Matches SchemaBuilder constructor's parameter type exactly */
type MockDb = PgDatabase<PgQueryResultHKT, Record<string, unknown>>

const queryFindStub = {
  findMany: () => Promise.resolve([]),
  findFirst: () => Promise.resolve(null),
}

function createMockDb(
  schema: Record<string, unknown> = testSchema,
  queryStubs?: Record<string, typeof queryFindStub>,
): MockDb {
  const { tables, tableNamesMap } = extractTablesRelationalConfig(
    schema,
    createTableRelationsHelpers,
  )

  return {
    _: { fullSchema: schema, schema: tables, tableNamesMap },
    query: queryStubs ?? {},
    select: () => ({ from: () => ({ where: () => ({}) }) }),
  } as unknown as MockDb
}

// ─── Test Schema (self-referencing) ─────────────────────────

const node = pgTable('node', {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  parentNodeId: uuid().references((): PgColumn => node.id),
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
    expect(() => new SchemaBuilder(mockDb)).not.toThrow()
  })

  test('buildEntities generates queries and mutations', () => {
    const mockDb = createMockDb(testSchema, {
      parent: queryFindStub,
      child: queryFindStub,
    })
    const builder = new SchemaBuilder(mockDb)
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
    const builder = new TestableSchemaBuilder(mockDb)

    const relations = builder._relationMap.child
    const { relation } = relations.parent
    const parentTable = builder._tables.parent
    const childTable = builder._tables.child

    const result: SQL | undefined = builder.buildJoinCondition(childTable, parentTable, relation)
    expect(result).toBeDefined()
    expect(result).not.toBeNull()
  })

  test('Many relation (parent.children) returns SQL join condition', () => {
    const mockDb = createMockDb()
    const builder = new TestableSchemaBuilder(mockDb)

    const relations = builder._relationMap.parent
    const { relation } = relations.children
    const parentTable = builder._tables.parent
    const childTable = builder._tables.child

    const result: SQL | undefined = builder.buildJoinCondition(parentTable, childTable, relation)
    expect(result).toBeDefined()
    expect(result).not.toBeNull()
  })

  test('broken relation returns undefined', () => {
    const mockDb = createMockDb()
    const builder = new TestableSchemaBuilder(mockDb)

    // Construct a fake relation object that normalizeRelation cannot resolve
    const fakeRelation = { referencedTable: parent, fieldName: 'fake' } as unknown as Relation

    const result: SQL | undefined = builder.buildJoinCondition(parent, child, fakeRelation)
    expect(result).toBeUndefined()
  })
})

describe('buildJoinCondition (schema-qualified tables)', () => {
  test('One relation uses unqualified table name for parent column', () => {
    const mockDb = createMockDb(schemaQualifiedSchema)
    const builder = new TestableSchemaBuilder(mockDb)

    const relations = builder._relationMap.schemaChild
    const { relation } = relations.parent
    const parentTable = builder._tables.schemaParent
    const childTable = builder._tables.schemaChild

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
    const builder = new TestableSchemaBuilder(mockDb)

    const relations = builder._relationMap.schemaParent
    const { relation } = relations.children
    const parentTable = builder._tables.schemaParent
    const childTable = builder._tables.schemaChild

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
    expect(() => new SchemaBuilder(mockDb)).not.toThrow()
  })
})

// ─── Table Configuration ────────────────────────────────────

describe('table exclusion', () => {
  test('excluded tables are removed from the schema', () => {
    const mockDb = createMockDb(testSchema, { parent: queryFindStub })
    const builder = new SchemaBuilder(mockDb, {
      tables: { exclude: ['child'] },
    })
    const entities = builder.buildEntities()

    expect(entities.queries.parent).toBeDefined()
    expect(entities.queries.child).toBeUndefined()
    expect(entities.queries.childSingle).toBeUndefined()
    expect(entities.queries.childCount).toBeUndefined()
  })

  test('relations to excluded tables are silently skipped', () => {
    const mockDb = createMockDb(testSchema, { parent: queryFindStub })
    const builder = new SchemaBuilder(mockDb, {
      tables: { exclude: ['child'] },
    })
    const result = builder.build()
    const typeMap = result.schema.getTypeMap()

    // Parent type should exist but without children relation
    const parentType = typeMap.ParentSelectItem
    expect(parentType).toBeDefined()
    if (parentType instanceof GraphQLObjectType) {
      const fields = parentType.getFields()
      expect(fields.id).toBeDefined()
      expect(fields.name).toBeDefined()
      expect(fields.children).toBeUndefined()
    }
  })
})

describe('per-table operation control', () => {
  test('queries: false suppresses query generation', () => {
    const mockDb = createMockDb(testSchema, { parent: queryFindStub, child: queryFindStub })
    const builder = new SchemaBuilder(mockDb, {
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
    const mockDb = createMockDb(testSchema, { parent: queryFindStub, child: queryFindStub })
    const builder = new SchemaBuilder(mockDb, {
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
    const mockDb = createMockDb(testSchema, { parent: queryFindStub })
    const builder = new SchemaBuilder(mockDb, {
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
    if (parentType instanceof GraphQLObjectType) {
      const fields = parentType.getFields()
      expect(fields.children).toBeDefined()
    }
  })
})

describe('self-relation depth limiting', () => {
  const selfRefStubs = { node: queryFindStub, tag: queryFindStub }

  test('self-referencing schema builds without error', () => {
    const mockDb = createMockDb(selfRefSchema)
    expect(() => new SchemaBuilder(mockDb, { limitRelationDepth: 5 })).not.toThrow()
  })

  test('limitSelfRelationDepth: 1 omits self-relation fields entirely', () => {
    const mockDb = createMockDb(selfRefSchema, selfRefStubs)
    const builder = new SchemaBuilder(mockDb, {
      limitRelationDepth: 5,
      limitSelfRelationDepth: 1,
    })
    const result = builder.build()
    const typeMap = result.schema.getTypeMap()

    const nodeType = typeMap.NodeSelectItem
    expect(nodeType).toBeDefined()
    if (nodeType instanceof GraphQLObjectType) {
      const nodeFields = nodeType.getFields()
      // Self-relation fields should be omitted
      expect(nodeFields.parentNode).toBeUndefined()
      expect(nodeFields.childNodes).toBeUndefined()
      // Non-self relations should still be present
      expect(nodeFields.tags).toBeDefined()
    }
  })

  test('limitSelfRelationDepth: 2 expands one level of self-relations', () => {
    const mockDb = createMockDb(selfRefSchema, selfRefStubs)
    const builder = new SchemaBuilder(mockDb, {
      limitRelationDepth: 5,
      limitSelfRelationDepth: 2,
    })
    const result = builder.build()
    const typeMap = result.schema.getTypeMap()

    const nodeType = typeMap.NodeSelectItem
    expect(nodeType).toBeDefined()
    if (nodeType instanceof GraphQLObjectType) {
      const nodeFields = nodeType.getFields()
      // Self-relation fields should exist at first level
      expect(nodeFields.parentNode).toBeDefined()
      expect(nodeFields.childNodes).toBeDefined()
      // Non-self relations should still be present
      expect(nodeFields.tags).toBeDefined()

      // Navigate into parentNode's type — self-relations should be omitted at this level
      const parentNodeType = getNamedType(nodeFields.parentNode.type)
      if (parentNodeType instanceof GraphQLObjectType) {
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
    const mockDb = createMockDb(selfRefSchema, selfRefStubs)
    const builder = new SchemaBuilder(mockDb, {
      limitRelationDepth: 5,
      limitSelfRelationDepth: 2,
    })
    const result = builder.build()
    const typeMap = result.schema.getTypeMap()

    // Path: node → tags → node (cross-table hop resets self-depth)
    const nodeType = typeMap.NodeSelectItem
    expect(nodeType).toBeDefined()
    if (nodeType instanceof GraphQLObjectType) {
      const nodeFields = nodeType.getFields()
      expect(nodeFields.tags).toBeDefined()

      // Navigate: node → tags
      const tagsType = getNamedType(nodeFields.tags.type)
      if (tagsType instanceof GraphQLObjectType) {
        const tagFields = tagsType.getFields()
        expect(tagFields.node).toBeDefined()

        // Navigate: tags → node (cross-table: self-depth resets to 0)
        const innerNodeType = getNamedType(tagFields.node.type)
        if (innerNodeType instanceof GraphQLObjectType) {
          const innerNodeFields = innerNodeType.getFields()
          // Self-relations should be present (fresh self-depth budget)
          expect(innerNodeFields.parentNode).toBeDefined()
          expect(innerNodeFields.childNodes).toBeDefined()
        }
      }
    }
  })

  test('type count stays reasonable with limitSelfRelationDepth: 2', () => {
    const mockDb = createMockDb(selfRefSchema, selfRefStubs)
    const builder = new SchemaBuilder(mockDb, {
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
    expect(() => new SchemaBuilder(mockDb, { limitSelfRelationDepth: 0 })).toThrow()
    expect(() => new SchemaBuilder(mockDb, { limitSelfRelationDepth: -1 })).toThrow()
    expect(() => new SchemaBuilder(mockDb, { limitSelfRelationDepth: 1.5 })).toThrow()
  })
})

// ─── Prune Relations ─────────────────────────────────────────

describe('pruneRelations', () => {
  function buildWithPrune(pruneRelations: Record<string, false | 'leaf' | { only: string[] }>) {
    const mockDb = createMockDb(selfRefSchema, { node: queryFindStub, tag: queryFindStub })
    const builder = new SchemaBuilder(mockDb, {
      limitRelationDepth: 5,
      limitSelfRelationDepth: 2,
      pruneRelations,
    })
    return builder.build()
  }

  function getFields(
    typeMap: ReturnType<import('graphql').GraphQLSchema['getTypeMap']>,
    typeName: string,
  ) {
    const type = typeMap[typeName]
    if (type instanceof GraphQLObjectType) return type.getFields()
    return {} as ReturnType<GraphQLObjectType['getFields']>
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
    const tagsNamedType = getNamedType(nodeFields.tags.type)
    if (tagsNamedType instanceof GraphQLObjectType) {
      const tagFields = tagsNamedType.getFields()
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
    const nodeNamedType = getNamedType(tagFields.node.type)
    if (nodeNamedType instanceof GraphQLObjectType) {
      const innerNodeFields = nodeNamedType.getFields()
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
    const tagNodeType = getNamedType(tagFields.node.type)
    if (tagNodeType instanceof GraphQLObjectType) {
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
    const badDb = { _: { fullSchema: undefined } } as unknown as MockDb
    expect(() => new SchemaBuilder(badDb)).toThrow('Schema not found')
  })

  test('negative limitRelationDepth throws', () => {
    const mockDb = createMockDb()
    expect(() => new SchemaBuilder(mockDb, { limitRelationDepth: -1 })).toThrow(
      'nonnegative integer',
    )
  })

  test('float limitRelationDepth throws', () => {
    const mockDb = createMockDb()
    expect(() => new SchemaBuilder(mockDb, { limitRelationDepth: 2.5 })).toThrow(
      'nonnegative integer',
    )
  })

  test('same list/single suffixes throws', () => {
    const mockDb = createMockDb()
    expect(() => new SchemaBuilder(mockDb, { suffixes: { list: 'X', single: 'X' } })).toThrow(
      'cannot be the same',
    )
  })
})

// ─── mutations: false ───────────────────────────────────────

describe('mutations: false config', () => {
  test('build() with mutations: false returns schema with no mutation type', () => {
    const mockDb = createMockDb(testSchema, { parent: queryFindStub, child: queryFindStub })
    const builder = new SchemaBuilder(mockDb, { mutations: false })
    const result = builder.build()

    expect(result.schema.getMutationType()).toBeUndefined()
  })
})

// ─── logDebugInfo ───────────────────────────────────────────

describe('logDebugInfo', () => {
  test('debug: true does not throw', () => {
    const mockDb = createMockDb(testSchema, { parent: queryFindStub, child: queryFindStub })
    const builder = new SchemaBuilder(mockDb, { debug: true })
    expect(() => builder.build()).not.toThrow()
  })

  test('debug: { relationTree: true } does not throw', () => {
    const mockDb = createMockDb(testSchema, { parent: queryFindStub, child: queryFindStub })
    const builder = new SchemaBuilder(mockDb, { debug: { relationTree: true } })
    expect(() => builder.build()).not.toThrow()
  })
})

// ─── extractColumnFilters ───────────────────────────────────

describe('extractColumnFilters', () => {
  function getBuilder() {
    const mockDb = createMockDb(testSchema, {
      parent: queryFindStub,
      child: queryFindStub,
    })
    return new TestableSchemaBuilder(mockDb)
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

  test('OR with variants produces or()', () => {
    const builder = getBuilder()
    const result = builder.extractColumnFilters(parentCols.name, 'name', {
      OR: [{ eq: 'Alice' }, { eq: 'Bob' }],
    })
    expect(result).toBeDefined()
    expect(sqlContains(result, 'or')).toBe(true)
  })

  test('OR with other fields produces and(field, or(...))', () => {
    const builder = getBuilder()
    const result = builder.extractColumnFilters(parentCols.name, 'name', {
      eq: 'Alice',
      OR: [{ eq: 'Bob' }, { eq: 'Charlie' }],
    })
    expect(result).toBeDefined()
    expect(sqlContains(result, 'and')).toBe(true)
    expect(sqlContains(result, 'or')).toBe(true)
  })

  test('empty OR array returns undefined', () => {
    const builder = getBuilder()
    const result = builder.extractColumnFilters(parentCols.name, 'name', {
      OR: [],
    })
    expect(result).toBeUndefined()
  })

  test('single OR variant returns eq() directly (no or() wrapper)', () => {
    const builder = getBuilder()
    const result = builder.extractColumnFilters(parentCols.name, 'name', {
      OR: [{ eq: 'Alice' }],
    })
    expect(result).toBeDefined()
    // Single variant → unwrapped, no or()
    expect(sqlContains(result, 'or')).toBe(false)
    expect(sqlContains(result, '=')).toBe(true)
  })

  test('empty OR with other fields ignores OR, returns field filter', () => {
    const builder = getBuilder()
    const result = builder.extractColumnFilters(parentCols.name, 'name', {
      eq: 'Alice',
      OR: [],
    })
    expect(result).toBeDefined()
    expect(sqlContains(result, 'or')).toBe(false)
    expect(sqlContains(result, '=')).toBe(true)
  })

  test('OR variants all undefined returns undefined', () => {
    const builder = getBuilder()
    // All variants have null/false values which are skipped → each returns undefined
    const result = builder.extractColumnFilters(parentCols.name, 'name', {
      OR: [{ eq: null }, { ne: false }],
    })
    expect(result).toBeUndefined()
  })

  test('OR + fields where fieldClause is undefined returns orClause only', () => {
    const builder = getBuilder()
    // eq: null is skipped → fieldClause undefined, but OR has valid variants
    const result = builder.extractColumnFilters(parentCols.name, 'name', {
      eq: null,
      OR: [{ eq: 'Alice' }, { eq: 'Bob' }],
    })
    expect(result).toBeDefined()
    expect(sqlContains(result, 'or')).toBe(true)
    // No and() since fieldClause is undefined
    expect(sqlContains(result, 'and')).toBe(false)
  })

  test('OR + fields where orClause is undefined returns fieldClause only', () => {
    const builder = getBuilder()
    // OR variants all null → orClause undefined, but eq field is valid
    const result = builder.extractColumnFilters(parentCols.name, 'name', {
      eq: 'Alice',
      OR: [{ eq: null }, { ne: false }],
    })
    expect(result).toBeDefined()
    expect(sqlContains(result, '=')).toBe(true)
    // No or() or and() since orClause is undefined
    expect(sqlContains(result, 'or')).toBe(false)
    expect(sqlContains(result, 'and')).toBe(false)
  })
})

// ─── extractOrderBy ─────────────────────────────────────────

// ─── extractTableColumnFilters ──────────────────────────────

describe('extractTableColumnFilters', () => {
  function getBuilder() {
    const mockDb = createMockDb(testSchema, {
      parent: queryFindStub,
      child: queryFindStub,
    })
    return new TestableSchemaBuilder(mockDb)
  }

  test('column filter only produces eq()', () => {
    const builder = getBuilder()
    const result = builder.extractTableColumnFilters(parent, 'parent', {
      name: { eq: 'Alice' },
    })
    expect(result).toBeDefined()
    expect(sqlContains(result, '=')).toBe(true)
  })

  test('multiple column filters produce and()', () => {
    const builder = getBuilder()
    const result = builder.extractTableColumnFilters(child, 'child', {
      label: { eq: 'test' },
      parentId: { isNotNull: true },
    })
    expect(result).toBeDefined()
    expect(sqlContains(result, 'and')).toBe(true)
  })

  test('OR only at table level produces or()', () => {
    const builder = getBuilder()
    const result = builder.extractTableColumnFilters(parent, 'parent', {
      OR: [{ name: { eq: 'Alice' } }, { name: { eq: 'Bob' } }],
    })
    expect(result).toBeDefined()
    expect(sqlContains(result, 'or')).toBe(true)
  })

  test('OR with column filters produces and(field, or(...))', () => {
    const builder = getBuilder()
    const result = builder.extractTableColumnFilters(parent, 'parent', {
      name: { like: '%test%' },
      OR: [{ name: { eq: 'Alice' } }, { name: { eq: 'Bob' } }],
    })
    expect(result).toBeDefined()
    expect(sqlContains(result, 'and')).toBe(true)
    expect(sqlContains(result, 'or')).toBe(true)
  })

  test('empty OR array at table level returns undefined when no other filters', () => {
    const builder = getBuilder()
    const result = builder.extractTableColumnFilters(parent, 'parent', {
      OR: [],
    })
    expect(result).toBeUndefined()
  })

  test('empty OR with column filters ignores OR', () => {
    const builder = getBuilder()
    const result = builder.extractTableColumnFilters(parent, 'parent', {
      name: { eq: 'Alice' },
      OR: [],
    })
    expect(result).toBeDefined()
    expect(sqlContains(result, 'or')).toBe(false)
  })

  test('null filter values are skipped', () => {
    const builder = getBuilder()
    const result = builder.extractTableColumnFilters(parent, 'parent', {
      name: null,
    })
    expect(result).toBeUndefined()
  })

  test('relation filter on one-to-many produces exists()', () => {
    const builder = getBuilder()
    const result = builder.extractTableColumnFilters(parent, 'parent', {
      children: { some: { label: { eq: 'test' } } },
    })
    expect(result).toBeDefined()
    expect(sqlContains(result, 'exists')).toBe(true)
  })

  test('relation filter on many-to-one produces exists()', () => {
    const builder = getBuilder()
    const result = builder.extractTableColumnFilters(child, 'child', {
      parent: { name: { eq: 'Alice' } },
    })
    expect(result).toBeDefined()
    expect(sqlContains(result, 'exists')).toBe(true)
  })

  test('column + relation filters produce and(eq, exists)', () => {
    const builder = getBuilder()
    const result = builder.extractTableColumnFilters(child, 'child', {
      label: { like: '%test%' },
      parent: { name: { eq: 'Alice' } },
    })
    expect(result).toBeDefined()
    expect(sqlContains(result, 'and')).toBe(true)
    expect(sqlContains(result, 'exists')).toBe(true)
  })

  test('OR with relation filters produces and(exists, or(...))', () => {
    const builder = getBuilder()
    const result = builder.extractTableColumnFilters(parent, 'parent', {
      children: { some: { label: { eq: 'active' } } },
      OR: [{ name: { eq: 'Alice' } }, { name: { eq: 'Bob' } }],
    })
    expect(result).toBeDefined()
    expect(sqlContains(result, 'and')).toBe(true)
    expect(sqlContains(result, 'or')).toBe(true)
    expect(sqlContains(result, 'exists')).toBe(true)
  })

  test('OR with column + relation filters produces and(and(col, exists), or(...))', () => {
    const builder = getBuilder()
    const result = builder.extractTableColumnFilters(child, 'child', {
      label: { eq: 'primary' },
      parent: { name: { like: '%admin%' } },
      OR: [{ label: { eq: 'fallback1' } }, { label: { eq: 'fallback2' } }],
    })
    expect(result).toBeDefined()
    expect(sqlContains(result, 'and')).toBe(true)
    expect(sqlContains(result, 'or')).toBe(true)
    expect(sqlContains(result, 'exists')).toBe(true)
  })

  test('OR variant containing relation filter produces or() with exists()', () => {
    const builder = getBuilder()
    const result = builder.extractTableColumnFilters(parent, 'parent', {
      OR: [{ children: { some: { label: { eq: 'active' } } } }, { name: { eq: 'fallback' } }],
    })
    expect(result).toBeDefined()
    expect(sqlContains(result, 'or')).toBe(true)
    expect(sqlContains(result, 'exists')).toBe(true)
  })

  test('single OR variant at table level (no or() wrapper)', () => {
    const builder = getBuilder()
    const result = builder.extractTableColumnFilters(parent, 'parent', {
      OR: [{ name: { eq: 'Alice' } }],
    })
    expect(result).toBeDefined()
    expect(sqlContains(result, 'or')).toBe(false)
  })
})

// ─── extractRelationFilters ─────────────────────────────────

describe('extractRelationFilters', () => {
  function getBuilder() {
    const mockDb = createMockDb(testSchema, {
      parent: queryFindStub,
      child: queryFindStub,
    })
    return new TestableSchemaBuilder(mockDb)
  }

  test('many relation: some produces exists()', () => {
    const builder = getBuilder()
    const result = builder.extractRelationFilters(parent, 'parent', 'children', {
      some: { label: { eq: 'test' } },
    })
    expect(result).toBeDefined()
    expect(sqlContains(result, 'exists')).toBe(true)
    expect(sqlContains(result, 'not')).toBe(false)
  })

  test('many relation: every produces not(exists(... and not(...)))', () => {
    const builder = getBuilder()
    const result = builder.extractRelationFilters(parent, 'parent', 'children', {
      every: { label: { eq: 'test' } },
    })
    expect(result).toBeDefined()
    expect(sqlContains(result, 'not')).toBe(true)
    expect(sqlContains(result, 'exists')).toBe(true)
  })

  test('many relation: none produces not(exists())', () => {
    const builder = getBuilder()
    const result = builder.extractRelationFilters(parent, 'parent', 'children', {
      none: { label: { eq: 'test' } },
    })
    expect(result).toBeDefined()
    expect(sqlContains(result, 'not')).toBe(true)
    expect(sqlContains(result, 'exists')).toBe(true)
  })

  test('many relation: multiple quantifiers produce and()', () => {
    const builder = getBuilder()
    const result = builder.extractRelationFilters(parent, 'parent', 'children', {
      some: { label: { eq: 'active' } },
      none: { label: { eq: 'deleted' } },
    })
    expect(result).toBeDefined()
    expect(sqlContains(result, 'and')).toBe(true)
    expect(sqlContains(result, 'exists')).toBe(true)
  })

  test('one relation: direct filter produces exists() (no quantifier needed)', () => {
    const builder = getBuilder()
    const result = builder.extractRelationFilters(child, 'child', 'parent', {
      name: { eq: 'Alice' },
    })
    expect(result).toBeDefined()
    expect(sqlContains(result, 'exists')).toBe(true)
  })

  test('unknown relation returns undefined', () => {
    const builder = getBuilder()
    const result = builder.extractRelationFilters(parent, 'parent', 'nonexistent', {
      some: { label: { eq: 'test' } },
    })
    expect(result).toBeUndefined()
  })

  test('many relation: empty quantifier object returns undefined', () => {
    const builder = getBuilder()
    const result = builder.extractRelationFilters(parent, 'parent', 'children', {})
    expect(result).toBeUndefined()
  })

  test('many relation: every with empty filter returns undefined (trivially true)', () => {
    const builder = getBuilder()
    // every with no inner filter conditions → trivially true → undefined
    const result = builder.extractRelationFilters(parent, 'parent', 'children', {
      every: {},
    })
    expect(result).toBeUndefined()
  })
})

// ─── extractOrderBy ─────────────────────────────────────────

describe('extractOrderBy', () => {
  function getBuilder() {
    const mockDb = createMockDb(testSchema, {
      parent: queryFindStub,
      child: queryFindStub,
    })
    return new TestableSchemaBuilder(mockDb)
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
    const mockDb = createMockDb(testSchema, {
      parent: queryFindStub,
      child: queryFindStub,
    })
    return new TestableSchemaBuilder(mockDb)
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
