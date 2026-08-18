import { describe, expect, test } from 'bun:test'
import type { FieldNode, GraphQLResolveInfo, OperationDefinitionNode } from 'graphql'
import {
  GraphQLBoolean,
  GraphQLID,
  GraphQLInputObjectType,
  GraphQLInt,
  GraphQLList,
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLSchema,
  GraphQLString,
  GraphQLUnionType,
  graphql,
  parse,
} from 'graphql'

import { parseResolveInfo, type ResolveTree } from './resolve-info'

// ─── Test Schema ─────────────────────────────────────────────

const filterInput = new GraphQLInputObjectType({
  name: 'FilterInput',
  fields: {
    name: { type: GraphQLString },
    active: { type: GraphQLBoolean, defaultValue: true },
  },
})

const meta: GraphQLObjectType = new GraphQLObjectType({
  name: 'Meta',
  fields: () => ({
    key: { type: GraphQLString },
    value: { type: GraphQLString },
  }),
})

const node: GraphQLObjectType = new GraphQLObjectType({
  name: 'Node',
  fields: () => ({
    id: { type: new GraphQLNonNull(GraphQLID) },
    name: { type: GraphQLString },
    meta: { type: meta },
    children: {
      type: new GraphQLList(new GraphQLNonNull(node)),
      args: {
        limit: { type: GraphQLInt },
        offset: { type: GraphQLInt, defaultValue: 0 },
        filter: { type: filterInput },
      },
    },
  }),
})

const photo = new GraphQLObjectType({
  name: 'Photo',
  fields: { url: { type: GraphQLString }, width: { type: GraphQLInt } },
})

const video = new GraphQLObjectType({
  name: 'Video',
  fields: { url: { type: GraphQLString }, duration: { type: GraphQLInt } },
})

const media = new GraphQLUnionType({
  name: 'Media',
  types: [photo, video],
  resolveType: () => 'Photo',
})

// ─── Harness ─────────────────────────────────────────────────

let captured: ResolveTree | null = null

const querySchema = new GraphQLSchema({
  query: new GraphQLObjectType({
    name: 'Query',
    fields: {
      root: {
        type: node,
        args: { size: { type: GraphQLInt, defaultValue: 3 }, tag: { type: GraphQLString } },
        resolve: (_source, _args, _context, info) => {
          captured = parseResolveInfo(info)
          return { id: '1' }
        },
      },
      media: {
        type: media,
        resolve: (_source, _args, _context, info) => {
          captured = parseResolveInfo(info)
          return { url: 'u', width: 1 }
        },
      },
    },
  }),
})

/**
 * Runs `source` against a schema whose root resolvers capture the tree that
 * `parseResolveInfo` builds, so assertions run against real execution state
 * rather than a hand-rolled `GraphQLResolveInfo`.
 */
async function parseInfo(
  source: string,
  variableValues?: Record<string, unknown>,
): Promise<ResolveTree | null> {
  captured = null

  const result = await graphql({ schema: querySchema, source, variableValues })
  expect(result.errors).toBeUndefined()

  return captured
}

/** Sub-selection of a tree node under a given type name. */
const fields = (tree: ResolveTree | null, typeName: string) =>
  tree?.fieldsByTypeName[typeName] ?? {}

/** Response keys selected on a type — what the resolver ultimately reads. */
const keys = (tree: ResolveTree | null, typeName: string) => Object.keys(fields(tree, typeName))

// ─── Tests ───────────────────────────────────────────────────

describe('parseResolveInfo', () => {
  test('returns the field currently being resolved', async () => {
    const tree = await parseInfo('{ root { id } }')

    expect(tree).not.toBeNull()
    expect(tree?.name).toBe('root')
    expect(tree?.alias).toBe('root')
  })

  test('groups sub-selection by the type it was selected on', async () => {
    const tree = await parseInfo('{ root { id name } }')

    expect(keys(tree, 'Node')).toEqual(['id', 'name'])
    expect(fields(tree, 'Node').id?.name).toBe('id')
  })

  test('keys sub-selection by alias while preserving the field name', async () => {
    const tree = await parseInfo('{ alpha: root { ident: id } }')

    expect(tree?.alias).toBe('alpha')
    expect(tree?.name).toBe('root')

    const ident = fields(tree, 'Node').ident
    expect(ident?.alias).toBe('ident')
    expect(ident?.name).toBe('id')
  })

  test('two aliases of the same field are kept apart', async () => {
    const tree = await parseInfo(
      '{ root { a: children(limit: 1) { id } b: children(limit: 2) { id } } }',
    )

    expect(keys(tree, 'Node')).toEqual(['a', 'b'])
    expect(fields(tree, 'Node').a?.args.limit).toBe(1)
    expect(fields(tree, 'Node').b?.args.limit).toBe(2)
  })

  test('coerces literal arguments and applies argument defaults', async () => {
    const tree = await parseInfo('{ root(tag: "x") { children(limit: 5) { id } } }')

    expect(tree?.args).toEqual({ size: 3, tag: 'x' })
    expect(fields(tree, 'Node').children?.args).toEqual({ offset: 0, limit: 5 })
  })

  test('resolves variables in nested field arguments', async () => {
    const tree = await parseInfo(
      'query ($n: Int, $o: Int) { root { children(limit: $n, offset: $o) { id } } }',
      { n: 7, o: 14 },
    )

    expect(fields(tree, 'Node').children?.args).toEqual({ limit: 7, offset: 14 })
  })

  test('coerces input-object arguments including their field defaults', async () => {
    const tree = await parseInfo('{ root { children(filter: { name: "n" }) { id } } }')

    expect(fields(tree, 'Node').children?.args.filter).toEqual({ name: 'n', active: true })
  })

  test('omits arguments that were not supplied and have no default', async () => {
    const tree = await parseInfo('{ root { children { id } } }')

    expect(fields(tree, 'Node').children?.args).toEqual({ offset: 0 })
    expect('limit' in (fields(tree, 'Node').children?.args ?? {})).toBe(false)
  })

  test('walks nested selections to arbitrary depth', async () => {
    const tree = await parseInfo('{ root { children { children { meta { key } } } } }')

    const level1 = fields(tree, 'Node').children
    const level2 = level1?.fieldsByTypeName.Node?.children
    const metaField = level2?.fieldsByTypeName.Node?.meta

    expect(Object.keys(metaField?.fieldsByTypeName.Meta ?? {})).toEqual(['key'])
  })

  test('inlines fragment spreads under their type condition', async () => {
    const tree = await parseInfo(`
      { root { ...NodeFields } }
      fragment NodeFields on Node { id name }
    `)

    expect(keys(tree, 'Node')).toEqual(['id', 'name'])
  })

  test('merges sub-selections of a field spread across fragments', async () => {
    const tree = await parseInfo(`
      { root { ...A ...B } }
      fragment A on Node { children { id } }
      fragment B on Node { children { name } }
    `)

    const children = fields(tree, 'Node').children
    expect(Object.keys(children?.fieldsByTypeName.Node ?? {})).toEqual(['id', 'name'])
  })

  test('inlines inline fragments without a type condition', async () => {
    const tree = await parseInfo('{ root { ... { id } name } }')

    expect(keys(tree, 'Node').sort()).toEqual(['id', 'name'])
  })

  test('groups union members under their own type names', async () => {
    const tree = await parseInfo(`
      { media { ... on Photo { url width } ... on Video { duration } } }
    `)

    expect(keys(tree, 'Photo')).toEqual(['url', 'width'])
    expect(keys(tree, 'Video')).toEqual(['duration'])
  })

  test('ignores fragment spreads that name a missing fragment', () => {
    // Executed documents always carry their fragments, so this branch is only
    // reachable when `info` is assembled by hand — a stitching layer, say.
    const document = parse('{ root { id ...Missing } }')
    const operation = document.definitions[0] as OperationDefinitionNode
    const rootField = operation.selectionSet.selections[0] as FieldNode

    const info = {
      fieldNodes: [rootField],
      parentType: querySchema.getQueryType(),
      schema: querySchema,
      fragments: {},
      variableValues: {},
    } as unknown as GraphQLResolveInfo

    expect(keys(parseResolveInfo(info), 'Node')).toEqual(['id'])
  })

  test('drops fields removed by @skip', async () => {
    const tree = await parseInfo('{ root { id name @skip(if: true) } }')

    expect(keys(tree, 'Node')).toEqual(['id'])
  })

  test('keeps fields retained by @skip(if: false)', async () => {
    const tree = await parseInfo('{ root { id name @skip(if: false) } }')

    expect(keys(tree, 'Node')).toEqual(['id', 'name'])
  })

  test('drops fields removed by @include(if: false)', async () => {
    const tree = await parseInfo('{ root { id name @include(if: false) } }')

    expect(keys(tree, 'Node')).toEqual(['id'])
  })

  test('resolves @skip / @include conditions from variables', async () => {
    const source =
      'query ($s: Boolean!, $i: Boolean!) { root { id name @skip(if: $s) meta @include(if: $i) { key } } }'

    expect(keys(await parseInfo(source, { s: true, i: false }), 'Node')).toEqual(['id'])
    expect(keys(await parseInfo(source, { s: false, i: true }), 'Node')).toEqual([
      'id',
      'name',
      'meta',
    ])
  })

  test('applies directives on fragment spreads and inline fragments', async () => {
    const spread = await parseInfo(`
      { root { id ...A @skip(if: true) } }
      fragment A on Node { name }
    `)
    expect(keys(spread, 'Node')).toEqual(['id'])

    const inline = await parseInfo('{ root { id ... on Node @include(if: false) { name } } }')
    expect(keys(inline, 'Node')).toEqual(['id'])
  })

  test('excludes introspection meta-fields', async () => {
    const tree = await parseInfo('{ root { __typename id } }')

    expect(keys(tree, 'Node')).toEqual(['id'])
  })

  test('leaves fieldsByTypeName empty for leaf fields', async () => {
    const tree = await parseInfo('{ root { id } }')

    expect(fields(tree, 'Node').id?.fieldsByTypeName).toEqual({})
  })

  test('returns null when the field node names nothing in the parent type', () => {
    const document = parse('{ unknownField }')
    const operation = document.definitions[0] as OperationDefinitionNode
    const rootField = operation.selectionSet.selections[0] as FieldNode

    const info = {
      fieldNodes: [rootField],
      parentType: querySchema.getQueryType(),
      schema: querySchema,
      fragments: {},
      variableValues: {},
    } as unknown as GraphQLResolveInfo

    expect(parseResolveInfo(info)).toBeNull()
  })

  test('returns null when info carries no field nodes', () => {
    const info = {
      fieldNodes: [],
      parentType: { name: 'Query' },
    } as unknown as GraphQLResolveInfo

    expect(parseResolveInfo(info)).toBeNull()
  })
})
