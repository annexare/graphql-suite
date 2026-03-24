'use client'

import type { AnyEntityDefs, GraphQLClient, SchemaDescriptor } from '@graphql-suite/client'
import { createContext, type ReactNode, useContext } from 'react'

// biome-ignore lint/suspicious/noExplicitAny: context default is null, typed at consumption site
const GraphQLClientContext = createContext<GraphQLClient<any, any> | null>(null)

export function GraphQLProvider<TSchema extends SchemaDescriptor, TDefs extends AnyEntityDefs>({
  client,
  children,
}: {
  client: GraphQLClient<TSchema, TDefs>
  children: ReactNode
}) {
  return <GraphQLClientContext.Provider value={client}>{children}</GraphQLClientContext.Provider>
}

export function useGraphQLClient<
  TSchema extends SchemaDescriptor = SchemaDescriptor,
  TDefs extends AnyEntityDefs = AnyEntityDefs,
>(): GraphQLClient<TSchema, TDefs> {
  const client = useContext(GraphQLClientContext)
  if (!client) {
    throw new Error('useGraphQLClient must be used within a <GraphQLProvider>')
  }
  // biome-ignore lint/suspicious/noExplicitAny: consumer provides concrete types
  return client as any
}
