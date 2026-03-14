import type {
  AnyEntityDefs,
  EntityClient,
  EntityDef,
  EntityDefsRef,
  InferResult,
} from '@drizzle-graphql-suite/client'
import { type UseQueryResult, useQuery } from '@tanstack/react-query'

type EntityQueryParams<TEntity extends EntityDef, TSelect extends Record<string, unknown>> = {
  select: TSelect
  where?: TEntity extends { filters: infer F } ? F : never
  offset?: number
  orderBy?: TEntity extends { orderBy: infer O } ? O : never
}

type EntityQueryOptions = {
  enabled?: boolean
  gcTime?: number
  staleTime?: number
  refetchOnWindowFocus?: boolean
  queryKey?: unknown[]
}

export function useEntityQuery<
  TDefs extends AnyEntityDefs,
  TEntityName extends string,
  TSelect extends Record<string, unknown>,
>(
  entity: EntityClient<EntityDefsRef<TDefs>, TEntityName>,
  params: EntityQueryParams<TDefs[TEntityName] & EntityDef, TSelect>,
  options?: EntityQueryOptions,
): UseQueryResult<InferResult<TDefs, TDefs[TEntityName] & EntityDef, TSelect> | null> {
  const queryKey = options?.queryKey ?? [
    'gql',
    'single',
    params.select,
    params.where,
    params.orderBy,
    params.offset,
  ]

  return useQuery({
    queryKey,
    queryFn: async () => {
      // biome-ignore lint/suspicious/noExplicitAny: generic entity params
      return (await entity.querySingle(params as any)) as InferResult<
        TDefs,
        TDefs[TEntityName] & EntityDef,
        TSelect
      > | null
    },
    enabled: options?.enabled,
    gcTime: options?.gcTime,
    staleTime: options?.staleTime,
    refetchOnWindowFocus: options?.refetchOnWindowFocus,
  })
}
