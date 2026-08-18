import { createTableRelationsHelpers, extractTablesRelationalConfig } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import type { GraphQLSchema } from 'graphql'

import { SchemaBuilder } from './schema-builder'
import type { BuildSchemaConfig, GeneratedEntities, PermissionConfig } from './types'

export type { FieldsByTypeName, ResolveTree } from './graphql/resolve-info'
export { parseResolveInfo } from './graphql/resolve-info'
export { GraphQLJSON } from './graphql/scalars'

export const buildSchema = (
  // biome-ignore lint/suspicious/noExplicitAny: Drizzle generic parameters
  db: PgDatabase<any, any, any>,
  config?: BuildSchemaConfig,
): {
  schema: GraphQLSchema
  entities: GeneratedEntities
  withPermissions: (permissions: PermissionConfig) => GraphQLSchema
  clearPermissionCache: (id?: string) => void
} => {
  const builder = new SchemaBuilder(db, config)
  return builder.build()
}

export const buildEntities = (
  // biome-ignore lint/suspicious/noExplicitAny: Drizzle generic parameters
  db: PgDatabase<any, any, any>,
  config?: BuildSchemaConfig,
): GeneratedEntities => {
  const builder = new SchemaBuilder(db, config)
  return builder.buildEntities()
}

/**
 * Build a GraphQL schema directly from Drizzle schema exports — no database
 * connection or `.env` required. Creates a lightweight mock db instance that
 * satisfies `SchemaBuilder`'s metadata needs (table definitions, relations,
 * table name mapping) without an actual connection.
 *
 * Resolver functions on the returned entities are stubs — this is intended
 * for schema introspection and code generation, not query execution.
 */
export const buildSchemaFromDrizzle = (
  drizzleSchema: Record<string, unknown>,
  config?: BuildSchemaConfig,
): {
  schema: GraphQLSchema
  entities: GeneratedEntities
  withPermissions: (permissions: PermissionConfig) => GraphQLSchema
  clearPermissionCache: (id?: string) => void
} => {
  const { tables, tableNamesMap } = extractTablesRelationalConfig(
    drizzleSchema,
    createTableRelationsHelpers,
  )

  // Build a stub that satisfies SchemaBuilder's db access patterns:
  //  - db._.fullSchema / db._.schema / db._.tableNamesMap (metadata, used in constructor)
  //  - db.query[table].findMany/findFirst (used in resolver creation — stubs are fine)
  //  - db.select().from().where() (used in count resolver — stub is fine)
  // Use schema keys (e.g. 'assetType') not SQL names (e.g. 'public.assetType')
  const schemaKeys = Object.keys(tables)
  const findStub = {
    findMany: () => Promise.resolve([]),
    findFirst: () => Promise.resolve(null),
  }
  const query = Object.fromEntries(schemaKeys.map((name) => [name, findStub]))

  const mockDb = {
    _: { fullSchema: drizzleSchema, schema: tables, tableNamesMap },
    query,
    select: () => ({ from: () => ({ where: () => ({}) }) }),
  }

  // biome-ignore lint/suspicious/noExplicitAny: mock db satisfies SchemaBuilder's runtime needs
  const builder = new SchemaBuilder(mockDb as any, config)
  return builder.build()
}

export type { CodegenOptions } from './codegen'
export { generateEntityDefs, generateSDL, generateTypes } from './codegen'
export { permissive, readOnly, restricted } from './permissions'
export { mergeHooks, withRowSecurity } from './row-security'
export { SchemaBuilder } from './schema-builder'
export * from './types'
