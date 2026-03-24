import type { Column, Relation, Table, TablesRelationalConfig } from 'drizzle-orm'
import {
  and,
  asc,
  count,
  createTableRelationsHelpers,
  desc,
  eq,
  exists,
  getTableColumns,
  getTableName,
  gt,
  gte,
  ilike,
  inArray,
  is,
  isNotNull,
  isNull,
  like,
  lt,
  lte,
  ne,
  normalizeRelation,
  not,
  notIlike,
  notInArray,
  notLike,
  One,
  or,
  Relations,
  type SQL,
  sql,
} from 'drizzle-orm'
import { type PgDatabase, PgTable } from 'drizzle-orm/pg-core'
import type { RelationalQueryBuilder } from 'drizzle-orm/pg-core/query-builders/query'
import type {
  GraphQLFieldConfig,
  GraphQLFieldConfigArgumentMap,
  GraphQLFieldConfigMap,
  GraphQLResolveInfo,
  GraphQLSchemaConfig,
} from 'graphql'
import {
  GraphQLBoolean,
  GraphQLEnumType,
  GraphQLError,
  GraphQLInputObjectType,
  GraphQLInt,
  GraphQLList,
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLSchema,
  GraphQLString,
  printSchema,
} from 'graphql'
import type { ResolveTree } from 'graphql-parse-resolve-info'
import { parseResolveInfo } from 'graphql-parse-resolve-info'

import { PgAdapter } from './adapters/pg'
import type { DbAdapter } from './adapters/types'
import { capitalize, uncapitalize } from './case-ops'
import {
  remapFromGraphQLArrayInput,
  remapFromGraphQLCore,
  remapFromGraphQLSingleInput,
  remapToGraphQLArrayOutput,
  remapToGraphQLSingleOutput,
  type TableNamedRelations,
} from './data-mappers'
import { type ConvertedColumn, drizzleColumnToGraphQLType } from './graphql/type-builder'
import { mergePermissionsIntoConfig, postFilterMutations } from './permissions'
import type {
  BeforeHookResult,
  BuildSchemaConfig,
  GeneratedEntities,
  HooksConfig,
  OperationType,
  PermissionConfig,
  RelationPruneRule,
  ResolveHookFn,
  TableHookConfig,
  TableOperations,
} from './types'

type ConvertedInputColumn = {
  type: GraphQLInputObjectType
  description?: string
}

type ConvertedRelationColumnWithArgs = {
  type:
    | GraphQLObjectType
    | GraphQLNonNull<GraphQLObjectType>
    | GraphQLNonNull<GraphQLList<GraphQLNonNull<GraphQLObjectType>>>
  // biome-ignore lint/suspicious/noExplicitAny: matches GraphQL's own GraphQLFieldConfig signature
  args?: GraphQLFieldConfig<any, any>['args']
}

type ProcessedTableSelectArgs = {
  columns: Record<string, true>
  offset?: number
  limit?: number
  where?: SQL
  orderBy?: SQL[]
  with?: Record<string, Partial<ProcessedTableSelectArgs>>
}

type TableSelectArgs = {
  offset: number
  limit: number
  // biome-ignore lint/suspicious/noExplicitAny: dynamic GraphQL filter input
  where: any
  // biome-ignore lint/suspicious/noExplicitAny: dynamic GraphQL order input
  orderBy: any
}

type SelectData<TWithOrder extends boolean> = {
  filters: GraphQLInputObjectType
  tableFields: Record<string, ConvertedColumn>
  relationFields: Record<string, ConvertedRelationColumnWithArgs>
  order: TWithOrder extends true ? GraphQLInputObjectType : undefined
}

export class SchemaBuilder {
  // biome-ignore lint/suspicious/noExplicitAny: Drizzle generic parameters
  protected db: PgDatabase<any, any, any>
  protected tables: Record<string, PgTable>
  protected relationMap: Record<string, Record<string, TableNamedRelations>>
  protected relationalSchema: TablesRelationalConfig
  protected tableNamesMap: Record<string, string>
  private config: BuildSchemaConfig
  private hooks: HooksConfig
  private adapter: DbAdapter
  private suffixes: { list: string; single: string }
  private limitRelationDepth: number | undefined
  private limitSelfRelationDepth: number
  private allTableNames: string[]
  private excludedTables: Set<string>
  private tableOperations: Record<string, TableOperations>
  private pruneRelations: Map<string, RelationPruneRule>

  // Cached GraphQL types
  private filterTypes = new Map<string, GraphQLInputObjectType>()
  private orderByTypes = new Map<string, GraphQLInputObjectType>()
  private filterValueTypes = new Map<string, Record<string, ConvertedInputColumn>>()
  private selectFieldTypes = new Map<string, Record<string, ConvertedColumn>>()

  // Shared singleton types
  private innerOrder: GraphQLInputObjectType

  // biome-ignore lint/suspicious/noExplicitAny: Drizzle generic parameters
  constructor(db: PgDatabase<any, any, any>, config?: BuildSchemaConfig) {
    this.db = db
    this.config = config ?? {}
    this.hooks = config?.hooks ?? {}
    this.adapter = new PgAdapter()
    this.suffixes = {
      list: config?.suffixes?.list ?? '',
      single: config?.suffixes?.single ?? 'Single',
    }
    this.limitRelationDepth = config?.limitRelationDepth ?? 3
    this.limitSelfRelationDepth = config?.limitSelfRelationDepth ?? 1
    this.pruneRelations = new Map(Object.entries(config?.pruneRelations ?? {}))

    const schema = db._.fullSchema
    if (!schema) {
      throw new Error(
        'GraphQL-Suite Error: Schema not found in drizzle instance. Make sure schema is passed to the drizzle() constructor.',
      )
    }

    // biome-ignore lint/suspicious/noExplicitAny: Drizzle db internal config access
    const dbConfig = (db as any)._
    this.relationalSchema = dbConfig.schema
    this.tableNamesMap = dbConfig.tableNamesMap

    if (typeof this.limitRelationDepth === 'number') {
      if (this.limitRelationDepth < 0 || this.limitRelationDepth !== ~~this.limitRelationDepth) {
        throw new Error(
          'GraphQL-Suite Error: config.limitRelationDepth is supposed to be nonnegative integer or undefined!',
        )
      }
    }

    if (
      this.limitSelfRelationDepth < 1 ||
      this.limitSelfRelationDepth !== ~~this.limitSelfRelationDepth
    ) {
      throw new Error(
        'GraphQL-Suite Error: config.limitSelfRelationDepth must be a positive integer!',
      )
    }

    if (this.suffixes.list === this.suffixes.single) {
      throw new Error(
        'GraphQL-Suite Error: List and single query suffixes cannot be the same. This would create conflicting GraphQL field names.',
      )
    }

    this.innerOrder = new GraphQLInputObjectType({
      name: 'InnerOrder',
      fields: {
        direction: {
          type: new GraphQLNonNull(
            new GraphQLEnumType({
              name: 'OrderDirection',
              description: 'Order by direction',
              values: {
                asc: { value: 'asc', description: 'Ascending order' },
                desc: { value: 'desc', description: 'Descending order' },
              },
            }),
          ),
        },
        priority: {
          type: new GraphQLNonNull(GraphQLInt),
          description: 'Priority of current field',
        },
      },
    })

    this.tables = this.extractTables(schema)
    this.allTableNames = Object.keys(this.tables)

    // Apply table exclusions before building relation map
    this.excludedTables = new Set(config?.tables?.exclude ?? [])
    this.tableOperations = config?.tables?.config ?? {}
    for (const tableName of this.excludedTables) {
      delete this.tables[tableName]
    }

    this.relationMap = this.buildRelationMap(schema)
  }

  // ─── Helpers ─────────────────────────────────────────────────

  private toFieldMap(
    tableFields: Record<string, ConvertedColumn>,
    relationFields?: Record<string, ConvertedRelationColumnWithArgs>,
  ): GraphQLFieldConfigMap<unknown, unknown> {
    return { ...tableFields, ...relationFields } as GraphQLFieldConfigMap<unknown, unknown>
  }

  // ─── Public API ──────────────────────────────────────────────

  buildEntities(): GeneratedEntities {
    // biome-ignore lint/suspicious/noExplicitAny: matches GraphQL's own GraphQLFieldConfig signature
    const queries: Record<string, GraphQLFieldConfig<any, any>> = {}
    // biome-ignore lint/suspicious/noExplicitAny: matches GraphQL's own GraphQLFieldConfig signature
    const mutations: Record<string, GraphQLFieldConfig<any, any>> = {}
    const inputs: Record<string, GraphQLInputObjectType> = {}
    const outputs: Record<string, GraphQLObjectType> = {}

    for (const tableName of Object.keys(this.tables)) {
      const tableOps = this.tableOperations[tableName]
      const generateQueries = tableOps?.queries !== false
      const generateMutations = tableOps?.mutations !== false && this.config.mutations !== false

      // Skip tables that need no top-level operations — their types are still
      // created lazily when other tables reference them via relations
      if (!generateQueries && !generateMutations) continue

      const tableTypes = this.generateTableTypes(tableName)

      const { insertInput, updateInput, tableFilters, tableOrder } = tableTypes.inputs
      const { selectSingleOutput, selectArrOutput, singleTableItemOutput, arrTableItemOutput } =
        tableTypes.outputs

      if (generateQueries) {
        const selectArr = this.createQueryResolver(tableName, tableOrder, tableFilters)
        queries[selectArr.name] = {
          type: selectArrOutput,
          args: selectArr.args,
          resolve: selectArr.resolver,
        }

        const selectSingle = this.createSingleQueryResolver(tableName, tableOrder, tableFilters)
        queries[selectSingle.name] = {
          type: selectSingleOutput,
          args: selectSingle.args,
          resolve: selectSingle.resolver,
        }

        const selectCount = this.createCountResolver(tableName, tableFilters)
        queries[selectCount.name] = {
          type: GraphQLInt,
          args: selectCount.args,
          resolve: selectCount.resolver,
        }

        inputs[tableFilters.name] = tableFilters
        inputs[tableOrder.name] = tableOrder
        outputs[selectSingleOutput.name] = selectSingleOutput
      }

      if (generateMutations) {
        const insertArr = this.createInsertResolver(tableName, insertInput)
        mutations[insertArr.name] = {
          type: arrTableItemOutput,
          args: insertArr.args,
          resolve: insertArr.resolver,
        }

        const insertSingle = this.createInsertSingleResolver(tableName, insertInput)
        mutations[insertSingle.name] = {
          type: singleTableItemOutput,
          args: insertSingle.args,
          resolve: insertSingle.resolver,
        }

        const update = this.createUpdateResolver(tableName, updateInput, tableFilters)
        mutations[update.name] = {
          type: arrTableItemOutput,
          args: update.args,
          resolve: update.resolver,
        }

        const del = this.createDeleteResolver(tableName, tableFilters)
        mutations[del.name] = {
          type: arrTableItemOutput,
          args: del.args,
          resolve: del.resolver,
        }

        inputs[insertInput.name] = insertInput
        inputs[updateInput.name] = updateInput
        inputs[tableFilters.name] = tableFilters
        inputs[tableOrder.name] = tableOrder
        outputs[singleTableItemOutput.name] = singleTableItemOutput
      }
    }

    return { queries, mutations, inputs, types: outputs }
  }

  build(): {
    schema: GraphQLSchema
    entities: GeneratedEntities
    withPermissions: (permissions: PermissionConfig) => GraphQLSchema
    clearPermissionCache: (id?: string) => void
  } {
    const entities = this.buildEntities()
    const { queries, mutations, inputs, types: outputs } = entities

    const graphQLSchemaConfig: GraphQLSchemaConfig = {
      types: [...Object.values(inputs), ...Object.values(outputs)] as (
        | GraphQLInputObjectType
        | GraphQLObjectType
      )[],
      query: new GraphQLObjectType({
        name: 'Query',
        fields: queries,
      }),
    }

    if (this.config.mutations !== false) {
      graphQLSchemaConfig.mutation = new GraphQLObjectType({
        name: 'Mutation',
        fields: mutations,
      })
    }

    const schema = new GraphQLSchema(graphQLSchemaConfig)
    this.logDebugInfo(schema)

    const cache = new Map<string, GraphQLSchema>()
    const db = this.db
    const baseConfig = this.config
    const allTableNames = this.allTableNames

    const withPermissions = (permissions: PermissionConfig): GraphQLSchema => {
      const cached = cache.get(permissions.id)
      if (cached) return cached

      const { config: mergedConfig, mutationFilter } = mergePermissionsIntoConfig(
        baseConfig,
        permissions,
        allTableNames,
      )

      // Check if all tables are excluded (restricted with nothing granted)
      const excludedSet = new Set(mergedConfig.tables?.exclude ?? [])
      const hasAnyTable = allTableNames.some((t) => !excludedSet.has(t))

      if (!hasAnyTable) {
        // Empty schema — only _empty: Boolean query field
        const emptySchema = new GraphQLSchema({
          query: new GraphQLObjectType({
            name: 'Query',
            fields: {
              _empty: { type: GraphQLBoolean },
            },
          }),
        })
        cache.set(permissions.id, emptySchema)
        return emptySchema
      }

      const permBuilder = new SchemaBuilder(db, mergedConfig)
      const permEntities = permBuilder.buildEntities()

      // Post-filter individual mutation entry points
      if (Object.keys(mutationFilter).length) {
        postFilterMutations(permEntities.mutations, mutationFilter)
      }

      // Build the schema from filtered entities
      const permSchemaConfig: GraphQLSchemaConfig = {
        types: [...Object.values(permEntities.inputs), ...Object.values(permEntities.types)] as (
          | GraphQLInputObjectType
          | GraphQLObjectType
        )[],
        query: new GraphQLObjectType({
          name: 'Query',
          fields: Object.keys(permEntities.queries).length
            ? permEntities.queries
            : { _empty: { type: GraphQLBoolean } },
        }),
      }

      if (mergedConfig.mutations !== false && Object.keys(permEntities.mutations).length) {
        permSchemaConfig.mutation = new GraphQLObjectType({
          name: 'Mutation',
          fields: permEntities.mutations,
        })
      }

      const permSchema = new GraphQLSchema(permSchemaConfig)
      cache.set(permissions.id, permSchema)
      return permSchema
    }

    const clearPermissionCache = (id?: string) => {
      if (id) cache.delete(id)
      else cache.clear()
    }

    return { schema, entities, withPermissions, clearPermissionCache }
  }

  private logDebugInfo(schema: GraphQLSchema): void {
    const debug = this.config.debug
    if (!debug) return

    const showSize = debug === true || (typeof debug === 'object' && debug.schemaSize !== false)
    const showTree = typeof debug === 'object' && debug.relationTree === true

    if (showSize) {
      const sdl = printSchema(schema)
      const typeCount = Object.keys(schema.getTypeMap()).filter((t) => !t.startsWith('__')).length
      console.info(`[drizzle-graphql] Schema: ${sdl.length} bytes, ${typeCount} types`)
    }

    if (showTree) {
      for (const [tableName, relations] of Object.entries(this.relationMap)) {
        const relNames = Object.keys(relations)
        if (relNames.length) {
          console.info(`[drizzle-graphql] ${tableName}: ${relNames.join(', ')}`)
        }
      }
    }
  }

  // ─── Schema Extraction ───────────────────────────────────────

  private extractTables(schema: Record<string, unknown>): Record<string, PgTable> {
    const entries = Object.entries(schema).filter(([_, value]) => is(value, PgTable)) as [
      string,
      PgTable,
    ][]

    if (!entries.length) {
      throw new Error(
        "GraphQL-Suite Error: No tables detected in Drizzle-ORM's database instance. Did you forget to pass schema to drizzle constructor?",
      )
    }

    return Object.fromEntries(entries)
  }

  private getTable(tableName: string): PgTable {
    const table = this.tables[tableName]
    if (!table) {
      throw new Error(`GraphQL-Suite Error: Table '${tableName}' not found.`)
    }
    return table
  }

  private buildRelationMap(
    schema: Record<string, unknown>,
  ): Record<string, Record<string, TableNamedRelations>> {
    const schemaEntries = Object.entries(schema)
    const tableEntries = Object.entries(this.tables)

    const rawRelations = schemaEntries
      .filter(([_, value]) => is(value, Relations))
      .map<[string, Relations] | null>(([_, value]) => {
        const entry = tableEntries.find(
          ([__, tableValue]) => tableValue === (value as Relations).table,
        )
        if (!entry) return null // table was excluded
        return [entry[0], value as Relations]
      })
      .filter((entry): entry is [string, Relations] => entry !== null)
      .map<[string, Record<string, Relation>]>(([tableName, relValue]) => [
        tableName,
        relValue.config(createTableRelationsHelpers(this.getTable(tableName))),
      ])

    return Object.fromEntries(
      rawRelations.map(([relName, config]) => {
        const namedConfig: Record<string, TableNamedRelations> = Object.fromEntries(
          Object.entries(config)
            .map(([innerRelName, innerRelValue]) => {
              const targetEntry = tableEntries.find(
                ([_, tableValue]) => tableValue === innerRelValue.referencedTable,
              )
              if (!targetEntry) return null // target table was excluded
              return [
                innerRelName,
                { relation: innerRelValue, targetTableName: targetEntry[0] },
              ] as const
            })
            .filter((entry): entry is NonNullable<typeof entry> => entry !== null),
        )
        return [relName, namedConfig]
      }),
    )
  }

  // ─── GraphQL Type Generation ─────────────────────────────────

  private getFilterType(tableName: string): GraphQLInputObjectType {
    const cached = this.filterTypes.get(tableName)
    if (cached) return cached

    const filters = new GraphQLInputObjectType({
      name: `${capitalize(tableName)}Filters`,
      fields: () => {
        const filterColumns = this.getFilterValues(tableName)
        const relationFilterFields = this.buildRelationFilterFields(tableName)

        return {
          ...filterColumns,
          ...relationFilterFields,
          OR: {
            type: new GraphQLList(
              new GraphQLNonNull(
                new GraphQLInputObjectType({
                  name: `${capitalize(tableName)}FiltersOr`,
                  fields: () => ({
                    ...filterColumns,
                    ...relationFilterFields,
                  }),
                }),
              ),
            ),
          },
        }
      },
    })

    // Cache before thunks evaluate so circular relations resolve via cache hit
    this.filterTypes.set(tableName, filters)
    return filters
  }

  private getOrderByType(tableName: string): GraphQLInputObjectType {
    const cached = this.orderByTypes.get(tableName)
    if (cached) return cached

    const table = this.getTable(tableName)
    const columns = getTableColumns(table)
    const orderColumns = Object.fromEntries(
      Object.entries(columns).map(([columnName]) => [columnName, { type: this.innerOrder }]),
    )

    const order = new GraphQLInputObjectType({
      name: `${capitalize(tableName)}OrderBy`,
      fields: orderColumns,
    })

    this.orderByTypes.set(tableName, order)
    return order
  }

  private getFilterValues(tableName: string): Record<string, ConvertedInputColumn> {
    const cached = this.filterValueTypes.get(tableName)
    if (cached) return cached

    const table = this.getTable(tableName)
    const columns = getTableColumns(table)
    const result = Object.fromEntries(
      Object.entries(columns).map(([columnName, col]) => [
        columnName,
        { type: this.generateColumnFilterValues(col, tableName, columnName) },
      ]),
    )

    this.filterValueTypes.set(tableName, result)
    return result
  }

  private getSelectFields(tableName: string): Record<string, ConvertedColumn> {
    const cached = this.selectFieldTypes.get(tableName)
    if (cached) return cached

    const table = this.getTable(tableName)
    const columns = getTableColumns(table)
    const result = Object.fromEntries(
      Object.entries(columns).map(([columnName, col]) => [
        columnName,
        drizzleColumnToGraphQLType(col, columnName, tableName),
      ]),
    )

    this.selectFieldTypes.set(tableName, result)
    return result
  }

  private generateColumnFilterValues(
    column: Column,
    tableName: string,
    columnName: string,
  ): GraphQLInputObjectType {
    const columnGraphQLType = drizzleColumnToGraphQLType(
      column,
      columnName,
      tableName,
      true,
      false,
      true,
    )
    const columnArr = new GraphQLList(new GraphQLNonNull(columnGraphQLType.type))

    const baseFields = {
      eq: { type: columnGraphQLType.type, description: columnGraphQLType.description },
      ne: { type: columnGraphQLType.type, description: columnGraphQLType.description },
      lt: { type: columnGraphQLType.type, description: columnGraphQLType.description },
      lte: { type: columnGraphQLType.type, description: columnGraphQLType.description },
      gt: { type: columnGraphQLType.type, description: columnGraphQLType.description },
      gte: { type: columnGraphQLType.type, description: columnGraphQLType.description },
      like: { type: GraphQLString },
      notLike: { type: GraphQLString },
      ilike: { type: GraphQLString },
      notIlike: { type: GraphQLString },
      inArray: { type: columnArr, description: `Array<${columnGraphQLType.description}>` },
      notInArray: { type: columnArr, description: `Array<${columnGraphQLType.description}>` },
      isNull: { type: GraphQLBoolean },
      isNotNull: { type: GraphQLBoolean },
    }

    return new GraphQLInputObjectType({
      name: `${capitalize(tableName)}${capitalize(columnName)}Filters`,
      fields: {
        ...baseFields,
        OR: {
          type: new GraphQLList(
            new GraphQLNonNull(
              new GraphQLInputObjectType({
                name: `${capitalize(tableName)}${capitalize(columnName)}FiltersOr`,
                fields: baseFields,
              }),
            ),
          ),
        },
      },
    })
  }

  private generateSelectFields<TWithOrder extends boolean>(
    tableName: string,
    typeName: string,
    withOrder: TWithOrder,
    currentDepth: number = 0,
    usedTables: Set<string> = new Set(),
    currentSelfDepth: number = 0,
    forceLeaf?: boolean,
    allowedRelations?: string[],
  ): SelectData<TWithOrder> {
    const relations = this.relationMap[tableName]
    const relationEntries: [string, TableNamedRelations][] = relations
      ? Object.entries(relations)
      : []

    const order = withOrder ? this.getOrderByType(tableName) : undefined
    const filters = this.getFilterType(tableName)
    const tableFields = this.getSelectFields(tableName)

    if (
      forceLeaf ||
      (typeof this.limitRelationDepth !== 'number' && usedTables.has(tableName)) ||
      (typeof this.limitRelationDepth === 'number' && currentDepth >= this.limitRelationDepth) ||
      !relationEntries.length
    ) {
      return { order, filters, tableFields, relationFields: {} } as SelectData<TWithOrder>
    }

    const rawRelationFields: [string, ConvertedRelationColumnWithArgs][] = []
    const updatedUsedTables = new Set(usedTables).add(tableName)
    const newDepth = currentDepth + 1

    for (const [relationName, { targetTableName, relation }] of relationEntries) {
      // allowedRelations filter (one-shot, not propagated)
      if (allowedRelations && !allowedRelations.includes(relationName)) continue

      // Per-relation pruning
      const pruneRule = this.pruneRelations.get(`${tableName}.${relationName}`)
      if (pruneRule === false) continue

      const relTypeName = `${typeName}${capitalize(relationName)}Relation`
      const isOne = is(relation, One)
      const isSelfRelation = targetTableName === tableName

      // Self-relation limit: skip if we've exhausted the self-relation budget
      if (isSelfRelation && currentSelfDepth + 1 >= this.limitSelfRelationDepth) {
        continue
      }

      // Cross-table cycle: if this target table was already visited in this path,
      // bump the effective depth to limit-1 so it gets at most 1 more level
      const isCrossCycle = !isSelfRelation && usedTables.has(targetTableName)
      const effectiveDepth =
        isCrossCycle && typeof this.limitRelationDepth === 'number'
          ? Math.max(newDepth, this.limitRelationDepth - 1)
          : newDepth

      // Derive one-shot params from prune rule (not propagated to deeper levels)
      const isLeaf = pruneRule === 'leaf'
      const onlyRels = pruneRule && typeof pruneRule === 'object' ? pruneRule.only : undefined

      const relData = this.generateSelectFields(
        targetTableName,
        relTypeName,
        !isOne,
        effectiveDepth,
        updatedUsedTables,
        isSelfRelation ? currentSelfDepth + 1 : 0,
        isLeaf,
        onlyRels,
      )

      const relType = new GraphQLObjectType({
        name: relTypeName,
        fields: this.toFieldMap(relData.tableFields, relData.relationFields),
      })

      if (isOne) {
        rawRelationFields.push([
          relationName,
          {
            type: relType,
            args: {
              where: { type: relData.filters },
            },
          },
        ])
        continue
      }

      rawRelationFields.push([
        relationName,
        {
          type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(relType))),
          args: {
            where: { type: relData.filters },
            // biome-ignore lint/style/noNonNullAssertion: order defined when withOrder=true (Many relation)
            orderBy: { type: relData.order! },
            offset: { type: GraphQLInt },
            limit: { type: GraphQLInt },
          },
        },
      ])
    }

    const relationFields = Object.fromEntries(rawRelationFields)
    return { order, filters, tableFields, relationFields } as SelectData<TWithOrder>
  }

  private generateTableTypes(tableName: string) {
    const stylizedName = capitalize(tableName)
    const { tableFields, relationFields, filters, order } = this.generateSelectFields(
      tableName,
      stylizedName,
      true,
    )

    const table = this.getTable(tableName)
    const columns = getTableColumns(table)
    const columnEntries = Object.entries(columns)

    const insertFields = Object.fromEntries(
      columnEntries.map(([columnName, col]) => [
        columnName,
        drizzleColumnToGraphQLType(col, columnName, tableName, false, true, true),
      ]),
    )

    const updateFields = Object.fromEntries(
      columnEntries.map(([columnName, col]) => [
        columnName,
        drizzleColumnToGraphQLType(col, columnName, tableName, true, false, true),
      ]),
    )

    const insertInput = new GraphQLInputObjectType({
      name: `${stylizedName}InsertInput`,
      fields: insertFields,
    })

    const updateInput = new GraphQLInputObjectType({
      name: `${stylizedName}UpdateInput`,
      fields: updateFields,
    })

    const selectSingleOutput = new GraphQLObjectType({
      name: `${stylizedName}SelectItem`,
      fields: this.toFieldMap(tableFields, relationFields),
    })

    const selectArrOutput = new GraphQLNonNull(
      new GraphQLList(new GraphQLNonNull(selectSingleOutput)),
    )

    const singleTableItemOutput = new GraphQLObjectType({
      name: `${stylizedName}Item`,
      fields: this.toFieldMap(tableFields),
    })

    const arrTableItemOutput = new GraphQLNonNull(
      new GraphQLList(new GraphQLNonNull(singleTableItemOutput)),
    )

    return {
      inputs: {
        insertInput,
        updateInput,
        tableOrder: order,
        tableFilters: filters,
      },
      outputs: {
        selectSingleOutput,
        selectArrOutput,
        singleTableItemOutput,
        arrTableItemOutput,
      },
    }
  }

  // ─── Relation Filter Support ─────────────────────────────────

  private buildRelationFilterFields(
    tableName: string,
  ): Record<string, { type: GraphQLInputObjectType }> {
    const relations = this.relationMap[tableName]
    if (!relations) return {}

    const fields: Record<string, { type: GraphQLInputObjectType }> = {}

    for (const [relationName, { targetTableName, relation }] of Object.entries(relations)) {
      if (is(relation, One)) {
        // One relations: reuse the target table's filter type directly
        fields[relationName] = {
          type: this.getFilterType(targetTableName),
        }
      } else {
        // Many relations: some/every/none quantifiers wrapping target's filter type
        fields[relationName] = {
          type: new GraphQLInputObjectType({
            name: `${capitalize(tableName)}${capitalize(relationName)}RelFilter`,
            fields: () => ({
              some: { type: this.getFilterType(targetTableName) },
              every: { type: this.getFilterType(targetTableName) },
              none: { type: this.getFilterType(targetTableName) },
            }),
          }),
        }
      }
    }

    return fields
  }

  // ─── Resolver Creation ───────────────────────────────────────

  private createQueryResolver(
    tableName: string,
    orderArgs: GraphQLInputObjectType,
    filterArgs: GraphQLInputObjectType,
  ) {
    const queryName = `${uncapitalize(tableName)}${this.suffixes.list}`
    const typeName = `${capitalize(tableName)}SelectItem`
    const table = this.getTable(tableName)

    const queryBase = this.db.query[tableName as keyof typeof this.db.query] as unknown as
      // biome-ignore lint/suspicious/noExplicitAny: Drizzle RelationalQueryBuilder generic parameters
      RelationalQueryBuilder<any, any> | undefined
    if (!queryBase) {
      throw new Error(
        `GraphQL-Suite Error: Table ${tableName} not found in drizzle instance. Did you forget to pass schema to drizzle constructor?`,
      )
    }

    const args: GraphQLFieldConfigArgumentMap = {
      offset: { type: GraphQLInt },
      limit: { type: GraphQLInt },
      orderBy: { type: orderArgs },
      where: { type: filterArgs },
    }

    const resolver = async (
      // biome-ignore lint/suspicious/noExplicitAny: GraphQL resolver signature
      _source: any,
      resolverArgs: Partial<TableSelectArgs>,
      // biome-ignore lint/suspicious/noExplicitAny: GraphQL resolver signature
      context: any,
      info: GraphQLResolveInfo,
    ) => {
      return this.executeWithHooks(
        tableName,
        'query',
        resolverArgs,
        context,
        info,
        async (finalArgs) => {
          try {
            const { offset, limit, orderBy, where } = finalArgs

            const parsedInfo = parseResolveInfo(info, { deep: true }) as ResolveTree

            const query = queryBase.findMany({
              columns: this.extractColumns(this.getFieldsByTypeName(parsedInfo, typeName), table),
              offset,
              limit,
              orderBy: orderBy ? this.extractOrderBy(table, orderBy) : undefined,
              where: where ? this.extractAllFilters(table, tableName, where) : undefined,
              with: this.relationMap[tableName]
                ? this.extractRelationsParams(tableName, parsedInfo, typeName)
                : undefined,
            })

            const result = await query
            return remapToGraphQLArrayOutput(result, tableName, table, this.relationMap)
          } catch (e: unknown) {
            if (
              typeof e === 'object' &&
              e !== null &&
              'message' in e &&
              typeof e.message === 'string'
            ) {
              throw new GraphQLError(e.message)
            }
            throw e
          }
        },
      )
    }

    return { name: queryName, resolver, args }
  }

  private createSingleQueryResolver(
    tableName: string,
    orderArgs: GraphQLInputObjectType,
    filterArgs: GraphQLInputObjectType,
  ) {
    const queryName = `${uncapitalize(tableName)}${this.suffixes.single}`
    const typeName = `${capitalize(tableName)}SelectItem`
    const table = this.getTable(tableName)

    const queryBase = this.db.query[tableName as keyof typeof this.db.query] as unknown as
      // biome-ignore lint/suspicious/noExplicitAny: Drizzle RelationalQueryBuilder generic parameters
      RelationalQueryBuilder<any, any> | undefined
    if (!queryBase) {
      throw new Error(
        `GraphQL-Suite Error: Table ${tableName} not found in drizzle instance. Did you forget to pass schema to drizzle constructor?`,
      )
    }

    const args: GraphQLFieldConfigArgumentMap = {
      offset: { type: GraphQLInt },
      orderBy: { type: orderArgs },
      where: { type: filterArgs },
    }

    const resolver = async (
      // biome-ignore lint/suspicious/noExplicitAny: GraphQL resolver signature
      _source: any,
      resolverArgs: Partial<TableSelectArgs>,
      // biome-ignore lint/suspicious/noExplicitAny: GraphQL resolver signature
      context: any,
      info: GraphQLResolveInfo,
    ) => {
      return this.executeWithHooks(
        tableName,
        'querySingle',
        resolverArgs,
        context,
        info,
        async (finalArgs) => {
          try {
            const { offset, orderBy, where } = finalArgs

            const parsedInfo = parseResolveInfo(info, { deep: true }) as ResolveTree

            const query = queryBase.findFirst({
              columns: this.extractColumns(this.getFieldsByTypeName(parsedInfo, typeName), table),
              offset,
              orderBy: orderBy ? this.extractOrderBy(table, orderBy) : undefined,
              where: where ? this.extractAllFilters(table, tableName, where) : undefined,
              with: this.relationMap[tableName]
                ? this.extractRelationsParams(tableName, parsedInfo, typeName)
                : undefined,
            })

            const result = await query
            if (!result) return undefined

            return remapToGraphQLSingleOutput(result, tableName, table, this.relationMap)
          } catch (e: unknown) {
            if (
              typeof e === 'object' &&
              e !== null &&
              'message' in e &&
              typeof e.message === 'string'
            ) {
              throw new GraphQLError(e.message)
            }
            throw e
          }
        },
      )
    }

    return { name: queryName, resolver, args }
  }

  private createCountResolver(tableName: string, filterArgs: GraphQLInputObjectType) {
    const queryName = `${uncapitalize(tableName)}Count`
    const table = this.getTable(tableName)

    const args: GraphQLFieldConfigArgumentMap = {
      where: { type: filterArgs },
    }

    const resolver = async (
      // biome-ignore lint/suspicious/noExplicitAny: GraphQL resolver signature
      _source: any,
      // biome-ignore lint/suspicious/noExplicitAny: dynamic GraphQL filter input
      resolverArgs: { where?: any },
      // biome-ignore lint/suspicious/noExplicitAny: GraphQL resolver signature
      context: any,
      info: GraphQLResolveInfo,
    ) => {
      return this.executeWithHooks(
        tableName,
        'count',
        resolverArgs,
        context,
        info,
        async (finalArgs) => {
          try {
            const { where } = finalArgs
            const whereClause = where ? this.extractAllFilters(table, tableName, where) : undefined
            return await this.executeCountQuery(table, whereClause)
          } catch (e: unknown) {
            if (
              typeof e === 'object' &&
              e !== null &&
              'message' in e &&
              typeof e.message === 'string'
            ) {
              throw new GraphQLError(e.message)
            }
            throw e
          }
        },
      )
    }

    return { name: queryName, resolver, args }
  }

  private createInsertResolver(tableName: string, baseType: GraphQLInputObjectType) {
    const queryName = `insertInto${capitalize(tableName)}`
    const typeName = `${capitalize(tableName)}Item`
    const table = this.getTable(tableName)

    const args: GraphQLFieldConfigArgumentMap = {
      values: { type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(baseType))) },
    }

    const resolver = async (
      // biome-ignore lint/suspicious/noExplicitAny: GraphQL resolver signature
      _source: any,
      // biome-ignore lint/suspicious/noExplicitAny: dynamically typed by table schema
      resolverArgs: { values: Record<string, any>[] },
      // biome-ignore lint/suspicious/noExplicitAny: GraphQL resolver signature
      context: any,
      info: GraphQLResolveInfo,
    ) => {
      return this.executeWithHooks(
        tableName,
        'insert',
        resolverArgs,
        context,
        info,
        async (finalArgs) => {
          try {
            const input = remapFromGraphQLArrayInput(finalArgs.values, table)
            if (!input.length) throw new GraphQLError('No values were provided!')

            const parsedInfo = parseResolveInfo(info, { deep: true }) as ResolveTree
            const columns = this.extractColumnsSQLFormat(
              this.getFieldsByTypeName(parsedInfo, typeName),
              table,
            )

            const result = await this.adapter.executeInsert(this.db, table, input, columns)
            return remapToGraphQLArrayOutput(result, tableName, table)
          } catch (e: unknown) {
            if (
              typeof e === 'object' &&
              e !== null &&
              'message' in e &&
              typeof e.message === 'string'
            ) {
              throw new GraphQLError(e.message)
            }
            throw e
          }
        },
      )
    }

    return { name: queryName, resolver, args }
  }

  private createInsertSingleResolver(tableName: string, baseType: GraphQLInputObjectType) {
    const queryName = `insertInto${capitalize(tableName)}Single`
    const typeName = `${capitalize(tableName)}Item`
    const table = this.getTable(tableName)

    const args: GraphQLFieldConfigArgumentMap = {
      values: { type: new GraphQLNonNull(baseType) },
    }

    const resolver = async (
      // biome-ignore lint/suspicious/noExplicitAny: GraphQL resolver signature
      _source: any,
      // biome-ignore lint/suspicious/noExplicitAny: dynamically typed by table schema
      resolverArgs: { values: Record<string, any> },
      // biome-ignore lint/suspicious/noExplicitAny: GraphQL resolver signature
      context: any,
      info: GraphQLResolveInfo,
    ) => {
      return this.executeWithHooks(
        tableName,
        'insertSingle',
        resolverArgs,
        context,
        info,
        async (finalArgs) => {
          try {
            const input = remapFromGraphQLSingleInput(finalArgs.values, table)

            const parsedInfo = parseResolveInfo(info, { deep: true }) as ResolveTree
            const columns = this.extractColumnsSQLFormat(
              this.getFieldsByTypeName(parsedInfo, typeName),
              table,
            )

            const result = await this.adapter.executeInsert(this.db, table, [input], columns)
            if (!result[0]) return undefined

            return remapToGraphQLSingleOutput(result[0], tableName, table)
          } catch (e: unknown) {
            if (
              typeof e === 'object' &&
              e !== null &&
              'message' in e &&
              typeof e.message === 'string'
            ) {
              throw new GraphQLError(e.message)
            }
            throw e
          }
        },
      )
    }

    return { name: queryName, resolver, args }
  }

  private createUpdateResolver(
    tableName: string,
    setArgs: GraphQLInputObjectType,
    filterArgs: GraphQLInputObjectType,
  ) {
    const queryName = `update${capitalize(tableName)}`
    const typeName = `${capitalize(tableName)}Item`
    const table = this.getTable(tableName)

    const args: GraphQLFieldConfigArgumentMap = {
      set: { type: new GraphQLNonNull(setArgs) },
      where: { type: filterArgs },
    }

    const resolver = async (
      // biome-ignore lint/suspicious/noExplicitAny: GraphQL resolver signature
      _source: any,
      // biome-ignore lint/suspicious/noExplicitAny: dynamically typed by table schema
      resolverArgs: { where?: any; set: Record<string, any> },
      // biome-ignore lint/suspicious/noExplicitAny: GraphQL resolver signature
      context: any,
      info: GraphQLResolveInfo,
    ) => {
      return this.executeWithHooks(
        tableName,
        'update',
        resolverArgs,
        context,
        info,
        async (finalArgs) => {
          try {
            const { where, set } = finalArgs

            const parsedInfo = parseResolveInfo(info, { deep: true }) as ResolveTree
            const columns = this.extractColumnsSQLFormat(
              this.getFieldsByTypeName(parsedInfo, typeName),
              table,
            )

            const input = remapFromGraphQLSingleInput(set, table)
            if (!Object.keys(input).length)
              throw new GraphQLError('Unable to update with no values specified!')

            const whereClause = where ? this.extractAllFilters(table, tableName, where) : undefined
            const result = await this.adapter.executeUpdate(
              this.db,
              table,
              input,
              whereClause,
              columns,
            )

            return remapToGraphQLArrayOutput(result, tableName, table)
          } catch (e: unknown) {
            if (
              typeof e === 'object' &&
              e !== null &&
              'message' in e &&
              typeof e.message === 'string'
            ) {
              throw new GraphQLError(e.message)
            }
            throw e
          }
        },
      )
    }

    return { name: queryName, resolver, args }
  }

  private createDeleteResolver(tableName: string, filterArgs: GraphQLInputObjectType) {
    const queryName = `deleteFrom${capitalize(tableName)}`
    const typeName = `${capitalize(tableName)}Item`
    const table = this.getTable(tableName)

    const args: GraphQLFieldConfigArgumentMap = {
      where: { type: filterArgs },
    }

    const resolver = async (
      // biome-ignore lint/suspicious/noExplicitAny: GraphQL resolver signature
      _source: any,
      // biome-ignore lint/suspicious/noExplicitAny: dynamic GraphQL filter input
      resolverArgs: { where?: any },
      // biome-ignore lint/suspicious/noExplicitAny: GraphQL resolver signature
      context: any,
      info: GraphQLResolveInfo,
    ) => {
      return this.executeWithHooks(
        tableName,
        'delete',
        resolverArgs,
        context,
        info,
        async (finalArgs) => {
          try {
            const { where } = finalArgs

            const parsedInfo = parseResolveInfo(info, { deep: true }) as ResolveTree
            const columns = this.extractColumnsSQLFormat(
              this.getFieldsByTypeName(parsedInfo, typeName),
              table,
            )

            const whereClause = where ? this.extractAllFilters(table, tableName, where) : undefined
            const result = await this.adapter.executeDelete(this.db, table, whereClause, columns)

            return remapToGraphQLArrayOutput(result, tableName, table)
          } catch (e: unknown) {
            if (
              typeof e === 'object' &&
              e !== null &&
              'message' in e &&
              typeof e.message === 'string'
            ) {
              throw new GraphQLError(e.message)
            }
            throw e
          }
        },
      )
    }

    return { name: queryName, resolver, args }
  }

  // ─── Filter Extraction ───────────────────────────────────────

  protected extractColumnFilters(
    column: Column,
    columnName: string,
    // biome-ignore lint/suspicious/noExplicitAny: dynamic GraphQL filter input
    operators: any,
  ): SQL | undefined {
    if (!operators.OR?.length) delete operators.OR

    const entries = Object.entries(operators)

    if (operators.OR) {
      const orVariants: SQL[] = []
      for (const variant of operators.OR) {
        const extracted = this.extractColumnFilters(column, columnName, variant)
        if (extracted) orVariants.push(extracted)
      }

      const orClause =
        orVariants.length > 1
          ? or(...orVariants)
          : orVariants.length === 1
            ? orVariants[0]
            : undefined

      // If no other fields, return OR clause directly
      if (entries.length <= 1) return orClause

      // AND the OR clause with remaining field filters
      const { OR: _, ...rest } = operators
      const fieldClause = this.extractColumnFilters(column, columnName, rest)
      if (!fieldClause) return orClause
      if (!orClause) return fieldClause
      return and(fieldClause, orClause)
    }

    const comparisonOps: Record<string, typeof eq> = { eq, ne, gt, gte, lt, lte }
    const stringOps: Record<string, typeof like> = { like, notLike, ilike, notIlike }
    const arrayOps: Record<string, (col: Column, values: unknown[]) => SQL> = {
      inArray,
      notInArray,
    }
    const nullOps: Record<string, typeof isNull> = { isNull, isNotNull }

    const variants: SQL[] = []
    for (const [operatorName, operatorValue] of entries) {
      if (operatorValue === null || operatorValue === false) continue

      if (operatorName in comparisonOps) {
        const op = comparisonOps[operatorName]
        if (op) {
          const singleValue = remapFromGraphQLCore(operatorValue, column, columnName)
          variants.push(op(column, singleValue))
        }
      } else if (operatorName in stringOps) {
        const op = stringOps[operatorName]
        if (op) variants.push(op(column, operatorValue as string))
      } else if (operatorName in arrayOps) {
        const op = arrayOps[operatorName]
        if (op) {
          if (!(operatorValue as unknown[]).length) {
            throw new GraphQLError(
              `WHERE ${columnName}: Unable to use operator ${operatorName} with an empty array!`,
            )
          }
          const arrayValue = (operatorValue as unknown[]).map((val) =>
            remapFromGraphQLCore(val, column, columnName),
          )
          variants.push(op(column, arrayValue))
        }
      } else if (operatorName in nullOps) {
        const op = nullOps[operatorName]
        if (op) variants.push(op(column))
      }
    }

    return variants.length ? (variants.length > 1 ? and(...variants) : variants[0]) : undefined
  }

  protected extractTableColumnFilters(
    table: Table,
    tableName: string,
    // biome-ignore lint/suspicious/noExplicitAny: dynamic GraphQL filter input
    filters: any,
  ): SQL | undefined {
    if (!filters.OR?.length) delete filters.OR

    // Separate column filters from relation filters
    const tableColumns = getTableColumns(table)
    // biome-ignore lint/suspicious/noExplicitAny: dynamic GraphQL filter input
    const columnEntries: [string, any][] = []
    // biome-ignore lint/suspicious/noExplicitAny: dynamic GraphQL filter input
    const relationEntries: [string, any][] = []

    for (const [key, value] of Object.entries(filters)) {
      if (key === 'OR') continue
      if (value === null) continue
      if (tableColumns[key]) {
        columnEntries.push([key, value])
      } else {
        relationEntries.push([key, value])
      }
    }

    if (filters.OR) {
      const orVariants: SQL[] = []
      for (const variant of filters.OR) {
        const extracted = this.extractAllFilters(table, tableName, variant)
        if (extracted) orVariants.push(extracted)
      }

      const orClause =
        orVariants.length > 1
          ? or(...orVariants)
          : orVariants.length === 1
            ? orVariants[0]
            : undefined

      // If no other fields, return OR clause directly
      if (columnEntries.length === 0 && relationEntries.length === 0) return orClause

      // AND the OR clause with remaining field filters
      const { OR: _, ...rest } = filters
      const fieldClause = this.extractAllFilters(table, tableName, rest)
      if (!fieldClause) return orClause
      if (!orClause) return fieldClause
      return and(fieldClause, orClause)
    }

    const variants: SQL[] = []

    // Column filters
    for (const [columnName, operators] of columnEntries) {
      const column = tableColumns[columnName]
      if (!column) continue
      const result = this.extractColumnFilters(column, columnName, operators)
      if (result) variants.push(result)
    }

    // Relation filters
    for (const [relationName, filterValue] of relationEntries) {
      const result = this.extractRelationFilters(table, tableName, relationName, filterValue)
      if (result) variants.push(result)
    }

    return variants.length ? (variants.length > 1 ? and(...variants) : variants[0]) : undefined
  }

  /** Combined filter extraction: column filters + relation filters */
  // biome-ignore lint/suspicious/noExplicitAny: dynamic GraphQL filter input
  private extractAllFilters(table: Table, tableName: string, filters: any): SQL | undefined {
    return this.extractTableColumnFilters(table, tableName, filters)
  }

  // ─── Relation Filter Extraction (EXISTS subqueries) ──────────

  protected extractRelationFilters(
    table: Table,
    tableName: string,
    relationName: string,
    // biome-ignore lint/suspicious/noExplicitAny: dynamic GraphQL filter input
    filterValue: any,
  ): SQL | undefined {
    const rel = this.relationMap[tableName]?.[relationName]
    if (!rel) return undefined

    const { targetTableName, relation } = rel
    const targetTable = this.getTable(targetTableName)
    const isOne = is(relation, One)

    if (isOne) {
      // One relation: filterValue is a direct filter object
      return this.buildExistsSubquery(
        table,
        targetTable,
        relation,
        targetTableName,
        filterValue,
        'some',
      )
    } else {
      // Many relation: filterValue has some/every/none quantifiers
      const variants: SQL[] = []

      if (filterValue.some) {
        const result = this.buildExistsSubquery(
          table,
          targetTable,
          relation,
          targetTableName,
          filterValue.some,
          'some',
        )
        if (result) variants.push(result)
      }

      if (filterValue.every) {
        const result = this.buildExistsSubquery(
          table,
          targetTable,
          relation,
          targetTableName,
          filterValue.every,
          'every',
        )
        if (result) variants.push(result)
      }

      if (filterValue.none) {
        const result = this.buildExistsSubquery(
          table,
          targetTable,
          relation,
          targetTableName,
          filterValue.none,
          'none',
        )
        if (result) variants.push(result)
      }

      return variants.length ? (variants.length > 1 ? and(...variants) : variants[0]) : undefined
    }
  }

  protected buildExistsSubquery(
    parentTable: Table,
    targetTable: Table,
    relation: Relation,
    targetTableName: string,
    // biome-ignore lint/suspicious/noExplicitAny: dynamic GraphQL filter input
    filterValue: any,
    quantifier: 'some' | 'every' | 'none',
  ): SQL | undefined {
    // Build join condition from relation fields
    const joinCondition = this.buildJoinCondition(parentTable, targetTable, relation)
    if (!joinCondition) return undefined

    // Build the inner filter on the target table
    const innerFilter = this.extractAllFilters(targetTable, targetTableName, filterValue)

    // Combine join condition with inner filter
    const whereClause = innerFilter ? and(joinCondition, innerFilter) : joinCondition
    if (!whereClause) return undefined

    // Build the EXISTS subquery
    const subquery = this.db
      .select({ _: sql`1` })
      .from(targetTable as PgTable)
      .where(whereClause)

    switch (quantifier) {
      case 'some':
        return exists(subquery)
      case 'none':
        return not(exists(subquery))
      case 'every': {
        // "every" = NOT EXISTS (target WHERE join AND NOT innerFilter)
        if (!innerFilter) return undefined // if no filter, "every" is trivially true
        const negatedFilter = not(innerFilter)
        const everyWhereClause = and(joinCondition, negatedFilter)
        if (!everyWhereClause) return undefined
        const everySubquery = this.db
          .select({ _: sql`1` })
          .from(targetTable as PgTable)
          .where(everyWhereClause)
        return not(exists(everySubquery))
      }
    }
  }

  protected buildJoinCondition(
    parentTable: Table,
    _targetTable: Table,
    relation: Relation,
  ): SQL | undefined {
    try {
      const { fields, references } = normalizeRelation(
        this.relationalSchema,
        this.tableNamesMap,
        relation,
      )
      if (!fields?.length || !references?.length) return undefined

      // The parent table may be aliased by the relational query builder
      // (e.g., "asset"."output" → alias "output"). Raw Column objects render
      // with the schema-qualified name which doesn't match the alias.
      // Using the unqualified table name works in both aliased (findMany)
      // and non-aliased (count) contexts.
      const parentName = getTableName(parentTable)

      const conditions: SQL[] = []
      for (let i = 0; i < fields.length; i++) {
        const field = fields[i]
        const ref = references[i]
        if (!field || !ref) continue

        if (getTableName(field.table) === parentName) {
          conditions.push(sql`${sql.identifier(parentName)}.${sql.identifier(field.name)} = ${ref}`)
        } else if (getTableName(ref.table) === parentName) {
          conditions.push(sql`${field} = ${sql.identifier(parentName)}.${sql.identifier(ref.name)}`)
        } else {
          conditions.push(eq(field, ref))
        }
      }
      return conditions.length > 1 ? and(...conditions) : conditions[0]
    } catch {
      return undefined
    }
  }

  // ─── Order By Extraction ─────────────────────────────────────

  // biome-ignore lint/suspicious/noExplicitAny: dynamic GraphQL order input
  protected extractOrderBy(table: Table, orderArgs: any): SQL[] {
    const res: SQL[] = []

    for (const [column, config] of Object.entries(orderArgs).sort((a, b) => {
      const ap = (a[1] as { priority?: number } | null)?.priority ?? 0
      const bp = (b[1] as { priority?: number } | null)?.priority ?? 0
      return bp - ap
    })) {
      if (!config) continue
      const { direction } = config as { direction: string }
      const col = getTableColumns(table)[column]
      if (!col) continue
      res.push(direction === 'asc' ? asc(col) : desc(col))
    }

    return res
  }

  // ─── Column Selection ────────────────────────────────────────

  protected extractColumns(tree: Record<string, ResolveTree>, table: Table): Record<string, true> {
    const tableColumns = getTableColumns(table)
    const selectedColumns: [string, true][] = []

    for (const [_, fieldData] of Object.entries(tree)) {
      if (!tableColumns[fieldData.name]) continue
      selectedColumns.push([fieldData.name, true])
    }

    if (!selectedColumns.length) {
      const columnKeys = Object.entries(tableColumns)
      const columnName =
        columnKeys.find((e) => !rqbCrashTypes.includes(e[1].columnType))?.[0] ??
        columnKeys[0]?.[0] ??
        ''
      selectedColumns.push([columnName, true])
    }

    return Object.fromEntries(selectedColumns)
  }

  private extractColumnsSQLFormat(
    tree: Record<string, ResolveTree>,
    table: Table,
  ): Record<string, Column> {
    const tableColumns = getTableColumns(table)
    const selectedColumns: [string, Column][] = []

    for (const [_, fieldData] of Object.entries(tree)) {
      const col = tableColumns[fieldData.name]
      if (!col) continue
      selectedColumns.push([fieldData.name, col])
    }

    if (!selectedColumns.length) {
      const columnKeys = Object.entries(tableColumns)
      const columnName =
        columnKeys.find((e) => !rqbCrashTypes.includes(e[1].columnType))?.[0] ??
        columnKeys[0]?.[0] ??
        ''
      const fallbackCol = tableColumns[columnName]
      if (fallbackCol) selectedColumns.push([columnName, fallbackCol])
    }

    return Object.fromEntries(selectedColumns)
  }

  // ─── Resolve Info Parsing ────────────────────────────────────

  private getFieldsByTypeName(info: ResolveTree, typeName: string): Record<string, ResolveTree> {
    return info.fieldsByTypeName[typeName] ?? {}
  }

  private extractRelationsParams(
    tableName: string,
    info: ResolveTree,
    typeName: string,
  ): Record<string, Partial<ProcessedTableSelectArgs>> | undefined {
    return this.extractRelationsParamsInner(tableName, typeName, info, true)
  }

  private extractRelationsParamsInner(
    tableName: string,
    typeName: string,
    originField: ResolveTree,
    isInitial: boolean = false,
  ): Record<string, Partial<ProcessedTableSelectArgs>> | undefined {
    const relations = this.relationMap[tableName]
    if (!relations) return undefined

    const baseField = Object.entries(originField.fieldsByTypeName).find(
      ([key]) => key === typeName,
    )?.[1]
    if (!baseField) return undefined

    const args: Record<string, Partial<ProcessedTableSelectArgs>> = {}

    for (const [relName, { targetTableName }] of Object.entries(relations)) {
      const relTypeName = `${isInitial ? capitalize(tableName) : typeName}${capitalize(relName)}Relation`
      const relFieldSelection = Object.values(baseField).find((field) => field.name === relName)
        ?.fieldsByTypeName[relTypeName]
      if (!relFieldSelection) continue

      const targetTable = this.getTable(targetTableName)
      const columns = this.extractColumns(relFieldSelection, targetTable)
      const thisRecord: Partial<ProcessedTableSelectArgs> = { columns }

      const relationField = Object.values(baseField).find((e) => e.name === relName)
      const relationArgs: Partial<TableSelectArgs> | undefined = relationField?.args

      thisRecord.orderBy = relationArgs?.orderBy
        ? this.extractOrderBy(targetTable, relationArgs.orderBy)
        : undefined
      thisRecord.where = relationArgs?.where
        ? this.extractAllFilters(targetTable, relName, relationArgs.where)
        : undefined
      thisRecord.offset = relationArgs?.offset ?? undefined
      thisRecord.limit = relationArgs?.limit ?? undefined

      thisRecord.with = relationField
        ? this.extractRelationsParamsInner(targetTableName, relTypeName, relationField)
        : undefined

      args[relName] = thisRecord
    }

    return args
  }

  // ─── Hook Execution ──────────────────────────────────────────

  private async executeWithHooks(
    tableName: string,
    operation: OperationType,
    // biome-ignore lint/suspicious/noExplicitAny: dynamic resolver args
    args: any,
    // biome-ignore lint/suspicious/noExplicitAny: GraphQL context
    context: any,
    info: GraphQLResolveInfo,
    // biome-ignore lint/suspicious/noExplicitAny: dynamic resolver execute function
    execute: (args: any) => Promise<any>,
    // biome-ignore lint/suspicious/noExplicitAny: dynamic return type
  ): Promise<any> {
    const tableHooks = this.hooks[tableName] as TableHookConfig | undefined
    if (!tableHooks) return execute(args)

    const opHooks = tableHooks[operation]
    if (!opHooks) return execute(args)

    // If resolve hook exists, it completely replaces the resolver
    if ('resolve' in opHooks && opHooks.resolve) {
      const resolveFn = opHooks.resolve as ResolveHookFn
      // biome-ignore lint/suspicious/noExplicitAny: dynamic resolver args override
      const defaultResolve = (overrideArgs?: any) => execute(overrideArgs ?? args)
      return resolveFn({ args, context, info, defaultResolve })
    }

    // Otherwise, run before/after hooks
    let finalArgs = args
    // biome-ignore lint/suspicious/noExplicitAny: dynamic hook data
    let beforeData: any

    if ('before' in opHooks && opHooks.before) {
      const beforeResult: BeforeHookResult | undefined = await opHooks.before({
        args,
        context,
        info,
      })
      if (beforeResult) {
        if (beforeResult.args) finalArgs = beforeResult.args
        if (beforeResult.data) beforeData = beforeResult.data
      }
    }

    const result = await execute(finalArgs)

    if ('after' in opHooks && opHooks.after) {
      return opHooks.after({ result, beforeData, context, info })
    }

    return result
  }

  // ─── Utility ─────────────────────────────────────────────────

  private async executeCountQuery(table: Table, where?: SQL): Promise<number> {
    // biome-ignore lint/suspicious/noExplicitAny: Drizzle $count API access
    const db = this.db as any
    if (db.$count && typeof db.$count === 'function') {
      try {
        const result = where ? await db.$count(table, where) : await db.$count(table)
        return Number(result) || 0
      } catch (_) {
        // Fall back to manual count
      }
    }

    const query = this.db.select({ count: count() }).from(table as PgTable)
    const result = await (where ? query.where(where) : query)
    // biome-ignore lint/suspicious/noExplicitAny: dynamic query result access
    const value = (result as any)[0]?.count || 0
    return Number(value)
  }
}

const rqbCrashTypes = ['SQLiteBigInt', 'SQLiteBlobJson', 'SQLiteBlobBuffer']
