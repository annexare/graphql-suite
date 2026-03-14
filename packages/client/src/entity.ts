import {
  buildCountQuery,
  buildDeleteMutation,
  buildInsertMutation,
  buildListQuery,
  buildSingleQuery,
  buildUpdateMutation,
} from './query-builder'
import type {
  AnyEntityDefs,
  EntityDef,
  EntityDefsRef,
  EntityDescriptor,
  InferResult,
  SchemaDescriptor,
} from './types'

// ─── Helper: resolve entity def from ref + name ──────────────

type ResolveEntity<
  TRef extends EntityDefsRef<AnyEntityDefs>,
  TEntityName extends string,
> = TRef['__defs'][TEntityName] & EntityDef

// ─── EntityClient ────────────────────────────────────────────
// Interface (not type alias) so TS serializes it by name in declarations.
// Parameterized on TEntityName (string literal) instead of the full entity
// def type, so the serialized form is compact:
//   EntityClient<EntityDefsRef<InferEntityDefs<typeof schema, typeof config>>, "item">

export interface EntityClient<
  TRef extends EntityDefsRef<AnyEntityDefs>,
  TEntityName extends string,
> {
  query<S extends Record<string, unknown>>(params: {
    select: S
    where?: ResolveEntity<TRef, TEntityName> extends { filters: infer F } ? F : never
    limit?: number
    offset?: number
    orderBy?: ResolveEntity<TRef, TEntityName> extends { orderBy: infer O } ? O : never
  }): Promise<InferResult<TRef['__defs'], ResolveEntity<TRef, TEntityName>, S>[]>

  querySingle<S extends Record<string, unknown>>(params: {
    select: S
    where?: ResolveEntity<TRef, TEntityName> extends { filters: infer F } ? F : never
    offset?: number
    orderBy?: ResolveEntity<TRef, TEntityName> extends { orderBy: infer O } ? O : never
  }): Promise<InferResult<TRef['__defs'], ResolveEntity<TRef, TEntityName>, S> | null>

  count(params?: {
    where?: ResolveEntity<TRef, TEntityName> extends { filters: infer F } ? F : never
  }): Promise<number>

  insert<S extends Record<string, unknown>>(params: {
    values: ResolveEntity<TRef, TEntityName> extends { insertInput: infer I } ? I[] : never
    returning?: S
  }): Promise<InferResult<TRef['__defs'], ResolveEntity<TRef, TEntityName>, S>[]>

  insertSingle<S extends Record<string, unknown>>(params: {
    values: ResolveEntity<TRef, TEntityName> extends { insertInput: infer I } ? I : never
    returning?: S
  }): Promise<InferResult<TRef['__defs'], ResolveEntity<TRef, TEntityName>, S> | null>

  update<S extends Record<string, unknown>>(params: {
    set: ResolveEntity<TRef, TEntityName> extends { updateInput: infer U } ? U : never
    where?: ResolveEntity<TRef, TEntityName> extends { filters: infer F } ? F : never
    returning?: S
  }): Promise<InferResult<TRef['__defs'], ResolveEntity<TRef, TEntityName>, S>[]>

  delete<S extends Record<string, unknown>>(params: {
    where?: ResolveEntity<TRef, TEntityName> extends { filters: infer F } ? F : never
    returning?: S
  }): Promise<InferResult<TRef['__defs'], ResolveEntity<TRef, TEntityName>, S>[]>
}

// ─── Implementation ────────────────────────────────────────

export function createEntityClient<
  TRef extends EntityDefsRef<AnyEntityDefs>,
  TEntityName extends string,
>(
  entityName: string,
  entityDef: EntityDescriptor,
  schema: SchemaDescriptor,
  executeGraphQL: (
    query: string,
    variables: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>,
): EntityClient<TRef, TEntityName> {
  return {
    async query(params) {
      const { select, where, limit, offset, orderBy } = params
      const built = buildListQuery(
        entityName,
        entityDef,
        schema,
        select as Record<string, unknown>,
        where != null,
        orderBy != null,
        limit != null,
        offset != null,
      )

      const variables: Record<string, unknown> = {}
      if (where != null) variables.where = where
      if (orderBy != null) variables.orderBy = orderBy
      if (limit != null) variables.limit = limit
      if (offset != null) variables.offset = offset

      const data = await executeGraphQL(built.query, variables)
      // biome-ignore lint/suspicious/noExplicitAny: dynamic GraphQL response
      return data[entityDef.queryListName] as any
    },

    async querySingle(params) {
      const { select, where, offset, orderBy } = params
      const built = buildSingleQuery(
        entityName,
        entityDef,
        schema,
        select as Record<string, unknown>,
        where != null,
        orderBy != null,
        offset != null,
      )

      const variables: Record<string, unknown> = {}
      if (where != null) variables.where = where
      if (orderBy != null) variables.orderBy = orderBy
      if (offset != null) variables.offset = offset

      const data = await executeGraphQL(built.query, variables)
      // biome-ignore lint/suspicious/noExplicitAny: dynamic GraphQL response
      return (data[entityDef.queryName] as any) ?? null
    },

    async count(params) {
      const where = params?.where
      const built = buildCountQuery(entityName, entityDef, where != null)

      const variables: Record<string, unknown> = {}
      if (where != null) variables.where = where

      const data = await executeGraphQL(built.query, variables)
      return data[entityDef.countName] as number
    },

    async insert(params) {
      const { values, returning } = params
      const built = buildInsertMutation(
        entityName,
        entityDef,
        schema,
        returning as Record<string, unknown> | undefined,
        false,
      )

      const variables: Record<string, unknown> = { values }

      const data = await executeGraphQL(built.query, variables)
      // biome-ignore lint/suspicious/noExplicitAny: dynamic GraphQL response
      return data[entityDef.insertName] as any
    },

    async insertSingle(params) {
      const { values, returning } = params
      const built = buildInsertMutation(
        entityName,
        entityDef,
        schema,
        returning as Record<string, unknown> | undefined,
        true,
      )

      const variables: Record<string, unknown> = { values }

      const data = await executeGraphQL(built.query, variables)
      // biome-ignore lint/suspicious/noExplicitAny: dynamic GraphQL response
      return (data[entityDef.insertSingleName] as any) ?? null
    },

    async update(params) {
      const { set, where, returning } = params
      const built = buildUpdateMutation(
        entityName,
        entityDef,
        schema,
        returning as Record<string, unknown> | undefined,
        where != null,
      )

      const variables: Record<string, unknown> = { set }
      if (where != null) variables.where = where

      const data = await executeGraphQL(built.query, variables)
      // biome-ignore lint/suspicious/noExplicitAny: dynamic GraphQL response
      return data[entityDef.updateName] as any
    },

    async delete(params) {
      const { where, returning } = params
      const built = buildDeleteMutation(
        entityName,
        entityDef,
        schema,
        returning as Record<string, unknown> | undefined,
        where != null,
      )

      const variables: Record<string, unknown> = {}
      if (where != null) variables.where = where

      const data = await executeGraphQL(built.query, variables)
      // biome-ignore lint/suspicious/noExplicitAny: dynamic GraphQL response
      return data[entityDef.deleteName] as any
    },
  }
}
