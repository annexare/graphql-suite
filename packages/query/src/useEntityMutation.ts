import type {
  AnyEntityDefs,
  EntityClient,
  EntityDef,
  EntityDefsRef,
  InferResult,
} from '@graphql-suite/client'
import { type UseMutationResult, useMutation, useQueryClient } from '@tanstack/react-query'

// ─── Insert ────────────────────────────────────────────────

type InsertOptions<TResult> = {
  invalidate?: boolean
  invalidateKey?: unknown[]
  onSuccess?: (data: TResult) => void
  onError?: (error: Error) => void
}

export function useEntityInsert<
  TDefs extends AnyEntityDefs,
  TEntityName extends string,
  TSelect extends Record<string, unknown>,
>(
  entity: EntityClient<EntityDefsRef<TDefs>, TEntityName>,
  returning?: TSelect,
  options?: InsertOptions<InferResult<TDefs, TDefs[TEntityName] & EntityDef, TSelect>[]>,
): UseMutationResult<
  InferResult<TDefs, TDefs[TEntityName] & EntityDef, TSelect>[],
  Error,
  {
    values: TDefs[TEntityName] & EntityDef extends { insertInput: infer I } ? I[] : never
  }
> {
  const queryClient = useQueryClient()
  const shouldInvalidate = options?.invalidate !== false

  return useMutation({
    mutationFn: async (params) => {
      // biome-ignore lint/suspicious/noExplicitAny: generic entity params
      return (await entity.insert({ ...params, returning } as any)) as InferResult<
        TDefs,
        TDefs[TEntityName] & EntityDef,
        TSelect
      >[]
    },
    onSuccess: (data) => {
      if (shouldInvalidate) {
        const key = options?.invalidateKey ?? ['gql']
        queryClient.invalidateQueries({ queryKey: key })
      }
      options?.onSuccess?.(data)
    },
    onError: options?.onError,
  })
}

// ─── Update ────────────────────────────────────────────────

type UpdateParams<TEntity extends EntityDef> = {
  set: TEntity extends { updateInput: infer U } ? U : never
  where?: TEntity extends { filters: infer F } ? F : never
}

type UpdateOptions<TResult> = {
  invalidate?: boolean
  invalidateKey?: unknown[]
  onSuccess?: (data: TResult) => void
  onError?: (error: Error) => void
}

export function useEntityUpdate<
  TDefs extends AnyEntityDefs,
  TEntityName extends string,
  TSelect extends Record<string, unknown>,
>(
  entity: EntityClient<EntityDefsRef<TDefs>, TEntityName>,
  returning?: TSelect,
  options?: UpdateOptions<InferResult<TDefs, TDefs[TEntityName] & EntityDef, TSelect>[]>,
): UseMutationResult<
  InferResult<TDefs, TDefs[TEntityName] & EntityDef, TSelect>[],
  Error,
  UpdateParams<TDefs[TEntityName] & EntityDef>
> {
  const queryClient = useQueryClient()
  const shouldInvalidate = options?.invalidate !== false

  return useMutation({
    mutationFn: async (params) => {
      // biome-ignore lint/suspicious/noExplicitAny: generic entity params
      return (await entity.update({ ...params, returning } as any)) as InferResult<
        TDefs,
        TDefs[TEntityName] & EntityDef,
        TSelect
      >[]
    },
    onSuccess: (data) => {
      if (shouldInvalidate) {
        const key = options?.invalidateKey ?? ['gql']
        queryClient.invalidateQueries({ queryKey: key })
      }
      options?.onSuccess?.(data)
    },
    onError: options?.onError,
  })
}

// ─── Delete ────────────────────────────────────────────────

type DeleteParams<TEntity extends EntityDef> = {
  where?: TEntity extends { filters: infer F } ? F : never
}

type DeleteOptions<TResult> = {
  invalidate?: boolean
  invalidateKey?: unknown[]
  onSuccess?: (data: TResult) => void
  onError?: (error: Error) => void
}

export function useEntityDelete<
  TDefs extends AnyEntityDefs,
  TEntityName extends string,
  TSelect extends Record<string, unknown>,
>(
  entity: EntityClient<EntityDefsRef<TDefs>, TEntityName>,
  returning?: TSelect,
  options?: DeleteOptions<InferResult<TDefs, TDefs[TEntityName] & EntityDef, TSelect>[]>,
): UseMutationResult<
  InferResult<TDefs, TDefs[TEntityName] & EntityDef, TSelect>[],
  Error,
  DeleteParams<TDefs[TEntityName] & EntityDef>
> {
  const queryClient = useQueryClient()
  const shouldInvalidate = options?.invalidate !== false

  return useMutation({
    mutationFn: async (params) => {
      // biome-ignore lint/suspicious/noExplicitAny: generic entity params
      return (await entity.delete({ ...params, returning } as any)) as InferResult<
        TDefs,
        TDefs[TEntityName] & EntityDef,
        TSelect
      >[]
    },
    onSuccess: (data) => {
      if (shouldInvalidate) {
        const key = options?.invalidateKey ?? ['gql']
        queryClient.invalidateQueries({ queryKey: key })
      }
      options?.onSuccess?.(data)
    },
    onError: options?.onError,
  })
}
