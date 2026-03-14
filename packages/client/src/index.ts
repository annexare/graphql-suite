import { GraphQLClient } from './client'
import type { AnyEntityDefs, ClientConfig, SchemaDescriptor } from './types'

export function createClient<
  TSchema extends SchemaDescriptor,
  TDefs extends AnyEntityDefs = AnyEntityDefs,
>(config: ClientConfig<TSchema>): GraphQLClient<TSchema, TDefs> {
  return new GraphQLClient<TSchema, TDefs>(config)
}

export type { BuildSchemaConfig } from '@drizzle-graphql-suite/schema'

export type { DrizzleClientConfig } from './client'
export { createDrizzleClient, GraphQLClient } from './client'
export type { EntityClient } from './entity'
export { GraphQLClientError, NetworkError } from './errors'
export type { InferEntityDefs } from './infer'
export { buildSchemaDescriptor } from './schema-builder'
export type {
  AnyEntityDefs,
  ClientConfig,
  EntityDef,
  EntityDefsRef,
  EntityDescriptor,
  InferResult,
  SchemaDescriptor,
  SelectInput,
} from './types'
