import { beforeEach, describe, expect, test } from 'bun:test'
import type { Column, SQL, Table } from 'drizzle-orm'
import {
  createTableRelationsHelpers,
  extractTablesRelationalConfig,
  getTableName,
  relations,
} from 'drizzle-orm'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import { integer, json, pgTable, text, uuid } from 'drizzle-orm/pg-core'
import type { ExecutionResult } from 'graphql'
import { graphql } from 'graphql'

import { buildSchema } from './index'

// ─── Test Schema ─────────────────────────────────────────────

const author = pgTable('author', {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  email: text(),
  bio: text(),
  settings: json(),
})

const post = pgTable('post', {
  id: uuid().primaryKey().defaultRandom(),
  authorId: uuid()
    .notNull()
    .references(() => author.id),
  title: text().notNull(),
  body: text(),
  views: integer(),
})

const comment = pgTable('comment', {
  id: uuid().primaryKey().defaultRandom(),
  postId: uuid()
    .notNull()
    .references(() => post.id),
  message: text().notNull(),
})

const authorRelations = relations(author, ({ many }) => ({ posts: many(post) }))

const postRelations = relations(post, ({ one, many }) => ({
  author: one(author, { fields: [post.authorId], references: [author.id] }),
  comments: many(comment),
}))

const commentRelations = relations(comment, ({ one }) => ({
  post: one(post, { fields: [comment.postId], references: [post.id] }),
}))

const drizzleSchema = { author, post, comment, authorRelations, postRelations, commentRelations }

// ─── Recording Mock DB ───────────────────────────────────────

/** Everything the generated resolvers hand to Drizzle, in call order. */
type Recorded = {
  findMany: { table: string; config: FindConfig }[]
  findFirst: { table: string; config: FindConfig }[]
  insert: { table: string; values: Record<string, unknown>[]; returning?: string[] }[]
  update: { table: string; set: Record<string, unknown>; where: boolean; returning?: string[] }[]
  delete: { table: string; where: boolean; returning?: string[] }[]
  countWhere: (SQL | undefined)[]
}

type FindConfig = {
  columns?: Record<string, true>
  with?: Record<string, FindConfig>
  limit?: number
  offset?: number
  orderBy?: unknown[]
  where?: SQL
}

let recorded: Recorded
let rows: Record<string, unknown>[]
let count: number

const columnNames = (returning?: Record<string, Column>) =>
  returning ? Object.keys(returning) : undefined

/**
 * Stands in for a Drizzle PG database: records what each resolver asks for and
 * replays `rows` back. No connection involved, so the assertions target the
 * query a resolver built from the GraphQL selection — which is exactly the part
 * `parseResolveInfo` drives.
 */
function createRecordingDb(): PgDatabase<PgQueryResultHKT, Record<string, unknown>> {
  const { tables, tableNamesMap } = extractTablesRelationalConfig(
    drizzleSchema,
    createTableRelationsHelpers,
  )

  const query = Object.fromEntries(
    ['author', 'post', 'comment'].map((name) => [
      name,
      {
        findMany: (config: FindConfig = {}) => {
          recorded.findMany.push({ table: name, config })
          return Promise.resolve(rows)
        },
        findFirst: (config: FindConfig = {}) => {
          recorded.findFirst.push({ table: name, config })
          return Promise.resolve(rows[0] ?? null)
        },
      },
    ]),
  )

  /** Mimics a Drizzle query builder: chainable, and awaitable at any point. */
  const chainable = <T extends { returning?: string[] }>(entry: T, onWhere?: () => void) => {
    const chain = {
      where: (_where: SQL) => {
        onWhere?.()
        return chain
      },
      returning: (returning?: Record<string, Column>) => {
        entry.returning = columnNames(returning)
        return chain
      },
      onConflictDoNothing: () => chain,
      // biome-ignore lint/suspicious/noThenProperty: mimics an awaitable Drizzle query builder
      then: (resolve: (value: unknown) => unknown) => resolve(rows),
    }
    return chain
  }

  return {
    _: { fullSchema: drizzleSchema, schema: tables, tableNamesMap },
    query,
    insert: (table: Table) => ({
      values: (values: Record<string, unknown>[]) => {
        const entry: Recorded['insert'][number] = { table: getTableName(table), values }
        recorded.insert.push(entry)
        return chainable(entry)
      },
    }),
    update: (table: Table) => ({
      set: (set: Record<string, unknown>) => {
        const entry: Recorded['update'][number] = { table: getTableName(table), set, where: false }
        recorded.update.push(entry)
        return chainable(entry, () => {
          entry.where = true
        })
      },
    }),
    delete: (table: Table) => {
      const entry: Recorded['delete'][number] = { table: getTableName(table), where: false }
      recorded.delete.push(entry)
      return chainable(entry, () => {
        entry.where = true
      })
    },
    $count: (_table: Table, where?: SQL) => {
      recorded.countWhere.push(where)
      return Promise.resolve(count)
    },
  } as unknown as PgDatabase<PgQueryResultHKT, Record<string, unknown>>
}

const { schema } = buildSchema(createRecordingDb())

beforeEach(() => {
  recorded = { findMany: [], findFirst: [], insert: [], update: [], delete: [], countWhere: [] }
  rows = []
  count = 0
})

async function run(
  source: string,
  variableValues?: Record<string, unknown>,
): Promise<ExecutionResult> {
  const result = await graphql({ schema, source, variableValues })
  if (result.errors?.length) throw result.errors[0]
  return result
}

/** Columns the last `findMany` asked Drizzle for. */
const selectedColumns = (index = 0) =>
  Object.keys(recorded.findMany[index]?.config.columns ?? {}).sort()

// ─── Tests ───────────────────────────────────────────────────

describe('list query execution', () => {
  test('runs end to end and returns rows', async () => {
    rows = [{ id: 'a1', name: 'Ada' }]

    const result = await run('{ author { id name } }')

    expect(result.data).toEqual({ author: [{ id: 'a1', name: 'Ada' }] })
    expect(recorded.findMany).toHaveLength(1)
    expect(recorded.findMany[0]?.table).toBe('author')
  })

  test('selects only the columns the query asked for', async () => {
    await run('{ author { id name } }')

    expect(selectedColumns()).toEqual(['id', 'name'])
  })

  test('maps aliased fields back to their columns', async () => {
    rows = [{ id: 'a1', name: 'Ada' }]

    const result = await run('{ author { key: id who: name } }')

    expect(selectedColumns()).toEqual(['id', 'name'])
    expect(result.data).toEqual({ author: [{ key: 'a1', who: 'Ada' }] })
  })

  test('ignores __typename when choosing columns', async () => {
    await run('{ author { __typename id } }')

    expect(selectedColumns()).toEqual(['id'])
  })

  test('falls back to a single column when nothing selectable was asked for', async () => {
    await run('{ author { __typename } }')

    expect(selectedColumns()).toHaveLength(1)
  })

  test('collects columns selected through a named fragment', async () => {
    await run(`
      { author { ...AuthorFields } }
      fragment AuthorFields on AuthorSelectItem { id email }
    `)

    expect(selectedColumns()).toEqual(['email', 'id'])
  })

  test('collects columns selected through an inline fragment', async () => {
    await run('{ author { id ... on AuthorSelectItem { bio } } }')

    expect(selectedColumns()).toEqual(['bio', 'id'])
  })

  test('honours @skip and @include when choosing columns', async () => {
    await run('{ author { id email @skip(if: true) bio @include(if: false) } }')

    expect(selectedColumns()).toEqual(['id'])
  })

  test('resolves @skip conditions from variables', async () => {
    await run('query ($hide: Boolean!) { author { id email @skip(if: $hide) } }', { hide: false })

    expect(selectedColumns()).toEqual(['email', 'id'])
  })

  test('passes top-level limit, offset and where through', async () => {
    await run('{ author(limit: 5, offset: 10, where: { name: { eq: "Ada" } }) { id } }')

    const config = recorded.findMany[0]?.config
    expect(config?.limit).toBe(5)
    expect(config?.offset).toBe(10)
    expect(config?.where).toBeDefined()
  })

  test('passes top-level orderBy through', async () => {
    await run('{ author(orderBy: { name: { direction: asc, priority: 1 } }) { id } }')

    expect(recorded.findMany[0]?.config.orderBy).toHaveLength(1)
  })
})

describe('relation selection', () => {
  test('requests nested relations via `with`', async () => {
    await run('{ author { id posts { id title } } }')

    const config = recorded.findMany[0]?.config
    expect(Object.keys(config?.with ?? {})).toEqual(['posts'])
    expect(Object.keys(config?.with?.posts?.columns ?? {}).sort()).toEqual(['id', 'title'])
  })

  test('omits `with` when no relation was selected', async () => {
    await run('{ author { id } }')

    expect(recorded.findMany[0]?.config.with).toEqual({})
  })

  test('carries relation arguments into the nested query', async () => {
    await run(`{
      author {
        id
        posts(limit: 3, offset: 6, where: { title: { eq: "x" } }, orderBy: { title: { direction: desc, priority: 1 } }) {
          id
        }
      }
    }`)

    const posts = recorded.findMany[0]?.config.with?.posts
    expect(posts?.limit).toBe(3)
    expect(posts?.offset).toBe(6)
    expect(posts?.where).toBeDefined()
    expect(posts?.orderBy).toHaveLength(1)
  })

  test('resolves relation arguments supplied as variables', async () => {
    await run('query ($n: Int) { author { id posts(limit: $n) { id } } }', { n: 4 })

    expect(recorded.findMany[0]?.config.with?.posts?.limit).toBe(4)
  })

  test('walks relations nested two levels deep', async () => {
    await run('{ author { id posts { id comments { id message } } } }')

    const comments = recorded.findMany[0]?.config.with?.posts?.with?.comments
    expect(Object.keys(comments?.columns ?? {}).sort()).toEqual(['id', 'message'])
  })

  test('collects relations selected through a fragment', async () => {
    await run(`
      { author { id ...WithPosts } }
      fragment WithPosts on AuthorSelectItem { posts { title } }
    `)

    expect(Object.keys(recorded.findMany[0]?.config.with?.posts?.columns ?? {})).toEqual(['title'])
  })

  test('returns nested relation data to the client', async () => {
    rows = [{ id: 'a1', name: 'Ada', posts: [{ id: 'p1', title: 'Notes' }] }]

    const result = await run('{ author { id name posts { id title } } }')

    expect(result.data).toEqual({
      author: [{ id: 'a1', name: 'Ada', posts: [{ id: 'p1', title: 'Notes' }] }],
    })
  })
})

describe('single query execution', () => {
  test('uses findFirst and prunes columns', async () => {
    rows = [{ id: 'a1', name: 'Ada' }]

    const result = await run('{ authorSingle { id name } }')

    expect(result.data).toEqual({ authorSingle: { id: 'a1', name: 'Ada' } })
    expect(Object.keys(recorded.findFirst[0]?.config.columns ?? {}).sort()).toEqual(['id', 'name'])
  })

  test('returns null when nothing matched', async () => {
    const result = await run('{ authorSingle { id } }')

    expect(result.data).toEqual({ authorSingle: null })
  })

  test('carries relations and their arguments', async () => {
    await run('{ authorSingle { id posts(limit: 2) { title } } }')

    expect(recorded.findFirst[0]?.config.with?.posts?.limit).toBe(2)
  })
})

describe('count query execution', () => {
  test('returns the count', async () => {
    count = 42

    const result = await run('{ authorCount }')

    expect(result.data).toEqual({ authorCount: 42 })
  })

  test('passes a where clause through', async () => {
    await run('{ authorCount(where: { name: { eq: "Ada" } }) }')

    expect(recorded.countWhere[0]).toBeDefined()
  })
})

describe('mutation execution', () => {
  test('insert returns only the selected columns', async () => {
    rows = [{ id: 'a1', name: 'Ada' }]

    const result = await run('mutation { insertIntoAuthor(values: [{ name: "Ada" }]) { id name } }')

    expect(result.data).toEqual({ insertIntoAuthor: [{ id: 'a1', name: 'Ada' }] })
    expect(recorded.insert[0]?.values).toEqual([{ name: 'Ada' }])
    expect(recorded.insert[0]?.returning?.sort()).toEqual(['id', 'name'])
  })

  test('insertSingle returns one row', async () => {
    rows = [{ id: 'a1', name: 'Ada' }]

    const result = await run('mutation { insertIntoAuthorSingle(values: { name: "Ada" }) { id } }')

    expect(result.data).toEqual({ insertIntoAuthorSingle: { id: 'a1' } })
    expect(recorded.insert[0]?.returning).toEqual(['id'])
  })

  test('insert accepts values supplied as variables', async () => {
    rows = [{ id: 'a1' }]

    await run('mutation ($v: AuthorInsertInput!) { insertIntoAuthorSingle(values: $v) { id } }', {
      v: { name: 'Ada', email: 'ada@example.com' },
    })

    expect(recorded.insert[0]?.values).toEqual([{ name: 'Ada', email: 'ada@example.com' }])
  })

  test('update passes set, where and returning columns', async () => {
    rows = [{ id: 'a1', name: 'Grace' }]

    const result = await run(
      'mutation { updateAuthor(set: { name: "Grace" }, where: { id: { eq: "a1" } }) { id name } }',
    )

    expect(result.data).toEqual({ updateAuthor: [{ id: 'a1', name: 'Grace' }] })
    expect(recorded.update[0]?.set).toEqual({ name: 'Grace' })
    expect(recorded.update[0]?.where).toBe(true)
    expect(recorded.update[0]?.returning?.sort()).toEqual(['id', 'name'])
  })

  test('delete passes where and returning columns', async () => {
    rows = [{ id: 'a1' }]

    const result = await run('mutation { deleteFromAuthor(where: { id: { eq: "a1" } }) { id } }')

    expect(result.data).toEqual({ deleteFromAuthor: [{ id: 'a1' }] })
    expect(recorded.delete[0]?.where).toBe(true)
    expect(recorded.delete[0]?.returning).toEqual(['id'])
  })

  test('surfaces resolver errors as GraphQL errors', async () => {
    const result = await graphql({
      schema,
      source: 'mutation { insertIntoAuthor(values: []) { id } }',
    })

    expect(result.errors?.[0]?.message).toBe('No values were provided!')
  })
})

describe('json columns', () => {
  test('accepts a JSON literal on insert', async () => {
    rows = [{ id: 'a1', settings: { theme: 'dark' } }]

    const result = await run(
      'mutation { insertIntoAuthorSingle(values: { name: "Ada", settings: { theme: "dark" } }) { id settings } }',
    )

    expect(recorded.insert[0]?.values[0]?.settings).toEqual({ theme: 'dark' })
    expect(result.data).toEqual({
      insertIntoAuthorSingle: { id: 'a1', settings: { theme: 'dark' } },
    })
  })

  test('accepts a JSON value supplied as a variable', async () => {
    rows = [{ id: 'a1' }]

    await run(
      'mutation ($s: JSON) { insertIntoAuthorSingle(values: { name: "Ada", settings: $s }) { id } }',
      { s: { theme: 'light', tags: [1, 2] } },
    )

    expect(recorded.insert[0]?.values[0]?.settings).toEqual({ theme: 'light', tags: [1, 2] })
  })
})
