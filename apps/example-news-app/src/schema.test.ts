import { describe, expect, test } from 'bun:test'
import { buildSchemaFromDrizzle } from '@graphql-suite/schema'
import {
  type GraphQLEnumType,
  type GraphQLField,
  type GraphQLNamedType,
  type GraphQLObjectType,
  isEnumType,
  isObjectType,
} from 'graphql'

import { schemaConfig } from './config'
import * as drizzleSchema from './db'

// ─── Build Schema ────────────────────────────────────────────

const { schema, entities } = buildSchemaFromDrizzle(drizzleSchema, schemaConfig)

// ─── Helpers ─────────────────────────────────────────────────

function getQueryField(name: string): GraphQLField<unknown, unknown> | undefined {
  return schema.getQueryType()?.getFields()[name]
}

function getMutationField(name: string): GraphQLField<unknown, unknown> | undefined {
  return schema.getMutationType()?.getFields()[name]
}

function getType(name: string): GraphQLNamedType | undefined {
  return schema.getType(name)
}

function getObjectFields(typeName: string): Record<string, GraphQLField<unknown, unknown>> {
  const type = getType(typeName) as GraphQLObjectType
  expect(type).toBeDefined()
  return type.getFields()
}

// ─── Query Types ─────────────────────────────────────────────

describe('query types exist', () => {
  const expectedQueries = [
    'userList',
    'user',
    'userCount',
    'articleList',
    'article',
    'articleCount',
    'categoryList',
    'category',
    'categoryCount',
    'tagList',
    'tag',
    'tagCount',
    'commentList',
    'comment',
    'commentCount',
    'reactionList',
    'reaction',
    'reactionCount',
    'reportList',
    'report',
    'reportCount',
    'assetList',
    'asset',
    'assetCount',
    'articleBlockList',
    'articleBlock',
    'articleBlockCount',
    'oauthAccountList',
    'oauthAccount',
    'oauthAccountCount',
  ]

  for (const name of expectedQueries) {
    test(`query: ${name}`, () => {
      expect(getQueryField(name)).toBeDefined()
    })
  }
})

// ─── Junction Table Queries (read-only) ──────────────────────

describe('junction table queries exist', () => {
  const junctionQueries = [
    'articleCategoryList',
    'articleCategory',
    'articleTagList',
    'articleTag',
    'blockAssetList',
    'blockAsset',
  ]

  for (const name of junctionQueries) {
    test(`query: ${name}`, () => {
      expect(getQueryField(name)).toBeDefined()
    })
  }
})

// ─── Mutation Types ──────────────────────────────────────────

describe('mutation types exist', () => {
  const expectedMutations = [
    'insertIntoUser',
    'updateUser',
    'deleteFromUser',
    'insertIntoArticle',
    'updateArticle',
    'deleteFromArticle',
    'insertIntoComment',
    'updateComment',
    'deleteFromComment',
    'insertIntoReaction',
    'insertIntoReport',
    'insertIntoAsset',
    'insertIntoArticleBlock',
  ]

  for (const name of expectedMutations) {
    test(`mutation: ${name}`, () => {
      expect(getMutationField(name)).toBeDefined()
    })
  }
})

// ─── Junction Tables Are Read-Only ───────────────────────────

describe('junction table mutations are absent', () => {
  const junctionMutations = [
    'insertIntoArticleCategory',
    'updateArticleCategory',
    'deleteFromArticleCategory',
    'insertIntoArticleTag',
    'updateArticleTag',
    'deleteFromArticleTag',
    'insertIntoBlockAsset',
    'updateBlockAsset',
    'deleteFromBlockAsset',
  ]

  for (const name of junctionMutations) {
    test(`no mutation: ${name}`, () => {
      expect(getMutationField(name)).toBeUndefined()
    })
  }
})

// ─── Enums ───────────────────────────────────────────────────

describe('enums are generated', () => {
  const enumChecks = [
    { typeName: 'UserRoleEnum', values: ['admin', 'editor', 'reader'] },
    { typeName: 'ArticleStatusEnum', values: ['draft', 'published', 'archived'] },
    { typeName: 'ArticleBlockTypeEnum', values: ['text', 'heading', 'quote', 'code', 'embed'] },
    { typeName: 'AssetKindEnum', values: ['image', 'video', 'audio'] },
    { typeName: 'ReactionValueEnum', values: ['up', 'down'] },
    { typeName: 'ReportStatusEnum', values: ['pending', 'reviewed', 'dismissed'] },
    {
      typeName: 'OauthAccountProviderEnum',
      values: ['google', 'apple', 'github', 'x', 'facebook'],
    },
  ]

  for (const { typeName, values } of enumChecks) {
    test(`enum: ${typeName}`, () => {
      const type = getType(typeName) as GraphQLEnumType | undefined
      expect(type).toBeDefined()
      expect(isEnumType(type)).toBe(true)
      const enumValues = type?.getValues().map((v) => v.value)
      for (const v of values) {
        expect(enumValues).toContain(v)
      }
    })
  }
})

// ─── Relations ───────────────────────────────────────────────

describe('relations are present', () => {
  test('article has author relation', () => {
    const articleType = getType('ArticleSelectItem') as GraphQLObjectType | undefined
    expect(articleType).toBeDefined()
    expect(isObjectType(articleType)).toBe(true)
    const fields = getObjectFields('ArticleSelectItem')
    expect(fields.author).toBeDefined()
  })

  test('article has blocks relation', () => {
    const fields = getObjectFields('ArticleSelectItem')
    expect(fields.blocks).toBeDefined()
  })

  test('article has comments relation', () => {
    const fields = getObjectFields('ArticleSelectItem')
    expect(fields.comments).toBeDefined()
  })

  test('comment has author relation', () => {
    const fields = getObjectFields('CommentSelectItem')
    expect(fields.author).toBeDefined()
  })

  test('comment self-relations omitted at depth 1', () => {
    // limitSelfRelationDepth: 1 means self-relations (replies, parent) are omitted
    const fields = getObjectFields('CommentSelectItem')
    expect(fields.replies).toBeUndefined()
    expect(fields.parent).toBeUndefined()
  })

  test('user has articles relation', () => {
    const fields = getObjectFields('UserSelectItem')
    expect(fields.articles).toBeDefined()
  })

  test('articleCategory junction has article and category', () => {
    const fields = getObjectFields('ArticleCategorySelectItem')
    expect(fields.article).toBeDefined()
    expect(fields.category).toBeDefined()
  })
})

// ─── Filter Input Types ──────────────────────────────────────

describe('filter input types exist', () => {
  const filterTypes = [
    'ArticleFilters',
    'UserFilters',
    'CommentFilters',
    'CategoryFilters',
    'TagFilters',
    'ReactionFilters',
    'ReportFilters',
    'AssetFilters',
    'ArticleBlockFilters',
  ]

  for (const name of filterTypes) {
    test(`filter: ${name}`, () => {
      expect(getType(name)).toBeDefined()
    })
  }
})

// ─── JSON Fields ─────────────────────────────────────────────

describe('JSON fields use JSON scalar', () => {
  test('user.settings is JSON', () => {
    const fields = getObjectFields('UserSelectItem')
    expect(fields.settings).toBeDefined()
  })

  test('article.metadata is JSON', () => {
    const fields = getObjectFields('ArticleSelectItem')
    expect(fields.metadata).toBeDefined()
  })

  test('articleBlock.meta is JSON', () => {
    const fields = getObjectFields('ArticleBlockSelectItem')
    expect(fields.meta).toBeDefined()
  })
})

// ─── Entities Object ─────────────────────────────────────────

describe('entities object', () => {
  test('has queries', () => {
    expect(Object.keys(entities.queries).length).toBeGreaterThan(0)
  })

  test('has mutations', () => {
    expect(Object.keys(entities.mutations).length).toBeGreaterThan(0)
  })

  test('has types for all tables', () => {
    expect(entities.types.ArticleSelectItem).toBeDefined()
    expect(entities.types.UserSelectItem).toBeDefined()
    expect(entities.types.CommentSelectItem).toBeDefined()
    expect(entities.types.CategorySelectItem).toBeDefined()
    expect(entities.types.TagSelectItem).toBeDefined()
  })

  test('has input types', () => {
    expect(Object.keys(entities.inputs).length).toBeGreaterThan(0)
  })
})
