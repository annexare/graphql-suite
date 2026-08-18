import type { Column } from 'drizzle-orm'
import { is } from 'drizzle-orm'
import type { PgArray } from 'drizzle-orm/pg-core'
import {
  PgBigInt53,
  PgBigSerial53,
  PgInteger,
  PgSerial,
  PgSmallInt,
  PgSmallSerial,
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
  type GraphQLScalarType,
  GraphQLString,
} from 'graphql'

import { capitalize } from '../case-ops'
import { GraphQLJSON } from './scalars'

/**
 * The GraphQL types a Drizzle column maps to before nullability is applied.
 *
 * Kept free of `GraphQLNonNull` on purpose: graphql 17 narrowed
 * `GraphQLNonNull<T>` to `T extends GraphQLNullableType`, so a union that
 * already contains a non-null wrapper can no longer be wrapped again.
 */
export type ConvertedColumnType<TIsInput extends boolean = false> =
  | GraphQLScalarType
  | GraphQLEnumType
  | GraphQLList<GraphQLScalarType>
  | GraphQLList<GraphQLNonNull<GraphQLScalarType>>
  | (TIsInput extends true ? GraphQLInputObjectType : GraphQLObjectType)

export type ConvertedColumn<TIsInput extends boolean = false> = {
  type: ConvertedColumnType<TIsInput> | GraphQLNonNull<ConvertedColumnType<TIsInput>>
  description?: string
}

/** A column type that is guaranteed not to be wrapped in `GraphQLNonNull`. */
export type ConvertedNullableColumn<TIsInput extends boolean = false> = {
  type: ConvertedColumnType<TIsInput>
  description?: string
}

const allowedNameChars = /^[a-zA-Z0-9_]+$/

const enumMap = new WeakMap<object, GraphQLEnumType>()
const generateEnumCached = (
  column: Column,
  columnName: string,
  tableName: string,
): GraphQLEnumType => {
  const cached = enumMap.get(column)
  if (cached) return cached

  const gqlEnum = new GraphQLEnumType({
    name: `${capitalize(tableName)}${capitalize(columnName)}Enum`,
    values: Object.fromEntries(
      (column.enumValues ?? []).map((e, index) => {
        const enumName = e.replace(/-/g, '_')
        const finalName = allowedNameChars.test(enumName) ? enumName : `Option${index}`

        return [
          finalName,
          {
            value: e,
            description: `Value: ${e}`,
          },
        ]
      }),
    ),
  })

  enumMap.set(column, gqlEnum)
  return gqlEnum
}

const geoXyType = new GraphQLObjectType({
  name: 'PgGeometryObject',
  fields: {
    x: { type: GraphQLFloat },
    y: { type: GraphQLFloat },
  },
})

const geoXyInputType = new GraphQLInputObjectType({
  name: 'PgGeometryObjectInput',
  fields: {
    x: { type: GraphQLFloat },
    y: { type: GraphQLFloat },
  },
})

const columnToGraphQLCore = (
  column: Column,
  columnName: string,
  tableName: string,
  isInput: boolean,
): ConvertedNullableColumn<boolean> => {
  switch (column.dataType) {
    case 'boolean':
      return { type: GraphQLBoolean, description: 'Boolean' }
    case 'json':
      return column.columnType === 'PgGeometryObject'
        ? {
            type: isInput ? geoXyInputType : geoXyType,
            description: 'Geometry points XY',
          }
        : { type: GraphQLJSON, description: 'JSON' }
    case 'date':
      return { type: GraphQLString, description: 'Date' }
    case 'string':
      if (column.enumValues?.length) {
        return { type: generateEnumCached(column, columnName, tableName) }
      }
      return { type: GraphQLString, description: 'String' }
    case 'bigint':
      return { type: GraphQLString, description: 'BigInt' }
    case 'number':
      return is(column, PgInteger) ||
        is(column, PgSmallInt) ||
        is(column, PgBigInt53) ||
        is(column, PgSerial) ||
        is(column, PgSmallSerial) ||
        is(column, PgBigSerial53)
        ? { type: GraphQLInt, description: 'Integer' }
        : { type: GraphQLFloat, description: 'Float' }
    case 'buffer':
      return {
        type: new GraphQLList(new GraphQLNonNull(GraphQLInt)),
        description: 'Buffer',
      }
    case 'array': {
      if (column.columnType === 'PgVector') {
        return {
          type: new GraphQLList(new GraphQLNonNull(GraphQLFloat)),
          description: 'Array<Float>',
        }
      }

      if (column.columnType === 'PgGeometry') {
        return {
          type: new GraphQLList(new GraphQLNonNull(GraphQLFloat)),
          description: 'Tuple<[Float, Float]>',
        }
      }

      const innerType = columnToGraphQLCore(
        // biome-ignore lint/suspicious/noExplicitAny: Drizzle PgArray generic parameters
        (column as Column as PgArray<any, any>).baseColumn,
        columnName,
        tableName,
        isInput,
      )

      return {
        type: new GraphQLList(new GraphQLNonNull(innerType.type as GraphQLScalarType)),
        description: `Array<${innerType.description}>`,
      }
    }
    default:
      throw new Error(`GraphQL-Suite Error: Type ${column.dataType} is not implemented!`)
  }
}

export const drizzleColumnToGraphQLType = <TColumn extends Column, TIsInput extends boolean>(
  column: TColumn,
  columnName: string,
  tableName: string,
  forceNullable = false,
  defaultIsNullable = false,
  isInput: TIsInput = false as TIsInput,
): ConvertedColumn<TIsInput> => {
  const typeDesc = columnToGraphQLCore(column, columnName, tableName, isInput)
  const noDesc = ['string', 'boolean', 'number']
  if (noDesc.find((e) => e === column.dataType)) delete typeDesc.description

  if (forceNullable) return typeDesc as ConvertedColumn<TIsInput>
  if (column.notNull && !(defaultIsNullable && (column.hasDefault || column.defaultFn))) {
    return {
      type: new GraphQLNonNull(typeDesc.type),
      description: typeDesc.description,
    } as ConvertedColumn<TIsInput>
  }

  return typeDesc as ConvertedColumn<TIsInput>
}
