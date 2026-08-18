import type {
  GraphQLCompositeType,
  GraphQLField,
  GraphQLResolveInfo,
  NamedTypeNode,
  SelectionNode,
} from 'graphql'
import {
  GraphQLIncludeDirective,
  GraphQLSkipDirective,
  getArgumentValues,
  getDirectiveValues,
  getNamedType,
  isCompositeType,
  isUnionType,
  Kind,
} from 'graphql'

// ─── Public Types ────────────────────────────────────────────

/** Selected sub-fields of a field, grouped by the type they were selected on. */
export type FieldsByTypeName = Record<string, Record<string, ResolveTree>>

/**
 * A field of a GraphQL query, with its coerced arguments and the sub-selection
 * it requested. Mirrors the shape produced by `graphql-parse-resolve-info`.
 */
export type ResolveTree = {
  /** Field name as defined in the schema. */
  name: string
  /** Response key — the alias when one is given, otherwise the field name. */
  alias: string
  /** Coerced argument values, with variables and defaults already applied. */
  args: Record<string, unknown>
  /** Sub-selection, keyed by the type name it was selected on. */
  fieldsByTypeName: FieldsByTypeName
}

// ─── Public API ──────────────────────────────────────────────

/**
 * A map keyed by names the client controls — response keys and type names.
 * Null-prototype, because `__proto__` and `constructor` are legal GraphQL
 * aliases: on a plain object the first silently rewires the prototype and the
 * second reads back `Object`, so a valid query would lose a column or crash.
 */
const record = <T>(): Record<string, T> => Object.create(null)

/**
 * Build a selection tree for the field currently being resolved.
 *
 * Replaces `graphql-parse-resolve-info`, which is pinned to graphql 16 and
 * reaches into `graphql/execution/values` — a path graphql 17 no longer
 * exposes. This implementation uses only root exports of `graphql`, so a
 * single copy of the library serves both v16 and v17.
 *
 * Returns `null` when `info` carries no usable field node.
 */
export const parseResolveInfo = (info: GraphQLResolveInfo): ResolveTree | null => {
  const { fieldNodes, parentType } = info
  if (!fieldNodes?.length) return null

  const tree = record<Record<string, ResolveTree>>()
  collectFields(fieldNodes, info, tree, parentType)

  // `collectFields` files the executing field under its parent type; there is
  // exactly one, since every node in `fieldNodes` shares a response key.
  const fields = Object.values(tree[parentType.name] ?? {})
  return fields[0] ?? null
}

// ─── Helpers ─────────────────────────────────────────────────

/**
 * Walk a selection set, adding every selected field into `tree` under the name
 * of the type it was selected on. Fragments are inlined against their type
 * condition, so a field selected through a fragment lands under the fragment's
 * type rather than the enclosing one — matching how GraphQL resolves it.
 */
const collectFields = (
  selections: readonly SelectionNode[],
  info: GraphQLResolveInfo,
  tree: FieldsByTypeName,
  parentType: GraphQLCompositeType,
): void => {
  const typeName = parentType.name
  let fields = tree[typeName]
  if (!fields) {
    fields = record<ResolveTree>()
    tree[typeName] = fields
  }

  for (const selection of selections) {
    if (isSkipped(selection, info)) continue

    switch (selection.kind) {
      case Kind.FIELD: {
        const name = selection.name.value
        // Introspection meta-fields (`__typename`, `__schema`, `__type`) are not
        // schema fields and never map to a column or relation.
        if (name.startsWith('__')) continue

        const fieldDef = getFieldDef(parentType, name)
        if (!fieldDef) continue

        const fieldType = getNamedType(fieldDef.type)
        const alias = selection.alias?.value ?? name

        let node = fields[alias]
        if (!node) {
          const fieldsByTypeName = record<Record<string, ResolveTree>>()
          if (isCompositeType(fieldType)) fieldsByTypeName[fieldType.name] = record<ResolveTree>()

          node = {
            name,
            alias,
            args: getArgumentValues(fieldDef, selection, info.variableValues),
            fieldsByTypeName,
          }
          fields[alias] = node
        }

        if (selection.selectionSet && isCompositeType(fieldType)) {
          collectFields(selection.selectionSet.selections, info, node.fieldsByTypeName, fieldType)
        }
        break
      }

      case Kind.FRAGMENT_SPREAD: {
        const fragment = info.fragments[selection.name.value]
        if (!fragment) continue

        const fragmentType = resolveTypeCondition(info, fragment.typeCondition) ?? parentType
        if (isCompositeType(fragmentType)) {
          collectFields(fragment.selectionSet.selections, info, tree, fragmentType)
        }
        break
      }

      case Kind.INLINE_FRAGMENT: {
        const fragmentType = selection.typeCondition
          ? resolveTypeCondition(info, selection.typeCondition)
          : parentType
        if (fragmentType && isCompositeType(fragmentType)) {
          collectFields(selection.selectionSet.selections, info, tree, fragmentType)
        }
        break
      }
    }
  }
}

/** `@skip(if: true)` and `@include(if: false)` remove a selection. */
const isSkipped = (selection: SelectionNode, info: GraphQLResolveInfo): boolean => {
  if (!selection.directives?.length) return false

  const skip = getDirectiveValues(GraphQLSkipDirective, selection, info.variableValues)
  if (skip?.if === true) return true

  const include = getDirectiveValues(GraphQLIncludeDirective, selection, info.variableValues)
  return include?.if === false
}

const getFieldDef = (
  parentType: GraphQLCompositeType,
  name: string,
  // biome-ignore lint/suspicious/noExplicitAny: GraphQLField generics differ between graphql 16 and 17
): GraphQLField<any, any> | undefined => {
  // Union members carry no fields of their own; only fragments against a
  // concrete member type can select anything.
  if (isUnionType(parentType)) return undefined
  return parentType.getFields()[name]
}

const resolveTypeCondition = (info: GraphQLResolveInfo, typeCondition: NamedTypeNode) =>
  info.schema.getType(typeCondition.name.value)
