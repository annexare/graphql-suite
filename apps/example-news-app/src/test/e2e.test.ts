import { describe, expect, test } from 'bun:test'
import { buildSchema } from '@graphql-suite/schema'
import { createYoga } from 'graphql-yoga'

import { schemaConfig } from '../config'
import { createFetchHandler } from '../server/routes'
import { createSeededMockDb } from './mock-db'

// ─── Setup ──────────────────────────────────────────────────

const mockDb = createSeededMockDb()
const { schema } = buildSchema(mockDb, schemaConfig)
const yoga = createYoga({ schema })
const fetchHandler = createFetchHandler(yoga)

// ─── Helpers ────────────────────────────────────────────────

async function gql(query: string, variables?: Record<string, unknown>) {
  const res = await yoga.fetch(
    new Request('http://test/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables }),
    }),
  )
  // biome-ignore lint/suspicious/noExplicitAny: GraphQL response shape
  return res.json() as Promise<any>
}

// ─── GraphQL API ────────────────────────────────────────────

describe('GraphQL API', () => {
  test('articleList query returns seed articles', async () => {
    const { data } = await gql('{ articleList { id title } }')
    expect(data.articleList).toHaveLength(3)
    const titles = data.articleList.map((a: { title: string }) => a.title)
    expect(titles).toContain('AI Breakthrough: New Model Achieves Human-Level Reasoning')
  })

  test('single article with blocks', async () => {
    const { data } = await gql(`{
      articleList {
        id title
        blocks { id type content }
      }
    }`)
    const aiArticle = data.articleList.find((a: { title: string }) =>
      a.title.includes('AI Breakthrough'),
    )
    expect(aiArticle).toBeDefined()
    expect(aiArticle.blocks).toBeDefined()
    expect(Array.isArray(aiArticle.blocks)).toBe(true)
  })

  test('userList query returns seed users', async () => {
    const { data } = await gql('{ userList { id displayName } }')
    expect(data.userList).toHaveLength(3)
  })

  test('categoryList query returns categories', async () => {
    const { data } = await gql('{ categoryList { id name } }')
    expect(data.categoryList).toHaveLength(4)
  })

  test('tagList query returns tags', async () => {
    const { data } = await gql('{ tagList { id name } }')
    expect(data.tagList).toHaveLength(5)
  })

  test('commentList with author', async () => {
    const { data } = await gql('{ commentList { id body author { displayName } } }')
    expect(data.commentList).toHaveLength(3)
  })
})

// ─── SSR Pages ──────────────────────────────────────────────

describe('SSR pages', () => {
  test('GET /articles renders article titles', async () => {
    const res = await fetchHandler(new Request('http://test/articles'))
    const html = await res.text()
    expect(html).toContain('AI Breakthrough')
    expect(html).toContain('Global Climate Report')
    expect(html).toContain('Ed Editor')
  })

  test('GET /articles filters out draft articles', async () => {
    const res = await fetchHandler(new Request('http://test/articles'))
    const html = await res.text()
    expect(html).not.toContain('The Future of the Web Platform')
  })

  test('GET /articles/:slug renders article detail', async () => {
    const res = await fetchHandler(
      new Request('http://test/articles/ai-breakthrough-human-level-reasoning'),
    )
    const html = await res.text()
    expect(html).toContain('AI Breakthrough')
    expect(html).toContain('How It Works')
    expect(html).toContain('This is fascinating')
  })

  test('GET /articles/nonexistent returns 404', async () => {
    const res = await fetchHandler(new Request('http://test/articles/nonexistent'))
    expect(res.status).toBe(404)
  })
})
