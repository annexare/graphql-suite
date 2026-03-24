import { describe, expect, test } from 'bun:test'
import type { Column } from 'drizzle-orm'
import { getTableColumns } from 'drizzle-orm'
import {
  bigint,
  boolean,
  doublePrecision,
  integer,
  json,
  pgEnum,
  pgTable,
  real,
  serial,
  smallint,
  smallserial,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import {
  GraphQLBoolean,
  GraphQLEnumType,
  GraphQLFloat,
  GraphQLInputObjectType,
  GraphQLInt,
  GraphQLList,
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLString,
} from 'graphql'

import { GraphQLJSON } from './scalars'
import { drizzleColumnToGraphQLType } from './type-builder'

// ─── Test Tables ─────────────────────────────────────────────

const statusEnum = pgEnum('status', ['active', 'inactive', 'pending'])

const allTypes = pgTable('all_types', {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  label: varchar({ length: 255 }),
  age: integer().notNull(),
  score: smallint(),
  counter: serial(),
  smallCounter: smallserial(),
  rating: real(),
  precise: doublePrecision(),
  active: boolean().notNull(),
  createdAt: timestamp().notNull(),
  metadata: json(),
  bigNum: bigint({ mode: 'bigint' }),
  status: statusEnum(),
  withDefault: text().notNull().default('hello'),
})

const cols = getTableColumns(allTypes)

// ─── Core type mapping ───────────────────────────────────────

describe('core type mapping', () => {
  test('boolean maps to GraphQLBoolean', () => {
    const { type } = drizzleColumnToGraphQLType(cols.active, 'active', 'all_types', true)
    expect(type).toBe(GraphQLBoolean)
  })

  test('text maps to GraphQLString', () => {
    const { type } = drizzleColumnToGraphQLType(cols.label, 'label', 'all_types', true)
    expect(type).toBe(GraphQLString)
  })

  test('date maps to GraphQLString', () => {
    const { type, description } = drizzleColumnToGraphQLType(
      cols.createdAt,
      'createdAt',
      'all_types',
      true,
    )
    expect(type).toBe(GraphQLString)
    expect(description).toBe('Date')
  })

  test('bigint maps to GraphQLString', () => {
    const { type, description } = drizzleColumnToGraphQLType(
      cols.bigNum,
      'bigNum',
      'all_types',
      true,
    )
    expect(type).toBe(GraphQLString)
    expect(description).toBe('BigInt')
  })

  test('json maps to GraphQLJSON', () => {
    const { type, description } = drizzleColumnToGraphQLType(
      cols.metadata,
      'metadata',
      'all_types',
      true,
    )
    expect(type).toBe(GraphQLJSON)
    expect(description).toBe('JSON')
  })
})

// ─── Integer vs Float ────────────────────────────────────────

describe('integer vs float', () => {
  test('PgInteger maps to GraphQLInt', () => {
    const { type } = drizzleColumnToGraphQLType(cols.age, 'age', 'all_types', true)
    expect(type).toBe(GraphQLInt)
  })

  test('PgSmallInt maps to GraphQLInt', () => {
    const { type } = drizzleColumnToGraphQLType(cols.score, 'score', 'all_types', true)
    expect(type).toBe(GraphQLInt)
  })

  test('PgSerial maps to GraphQLInt', () => {
    const { type } = drizzleColumnToGraphQLType(cols.counter, 'counter', 'all_types', true)
    expect(type).toBe(GraphQLInt)
  })

  test('PgSmallSerial maps to GraphQLInt', () => {
    const { type } = drizzleColumnToGraphQLType(
      cols.smallCounter,
      'smallCounter',
      'all_types',
      true,
    )
    expect(type).toBe(GraphQLInt)
  })

  test('PgReal maps to GraphQLFloat', () => {
    const { type } = drizzleColumnToGraphQLType(cols.rating, 'rating', 'all_types', true)
    expect(type).toBe(GraphQLFloat)
  })

  test('PgDoublePrecision maps to GraphQLFloat', () => {
    const { type } = drizzleColumnToGraphQLType(cols.precise, 'precise', 'all_types', true)
    expect(type).toBe(GraphQLFloat)
  })
})

// ─── Enums ───────────────────────────────────────────────────

describe('enums', () => {
  test('generates GraphQLEnumType', () => {
    const { type } = drizzleColumnToGraphQLType(cols.status, 'status', 'all_types', true)
    expect(type).toBeInstanceOf(GraphQLEnumType)
    const enumType = type as GraphQLEnumType
    expect(enumType.name).toBe('All_typesStatusEnum')
    const values = enumType.getValues()
    expect(values.map((v) => v.value)).toEqual(['active', 'inactive', 'pending'])
  })

  test('caches enum across calls', () => {
    const { type: t1 } = drizzleColumnToGraphQLType(cols.status, 'status', 'all_types', true)
    const { type: t2 } = drizzleColumnToGraphQLType(cols.status, 'status', 'all_types', true)
    expect(t1).toBe(t2)
  })
})

// ─── Nullability ─────────────────────────────────────────────

describe('nullability', () => {
  test('notNull column wraps in GraphQLNonNull', () => {
    const { type } = drizzleColumnToGraphQLType(cols.name, 'name', 'all_types')
    expect(type).toBeInstanceOf(GraphQLNonNull)
  })

  test('nullable column returns bare type', () => {
    const { type } = drizzleColumnToGraphQLType(cols.label, 'label', 'all_types')
    expect(type).toBe(GraphQLString)
  })

  test('forceNullable overrides notNull', () => {
    const { type } = drizzleColumnToGraphQLType(cols.name, 'name', 'all_types', true)
    expect(type).toBe(GraphQLString)
  })

  test('defaultIsNullable makes columns with default nullable', () => {
    const { type } = drizzleColumnToGraphQLType(
      cols.withDefault,
      'withDefault',
      'all_types',
      false,
      true,
    )
    expect(type).toBe(GraphQLString)
  })

  test('defaultIsNullable does not affect columns without default', () => {
    const { type } = drizzleColumnToGraphQLType(cols.name, 'name', 'all_types', false, true)
    expect(type).toBeInstanceOf(GraphQLNonNull)
  })
})

// ─── Buffer ──────────────────────────────────────────────────

describe('buffer', () => {
  test('maps to List(NonNull(Int))', () => {
    const fakeCol = { dataType: 'buffer', notNull: false } as Column
    const { type } = drizzleColumnToGraphQLType(fakeCol, 'data', 'buf_test', true)
    expect(type).toBeInstanceOf(GraphQLList)
  })
})

// ─── Spatial & Array types ───────────────────────────────────

describe('PgGeometryObject', () => {
  test('output returns GraphQLObjectType named PgGeometryObject', () => {
    const fakeCol = { dataType: 'json', columnType: 'PgGeometryObject', notNull: false } as Column
    const { type, description } = drizzleColumnToGraphQLType(fakeCol, 'geo', 'geo_test', true)
    expect(type).toBeInstanceOf(GraphQLObjectType)
    expect((type as GraphQLObjectType).name).toBe('PgGeometryObject')
    expect(description).toBe('Geometry points XY')
  })

  test('input returns GraphQLInputObjectType named PgGeometryObjectInput', () => {
    const fakeCol = { dataType: 'json', columnType: 'PgGeometryObject', notNull: false } as Column
    const { type } = drizzleColumnToGraphQLType(fakeCol, 'geo', 'geo_test', true, false, true)
    expect(type).toBeInstanceOf(GraphQLInputObjectType)
    expect((type as GraphQLInputObjectType).name).toBe('PgGeometryObjectInput')
  })
})

describe('PgVector', () => {
  test('maps to List(NonNull(Float))', () => {
    const fakeCol = { dataType: 'array', columnType: 'PgVector', notNull: false } as Column
    const { type, description } = drizzleColumnToGraphQLType(fakeCol, 'vec', 'vec_test', true)
    expect(type).toBeInstanceOf(GraphQLList)
    const inner = (type as GraphQLList<typeof GraphQLFloat>).ofType
    expect(inner).toBeInstanceOf(GraphQLNonNull)
    expect(description).toBe('Array<Float>')
  })
})

describe('PgGeometry array', () => {
  test('maps to List(NonNull(Float))', () => {
    const fakeCol = { dataType: 'array', columnType: 'PgGeometry', notNull: false } as Column
    const { type, description } = drizzleColumnToGraphQLType(fakeCol, 'geo', 'geo_test', true)
    expect(type).toBeInstanceOf(GraphQLList)
    expect(description).toBe('Tuple<[Float, Float]>')
  })
})

describe('generic PgArray', () => {
  test('maps to List(NonNull(innerType))', () => {
    const fakeCol = {
      dataType: 'array',
      columnType: 'PgArray',
      notNull: false,
      baseColumn: { dataType: 'string', notNull: false },
    } as unknown as Column
    const { type, description } = drizzleColumnToGraphQLType(fakeCol, 'tags', 'arr_test', true)
    expect(type).toBeInstanceOf(GraphQLList)
    expect(description).toBe('Array<String>')
  })
})

// ─── Unknown type ────────────────────────────────────────────

describe('unknown type', () => {
  test('throws for unimplemented dataType', () => {
    const fakeCol = { dataType: 'xml', notNull: false } as unknown as import('drizzle-orm').Column
    expect(() => drizzleColumnToGraphQLType(fakeCol, 'x', 'tbl')).toThrow('GraphQL-Suite Error')
  })
})
