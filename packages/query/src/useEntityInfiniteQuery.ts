import type {
  AnyEntityDefs,
  EntityClient,
  EntityDef,
  EntityDefsRef,
  InferResult,
} from '@graphql-suite/client'
import { type UseInfiniteQueryResult, useInfiniteQuery } from '@tanstack/react-query'

type EntityInfiniteParams<TEntity extends EntityDef, TSelect extends Record<string, unknown>> = {
  select: TSelect
  where?: TEntity extends { filters: infer F } ? F : never
  pageSize: number
  orderBy?: TEntity extends { orderBy: infer O } ? O : never
}

type EntityInfiniteOptions = {
  enabled?: boolean
  gcTime?: number
  staleTime?: number
  queryKey?: unknown[]
}

type PageData<T> = {
  items: T[]
  count: number
}

export function useEntityInfiniteQuery<
  TDefs extends AnyEntityDefs,
  TEntityName extends string,
  TSelect extends Record<string, unknown>,
>(
  entity: EntityClient<EntityDefsRef<TDefs>, TEntityName>,
  params: EntityInfiniteParams<TDefs[TEntityName] & EntityDef, TSelect>,
  options?: EntityInfiniteOptions,
): UseInfiniteQueryResult<{
  pages: PageData<InferResult<TDefs, TDefs[TEntityName] & EntityDef, TSelect>>[]
}> {
  const queryKey = options?.queryKey ?? [
    'gql',
    'infinite',
    params.select,
    params.where,
    params.orderBy,
    params.pageSize,
  ]

  return useInfiniteQuery<
    PageData<InferResult<TDefs, TDefs[TEntityName] & EntityDef, TSelect>>,
    Error,
    // biome-ignore lint/suspicious/noExplicitAny: TanStack infinite query generic params
    any,
    unknown[],
    number
  >({
    queryKey,
    initialPageParam: 0,
    queryFn: async ({ pageParam = 0 }) => {
      const queryParams = {
        ...params,
        limit: params.pageSize,
        offset: pageParam * params.pageSize,
      }

      // biome-ignore lint/suspicious/noExplicitAny: generic entity params
      const items = await entity.query(queryParams as any)

      // biome-ignore lint/suspicious/noExplicitAny: generic entity params
      const count = await entity.count({ where: params.where } as any)

      return {
        items: items as InferResult<TDefs, TDefs[TEntityName] & EntityDef, TSelect>[],
        count,
      }
    },
    getNextPageParam: (lastPage, allPages) => {
      const totalFetched = allPages.length * params.pageSize
      return totalFetched < lastPage.count ? allPages.length : undefined
    },
    enabled: options?.enabled,
    gcTime: options?.gcTime,
    staleTime: options?.staleTime,
  })
}
