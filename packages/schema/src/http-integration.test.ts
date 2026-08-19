import { beforeEach, describe, expect, test } from 'bun:test'
import { createTableRelationsHelpers, extractTablesRelationalConfig, relations } from 'drizzle-orm'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import { integer, pgTable, text, uuid } from 'drizzle-orm/pg-core'
import { createHandler } from 'graphql-http/lib/use/fetch'

import { buildSchema } from './index'

// ─── Test Schema ─────────────────────────────────────────────
// Serves a generated schema over a real HTTP handler. `graphql-http` is the
// reference implementation and accepts graphql 16 and 17, so this lane runs on
// both majors — unlike graphql-yoga 5, whose peer range stops at graphql 16.

const author = pgTable('author', {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  email: text(),
})

const post = pgTable('post', {
  id: uuid().primaryKey().defaultRandom(),
  authorId: uuid()
    .notNull()
    .references(() => author.id),
  title: text().notNull(),
  views: integer(),
})

const authorRelations = relations(author, ({ many }) => ({ posts: many(post) }))
const postRelations = relations(post, ({ one }) => ({
  author: one(author, { fields: [post.authorId], references: [author.id] }),
}))

const drizzleSchema = { author, post, authorRelations, postRelations }

// ─── Mock DB ─────────────────────────────────────────────────

type FindConfig = { columns?: Record<string, true>; with?: Record<string, FindConfig> }

let rows: Record<string, unknown>[] = []
let lastConfig: FindConfig = {}
let inserted: Record<string, unknown>[] = []

function createMockDb(): PgDatabase<PgQueryResultHKT, Record<string, unknown>> {
  const { tables, tableNamesMap } = extractTablesRelationalConfig(
    drizzleSchema,
    createTableRelationsHelpers,
  )

  const query = Object.fromEntries(
    ['author', 'post'].map((name) => [
      name,
      {
        findMany: (config: FindConfig = {}) => {
          lastConfig = config
          return Promise.resolve(rows)
        },
        findFirst: (config: FindConfig = {}) => {
          lastConfig = config
          return Promise.resolve(rows[0] ?? null)
        },
      },
    ]),
  )

  const chain = {
    returning: () => chain,
    onConflictDoNothing: () => chain,
    // biome-ignore lint/suspicious/noThenProperty: mimics an awaitable Drizzle query builder
    then: (resolve: (value: unknown) => unknown) => resolve(rows),
  }

  return {
    _: { fullSchema: drizzleSchema, schema: tables, tableNamesMap },
    query,
    insert: () => ({
      values: (values: Record<string, unknown>[]) => {
        inserted = values
        return chain
      },
    }),
  } as unknown as PgDatabase<PgQueryResultHKT, Record<string, unknown>>
}

const { schema } = buildSchema(createMockDb())
const handler = createHandler({ schema })

/** Issues a real HTTP POST against the GraphQL handler. */
async function postRequest(body: unknown, headers: Record<string, string> = {}) {
  const response = await handler(
    new Request('http://test/graphql', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json', ...headers },
      body: JSON.stringify(body),
    }),
  )
  const text = await response.text()
  return { status: response.status, body: text ? JSON.parse(text) : null }
}

const gql = (query: string, variables?: Record<string, unknown>) =>
  postRequest({ query, variables })

beforeEach(() => {
  rows = []
  lastConfig = {}
  inserted = []
})

// ─── Tests ───────────────────────────────────────────────────

describe('serving the generated schema over HTTP', () => {
  test('answers a query', async () => {
    rows = [{ id: 'a1', name: 'Ada' }]

    const { status, body } = await gql('{ author { id name } }')

    expect(status).toBe(200)
    expect(body.errors).toBeUndefined()
    expect(body.data).toEqual({ author: [{ id: 'a1', name: 'Ada' }] })
  })

  test('prunes columns to the HTTP request selection', async () => {
    await gql('{ author { id } }')

    expect(Object.keys(lastConfig.columns ?? {})).toEqual(['id'])
  })

  // graphql 17 moved coerced variable values under `variableValues.coerced`.
  // Passing them over the wire is the path that breaks graphql-yoga 5 on 17.
  test('applies variables sent in the request body', async () => {
    rows = [{ id: 'a1', name: 'Ada' }]

    const { status, body } = await gql(
      'query ($limit: Int, $name: String) { author(limit: $limit, where: { name: { eq: $name } }) { id name } }',
      { limit: 5, name: 'Ada' },
    )

    expect(status).toBe(200)
    expect(body.errors).toBeUndefined()
    expect(body.data).toEqual({ author: [{ id: 'a1', name: 'Ada' }] })
  })

  test('resolves nested relations requested over HTTP', async () => {
    rows = [{ id: 'a1', name: 'Ada', posts: [{ id: 'p1', title: 'Notes' }] }]

    const { body } = await gql('{ author { id name posts { id title } } }')

    expect(body.data).toEqual({
      author: [{ id: 'a1', name: 'Ada', posts: [{ id: 'p1', title: 'Notes' }] }],
    })
    expect(Object.keys(lastConfig.with?.posts?.columns ?? {}).sort()).toEqual(['id', 'title'])
  })

  test('runs a mutation with variables', async () => {
    rows = [{ id: 'a1', name: 'Ada' }]

    const { body } = await gql(
      'mutation ($values: AuthorInsertInput!) { insertIntoAuthorSingle(values: $values) { id name } }',
      { values: { name: 'Ada', email: 'ada@example.com' } },
    )

    expect(body.errors).toBeUndefined()
    expect(inserted).toEqual([{ name: 'Ada', email: 'ada@example.com' }])
    expect(body.data).toEqual({ insertIntoAuthorSingle: { id: 'a1', name: 'Ada' } })
  })

  test('answers an introspection request', async () => {
    const { body } = await gql('{ __schema { queryType { fields { name } } } }')

    const names = body.data.__schema.queryType.fields.map((f: { name: string }) => f.name)
    expect(names).toContain('author')
    expect(names).toContain('authorSingle')
    expect(names).toContain('authorCount')
  })

  test('reports a validation error as a GraphQL error, not a crash', async () => {
    // Under `accept: application/json` the spec's legacy mode applies, so the
    // status stays 200 and the failure travels in `errors`.
    const { status, body } = await gql('{ author { nope } }')

    expect(status).toBe(200)
    expect(body.data).toBeUndefined()
    expect(body.errors?.[0]?.message).toContain('Cannot query field "nope"')
  })

  test('uses a 400 for a validation error in graphql-response mode', async () => {
    const { status, body } = await postRequest(
      { query: '{ author { nope } }' },
      { accept: 'application/graphql-response+json' },
    )

    expect(status).toBe(400)
    expect(body.errors?.[0]?.message).toContain('Cannot query field "nope"')
  })
})
