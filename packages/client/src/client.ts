import type { BuildSchemaConfig } from '@drizzle-graphql-suite/schema'

import { createEntityClient, type EntityClient } from './entity'
import { GraphQLClientError, NetworkError } from './errors'
import type { InferEntityDefs } from './infer'
import { buildSchemaDescriptor } from './schema-builder'
import type { AnyEntityDefs, ClientConfig, EntityDefsRef, SchemaDescriptor } from './types'

export class GraphQLClient<
  TSchema extends SchemaDescriptor,
  TDefs extends AnyEntityDefs = AnyEntityDefs,
> {
  private url: string | (() => string)
  private schema: TSchema
  private headers?: HeadersInit | (() => HeadersInit | Promise<HeadersInit>)

  constructor(config: ClientConfig<TSchema>) {
    this.url = config.url
    this.schema = config.schema
    this.headers = config.headers
  }

  entity<TEntityName extends string & keyof TSchema & keyof TDefs>(
    entityName: TEntityName,
  ): EntityClient<EntityDefsRef<TDefs>, TEntityName> {
    const entityDef = this.schema[entityName]
    if (!entityDef) {
      throw new Error(`Entity '${entityName}' not found in schema`)
    }

    // biome-ignore lint/suspicious/noExplicitAny: type inference handled at call site
    return createEntityClient<any, any>(entityName, entityDef, this.schema, (query, variables) =>
      this.execute(query, variables),
    ) as unknown as EntityClient<EntityDefsRef<TDefs>, TEntityName>
  }

  async execute(
    query: string,
    variables: Record<string, unknown> = {},
  ): Promise<Record<string, unknown>> {
    const url = typeof this.url === 'function' ? this.url() : this.url
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...(typeof this.headers === 'function' ? await this.headers() : (this.headers ?? {})),
    }

    let response: Response
    try {
      response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ query, variables }),
      })
    } catch (e) {
      throw new NetworkError(e instanceof Error ? e.message : 'Network request failed', 0)
    }

    if (!response.ok) {
      throw new NetworkError(`HTTP ${response.status}: ${response.statusText}`, response.status)
    }

    const json = (await response.json()) as {
      data?: Record<string, unknown>
      errors?: Array<{
        message: string
        locations?: Array<{ line: number; column: number }>
        path?: (string | number)[]
      }>
    }

    if (json.errors?.length) {
      throw new GraphQLClientError(json.errors, response.status)
    }

    if (!json.data) {
      throw new GraphQLClientError([{ message: 'No data in response' }], response.status)
    }

    return json.data
  }
}

// ─── Drizzle-aware Factory ────────────────────────────────

export type DrizzleClientConfig<
  TSchema extends Record<string, unknown>,
  TConfig extends BuildSchemaConfig,
> = {
  schema: TSchema
  config: TConfig
  url: string | (() => string)
  headers?: HeadersInit | (() => HeadersInit | Promise<HeadersInit>)
}

export function createDrizzleClient<
  TSchema extends Record<string, unknown>,
  const TConfig extends BuildSchemaConfig,
>(
  options: DrizzleClientConfig<TSchema, TConfig>,
): GraphQLClient<SchemaDescriptor, InferEntityDefs<TSchema, TConfig>> {
  const schema = buildSchemaDescriptor(options.schema, options.config)
  return new GraphQLClient<SchemaDescriptor, InferEntityDefs<TSchema, TConfig>>({
    url: options.url,
    schema,
    headers: options.headers,
  })
}
