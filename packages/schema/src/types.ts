import type {
  GraphQLFieldConfig,
  GraphQLInputObjectType,
  GraphQLObjectType,
  GraphQLResolveInfo,
} from 'graphql'

// ─── Generated Entities ──────────────────────────────────────

export type GeneratedEntities = {
  // biome-ignore lint/suspicious/noExplicitAny: matches GraphQL's own GraphQLFieldConfig signature
  queries: Record<string, GraphQLFieldConfig<any, any>>
  // biome-ignore lint/suspicious/noExplicitAny: matches GraphQL's own GraphQLFieldConfig signature
  mutations: Record<string, GraphQLFieldConfig<any, any>>
  inputs: Record<string, GraphQLInputObjectType>
  types: Record<string, GraphQLObjectType>
}

// ─── Hook Types ──────────────────────────────────────────────

export type OperationType =
  | 'query'
  | 'querySingle'
  | 'count'
  | 'insert'
  | 'insertSingle'
  | 'update'
  | 'delete'

export type HookContext = {
  // biome-ignore lint/suspicious/noExplicitAny: consumer-facing loose type
  args: any
  // biome-ignore lint/suspicious/noExplicitAny: consumer-facing loose type
  context: any
  info: GraphQLResolveInfo
}

export type BeforeHookResult = {
  // biome-ignore lint/suspicious/noExplicitAny: consumer-facing loose type
  args?: any
  // biome-ignore lint/suspicious/noExplicitAny: consumer-facing loose type
  data?: any
}

export type BeforeHookFn = (
  ctx: HookContext,
) => Promise<BeforeHookResult | undefined> | BeforeHookResult | undefined

export type AfterHookContext = {
  // biome-ignore lint/suspicious/noExplicitAny: consumer-facing loose type
  result: any
  // biome-ignore lint/suspicious/noExplicitAny: consumer-facing loose type
  beforeData: any
  // biome-ignore lint/suspicious/noExplicitAny: consumer-facing loose type
  context: any
  info: GraphQLResolveInfo
}

// biome-ignore lint/suspicious/noExplicitAny: consumer-facing loose type
export type AfterHookFn = (ctx: AfterHookContext) => Promise<any> | any

export type ResolveHookContext = HookContext & {
  // biome-ignore lint/suspicious/noExplicitAny: consumer-facing loose type
  defaultResolve: (overrideArgs?: any) => Promise<any>
}

// biome-ignore lint/suspicious/noExplicitAny: consumer-facing loose type
export type ResolveHookFn = (ctx: ResolveHookContext) => Promise<any> | any

export type OperationHooks =
  | {
      before?: BeforeHookFn
      after?: AfterHookFn
    }
  | {
      resolve: ResolveHookFn
    }

export type TableHookConfig = {
  [K in OperationType]?: OperationHooks
}

export type HooksConfig = {
  [tableName: string]: TableHookConfig
}

// ─── Permission Types ───────────────────────────────────────

export type TableAccess = {
  query?: boolean
  insert?: boolean
  update?: boolean
  delete?: boolean
}

export type PermissionConfig = {
  id: string
  mode: 'permissive' | 'restricted'
  tables?: Record<string, boolean | TableAccess>
}

// ─── Table Config Types ─────────────────────────────────────

export type TableOperations = {
  /** Generate query operations (list, single, count). @default true */
  queries?: boolean
  /** Generate mutation operations (insert, insertSingle, update, delete). @default follows global `mutations` */
  mutations?: boolean
}

// ─── Relation Pruning ───────────────────────────────────────

/**
 * Controls how a specific relation expands in the schema.
 * - `false`: relation field omitted entirely from parent type
 * - `'leaf'`: relation expands with scalar columns only (no child relations)
 * - `{ only: string[] }`: relation expands with only the listed child relation fields
 */
export type RelationPruneRule = false | 'leaf' | { only: string[] }

// ─── Build Schema Config ─────────────────────────────────────

/**
 * Configuration for both the GraphQL schema builder (server) and the
 * type-safe client. Shared across `drizzle-graphql-suite/schema` and
 * `drizzle-graphql-suite/client` so a single config object drives both
 * the runtime schema and the inferred TypeScript types.
 *
 * @example
 * ```ts
 * const config = {
 *   mutations: true,
 *   limitRelationDepth: 5,
 *   limitSelfRelationDepth: 2,
 *   suffixes: { list: 's', single: '' },
 *   tables: { exclude: ['session', 'account'] },
 *   pruneRelations: {
 *     'asset.childAssets': false,
 *     'override.asset': 'leaf',
 *     'attribute.asset': { only: ['selectedVariant'] },
 *   },
 * } as const satisfies BuildSchemaConfig
 * ```
 */
export type BuildSchemaConfig = {
  /**
   * Whether to generate GraphQL mutation operations (insert, update, delete).
   * Set to `false` for a read-only schema.
   * On the client side, controls whether mutation helpers are generated.
   * @default true
   */
  mutations?: boolean
  /**
   * Maximum depth for expanding relation fields in the generated schema
   * and in client-side filter types (`InferEntityFilters`).
   *
   * - **Server**: limits how many levels of nested relations appear in
   *   GraphQL object types. `undefined` means no limit.
   * - **Client**: limits recursive relation filter type expansion to
   *   prevent TS7056 on circular schemas. Capped at 5.
   *
   * Set to `0` to omit relations altogether.
   *
   * @example
   * ```ts
   * // Allow up to 5 levels of nesting
   * { limitRelationDepth: 5 }
   * ```
   * @default 3 (server) / 1 (client filter types)
   */
  limitRelationDepth?: number
  /**
   * Max occurrences of the same table via direct self-relations in a
   * single type path. Only applies to relations where source and target
   * table are identical (e.g., `asset.parent → asset`).
   *
   * - `1` = self-relation fields are omitted entirely
   * - `2` = one level of self-relation expansion (the nested type has
   *   no further self-relation fields)
   *
   * Cross-table cycles that revisit a table are governed by
   * `limitRelationDepth` instead.
   *
   * @example
   * ```ts
   * // category.parent → category (expanded), but nested category
   * // won't have parent/children fields
   * { limitSelfRelationDepth: 2 }
   * ```
   * @default 1
   */
  limitSelfRelationDepth?: number
  /**
   * Customizes the suffixes appended to auto-generated query names.
   *
   * Given a table named `asset`:
   * - List query: `asset` + `list` suffix → e.g. `"assets"` or `"assetList"`
   * - Single query: `asset` + `single` suffix → e.g. `"asset"` or `"assetSingle"`
   *
   * @example
   * ```ts
   * // "assets" / "asset" (pluralize list, no suffix for single)
   * { suffixes: { list: 's', single: '' } }
   *
   * // "assetList" / "assetSingle" (explicit suffixes)
   * { suffixes: { list: 'List', single: 'Single' } }
   * ```
   * @default { list: '', single: 'Single' }
   *
   * TODO: Consider adding Intl.PluralRules-based pluralization as an alternative
   * to simple suffix appending (e.g., `category` → `categories` instead of `categorys`).
   */
  suffixes?: {
    list?: string
    single?: string
  }
  /**
   * Per-table lifecycle hooks for queries and mutations.
   * Keys are table names as they appear in the Drizzle schema object.
   *
   * **Server-only** — hooks are executed during GraphQL resolution and have
   * no effect on the client package. The client imports `BuildSchemaConfig`
   * for type-level inference only (`limitRelationDepth`, `tables`, etc.)
   * and ignores `hooks` entirely.
   *
   * @example
   * ```ts
   * {
   *   hooks: {
   *     asset: {
   *       query: { before: (ctx) => { ... } },
   *       insert: { after: (ctx, result) => { ... } },
   *     },
   *   },
   * }
   * ```
   */
  hooks?: HooksConfig
  /**
   * Per-table configuration: exclude tables entirely or limit which
   * operations are generated per table.
   *
   * Table names must match the keys in the Drizzle schema object.
   *
   * @example
   * ```ts
   * {
   *   tables: {
   *     // Remove auth tables from the GraphQL schema
   *     exclude: ['session', 'account', 'verification'],
   *     // Make 'auditLog' read-only
   *     config: { auditLog: { queries: true, mutations: false } },
   *   },
   * }
   * ```
   */
  tables?: {
    /** Tables to completely exclude (no types, no operations, relations to them skipped). */
    exclude?: readonly string[]
    /** Per-table operation overrides. Tables not listed get default behavior. */
    config?: Record<string, TableOperations>
  }
  /**
   * Fine-grained per-relation pruning rules that control how each
   * relation expands in the generated schema.
   *
   * **Server-only** — pruning shapes the generated GraphQL schema.
   * The client builds queries from the schema descriptor, which already
   * reflects pruning (pruned relations are absent), so the client
   * cannot generate queries for pruned fields.
   *
   * Keys use `tableName.relationName` format. Values:
   * - `false` — relation field is omitted entirely from the parent type
   * - `'leaf'` — relation expands with scalar columns only (no nested relations)
   * - `{ only: string[] }` — relation expands with only the listed child relations
   *
   * @example
   * ```ts
   * {
   *   pruneRelations: {
   *     // Remove back-reference completely
   *     'assetType.assets': false,
   *     // Show override.asset but don't expand its relations
   *     'override.asset': 'leaf',
   *     // Only keep selectedVariant on attribute.asset
   *     'attribute.asset': { only: ['selectedVariant'] },
   *   },
   * }
   * ```
   */
  pruneRelations?: Record<string, RelationPruneRule>
  /**
   * Enable debug logging for schema diagnostics (server-side only).
   *
   * - `true` — logs SDL byte size and type count
   * - `{ schemaSize?: boolean; relationTree?: boolean }` — selective logging
   *
   * @example
   * ```ts
   * // Log everything
   * { debug: true }
   *
   * // Only log the relation expansion tree
   * { debug: { relationTree: true } }
   * ```
   */
  debug?: boolean | { schemaSize?: boolean; relationTree?: boolean }
}
