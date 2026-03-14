import type {
  AnyEntityDefs,
  EntityClient,
  EntityDefsRef,
  SchemaDescriptor,
} from '@drizzle-graphql-suite/client'
import { useMemo } from 'react'

import { useGraphQLClient } from './provider'

export function useEntity<
  TSchema extends SchemaDescriptor,
  TDefs extends AnyEntityDefs,
  TEntityName extends string & keyof TSchema & keyof TDefs,
>(entityName: TEntityName): EntityClient<EntityDefsRef<TDefs>, TEntityName> {
  const client = useGraphQLClient<TSchema, TDefs>()
  // biome-ignore lint/suspicious/noExplicitAny: entity() handles type inference
  return useMemo(() => client.entity(entityName) as any, [client, entityName])
}
