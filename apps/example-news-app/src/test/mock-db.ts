import { createTableRelationsHelpers, extractTablesRelationalConfig } from 'drizzle-orm'

import * as drizzleSchema from '../db'
import {
  articleBlocks,
  articleCategories,
  articles,
  articleTags,
  assets,
  blockAssets,
  categories,
  comments,
  reactions,
  tags,
  users,
} from '../db/seed'

// ─── Seed Data Map ──────────────────────────────────────────

const defaultDate = new Date('2026-03-10T00:00:00Z')

// Add default timestamps for fields that would be set by DB defaults
function withDefaults(
  rows: Record<string, unknown>[],
  defaults: Record<string, unknown>,
): Record<string, unknown>[] {
  return rows.map((row) => {
    const patched: Record<string, unknown> = { ...row }
    for (const [key, value] of Object.entries(defaults)) {
      if (!(key in patched) || patched[key] === undefined) {
        patched[key] = value
      }
    }
    return patched
  })
}

const seedDataMap: Record<string, Record<string, unknown>[]> = {
  user: withDefaults(Object.values(users), { registeredAt: defaultDate }),
  article: Object.values(articles),
  articleBlock: Object.values(articleBlocks),
  comment: withDefaults(Object.values(comments), { createdAt: defaultDate }),
  reaction: withDefaults(Object.values(reactions), { createdAt: defaultDate }),
  category: Object.values(categories),
  tag: Object.values(tags),
  asset: withDefaults(Object.values(assets), { createdAt: defaultDate }),
  oauthAccount: [],
  report: [],
  articleCategory: articleCategories,
  articleTag: articleTags,
  blockAsset: blockAssets,
}

// ─── Relation FK Mappings ───────────────────────────────────
// Maps: parentTable -> relationName -> { targetTable, fk field on child, ref field on parent, kind }

type RelationDef = {
  targetTable: string
  kind: 'one' | 'many'
  // For "one" (parent has FK): parentFk -> targetRef
  // For "many" (child has FK): childFk -> parentRef
  parentFk?: string
  targetRef?: string
  childFk?: string
  parentRef?: string
}

const relationDefs: Record<string, Record<string, RelationDef>> = {
  user: {
    oauthAccounts: {
      targetTable: 'oauthAccount',
      kind: 'many',
      childFk: 'userId',
      parentRef: 'id',
    },
    articles: { targetTable: 'article', kind: 'many', childFk: 'authorId', parentRef: 'id' },
    comments: { targetTable: 'comment', kind: 'many', childFk: 'authorId', parentRef: 'id' },
    reactions: { targetTable: 'reaction', kind: 'many', childFk: 'userId', parentRef: 'id' },
    reports: { targetTable: 'report', kind: 'many', childFk: 'reporterId', parentRef: 'id' },
    assets: { targetTable: 'asset', kind: 'many', childFk: 'uploaderId', parentRef: 'id' },
  },
  article: {
    author: { targetTable: 'user', kind: 'one', parentFk: 'authorId', targetRef: 'id' },
    blocks: { targetTable: 'articleBlock', kind: 'many', childFk: 'articleId', parentRef: 'id' },
    comments: { targetTable: 'comment', kind: 'many', childFk: 'articleId', parentRef: 'id' },
    reactions: { targetTable: 'reaction', kind: 'many', childFk: 'articleId', parentRef: 'id' },
    reports: { targetTable: 'report', kind: 'many', childFk: 'articleId', parentRef: 'id' },
    articleCategories: {
      targetTable: 'articleCategory',
      kind: 'many',
      childFk: 'articleId',
      parentRef: 'id',
    },
    articleTags: {
      targetTable: 'articleTag',
      kind: 'many',
      childFk: 'articleId',
      parentRef: 'id',
    },
  },
  articleBlock: {
    article: { targetTable: 'article', kind: 'one', parentFk: 'articleId', targetRef: 'id' },
    blockAssets: {
      targetTable: 'blockAsset',
      kind: 'many',
      childFk: 'blockId',
      parentRef: 'id',
    },
  },
  comment: {
    article: { targetTable: 'article', kind: 'one', parentFk: 'articleId', targetRef: 'id' },
    author: { targetTable: 'user', kind: 'one', parentFk: 'authorId', targetRef: 'id' },
    parent: { targetTable: 'comment', kind: 'one', parentFk: 'parentId', targetRef: 'id' },
    replies: { targetTable: 'comment', kind: 'many', childFk: 'parentId', parentRef: 'id' },
    reactions: { targetTable: 'reaction', kind: 'many', childFk: 'commentId', parentRef: 'id' },
    reports: { targetTable: 'report', kind: 'many', childFk: 'commentId', parentRef: 'id' },
  },
  reaction: {
    user: { targetTable: 'user', kind: 'one', parentFk: 'userId', targetRef: 'id' },
    article: { targetTable: 'article', kind: 'one', parentFk: 'articleId', targetRef: 'id' },
    comment: { targetTable: 'comment', kind: 'one', parentFk: 'commentId', targetRef: 'id' },
  },
  report: {
    reporter: { targetTable: 'user', kind: 'one', parentFk: 'reporterId', targetRef: 'id' },
    article: { targetTable: 'article', kind: 'one', parentFk: 'articleId', targetRef: 'id' },
    comment: { targetTable: 'comment', kind: 'one', parentFk: 'commentId', targetRef: 'id' },
  },
  asset: {
    uploader: { targetTable: 'user', kind: 'one', parentFk: 'uploaderId', targetRef: 'id' },
    blockAssets: {
      targetTable: 'blockAsset',
      kind: 'many',
      childFk: 'assetId',
      parentRef: 'id',
    },
  },
  oauthAccount: {
    user: { targetTable: 'user', kind: 'one', parentFk: 'userId', targetRef: 'id' },
  },
  category: {
    articleCategories: {
      targetTable: 'articleCategory',
      kind: 'many',
      childFk: 'categoryId',
      parentRef: 'id',
    },
  },
  tag: {
    articleTags: {
      targetTable: 'articleTag',
      kind: 'many',
      childFk: 'tagId',
      parentRef: 'id',
    },
  },
  articleCategory: {
    article: { targetTable: 'article', kind: 'one', parentFk: 'articleId', targetRef: 'id' },
    category: { targetTable: 'category', kind: 'one', parentFk: 'categoryId', targetRef: 'id' },
  },
  articleTag: {
    article: { targetTable: 'article', kind: 'one', parentFk: 'articleId', targetRef: 'id' },
    tag: { targetTable: 'tag', kind: 'one', parentFk: 'tagId', targetRef: 'id' },
  },
  blockAsset: {
    block: { targetTable: 'articleBlock', kind: 'one', parentFk: 'blockId', targetRef: 'id' },
    asset: { targetTable: 'asset', kind: 'one', parentFk: 'assetId', targetRef: 'id' },
  },
}

// ─── Relation Resolver ──────────────────────────────────────

function resolveWith(
  tableName: string,
  row: Record<string, unknown>,
  withParam: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...row }
  const rels = relationDefs[tableName]
  if (!rels) return result

  for (const [relName, relConfig] of Object.entries(withParam)) {
    const def = rels[relName]
    if (!def) continue

    const targetData = seedDataMap[def.targetTable] ?? []

    if (def.kind === 'one' && def.parentFk && def.targetRef) {
      const fkValue = row[def.parentFk]
      const { targetRef } = def
      const match = targetData.find((r) => r[targetRef] === fkValue) ?? null
      if (match && relConfig && typeof relConfig === 'object' && 'with' in relConfig) {
        result[relName] = resolveWith(
          def.targetTable,
          match as Record<string, unknown>,
          (relConfig as { with: Record<string, unknown> }).with,
        )
      } else {
        result[relName] = match
      }
    } else if (def.kind === 'many' && def.childFk && def.parentRef) {
      const parentValue = row[def.parentRef]
      const { childFk } = def
      const matches = targetData.filter((r) => r[childFk] === parentValue)
      if (relConfig && typeof relConfig === 'object' && 'with' in relConfig) {
        result[relName] = matches.map((m) =>
          resolveWith(
            def.targetTable,
            m as Record<string, unknown>,
            (relConfig as { with: Record<string, unknown> }).with,
          ),
        )
      } else {
        result[relName] = matches
      }
    }
  }

  return result
}

// ─── Mock DB Factory ────────────────────────────────────────

export function createSeededMockDb() {
  const { tables, tableNamesMap } = extractTablesRelationalConfig(
    drizzleSchema,
    createTableRelationsHelpers,
  )

  const schemaKeys = Object.keys(tables)

  const query = Object.fromEntries(
    schemaKeys.map((name) => [
      name,
      {
        findMany: (opts?: { with?: Record<string, unknown> }) => {
          const rows = seedDataMap[name] ?? []
          const withParam = opts?.with
          if (withParam) {
            return Promise.resolve(
              rows.map((r) => resolveWith(name, r as Record<string, unknown>, withParam)),
            )
          }
          return Promise.resolve(rows)
        },
        findFirst: (opts?: { with?: Record<string, unknown> }) => {
          const row = (seedDataMap[name] ?? [])[0] ?? null
          if (row && opts?.with) {
            return Promise.resolve(resolveWith(name, row as Record<string, unknown>, opts.with))
          }
          return Promise.resolve(row)
        },
      },
    ]),
  )

  const mockDb = {
    _: { fullSchema: drizzleSchema, schema: tables, tableNamesMap },
    query,
    select: () => ({
      from: () => ({
        where: () => Promise.resolve([{ count: 0 }]),
      }),
    }),
  }

  // biome-ignore lint/suspicious/noExplicitAny: mock db for testing
  return mockDb as any
}
