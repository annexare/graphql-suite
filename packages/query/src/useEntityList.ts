import type {
  AnyEntityDefs,
  EntityClient,
  EntityDef,
  EntityDefsRef,
  InferResult,
} from '@graphql-suite/client'
import { type UseQueryResult, useQuery } from '@tanstack/react-query'

type EntityListParams<TEntity extends EntityDef, TSelect extends Record<string, unknown>> = {
  select: TSelect
  where?: TEntity extends { filters: infer F } ? F : never
  limit?: number
  offset?: number
  orderBy?: TEntity extends { orderBy: infer O } ? O : never
}

type EntityListOptions = {
  enabled?: boolean
  gcTime?: number
  staleTime?: number
  refetchOnWindowFocus?: boolean
  queryKey?: unknown[]
}

export function useEntityList<
  TDefs extends AnyEntityDefs,
  TEntityName extends string,
  TSelect extends Record<string, unknown>,
>(
  entity: EntityClient<EntityDefsRef<TDefs>, TEntityName>,
  params: EntityListParams<TDefs[TEntityName] & EntityDef, TSelect>,
  options?: EntityListOptions,
): UseQueryResult<InferResult<TDefs, TDefs[TEntityName] & EntityDef, TSelect>[]> {
  const queryKey = options?.queryKey ?? [
    'gql',
    'list',
    params.select,
    params.where,
    params.orderBy,
    params.limit,
    params.offset,
  ]

  return useQuery({
    queryKey,
    queryFn: async () => {
      // biome-ignore lint/suspicious/noExplicitAny: generic entity params
      return (await entity.query(params as any)) as InferResult<
        TDefs,
        TDefs[TEntityName] & EntityDef,
        TSelect
      >[]
    },
    enabled: options?.enabled,
    gcTime: options?.gcTime,
    staleTime: options?.staleTime,
    refetchOnWindowFocus: options?.refetchOnWindowFocus,
  })
}
