import type { AnyPgColumn } from 'drizzle-orm/pg-core'
import {
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

// ─── Enums ───────────────────────────────────────────────────

export const userRoleEnum = pgEnum('user_role', ['admin', 'editor', 'reader'])
export const articleStatusEnum = pgEnum('article_status', ['draft', 'published', 'archived'])
export const blockTypeEnum = pgEnum('block_type', ['text', 'heading', 'quote', 'code', 'embed'])
export const assetKindEnum = pgEnum('asset_kind', ['image', 'video', 'audio'])
export const reactionValueEnum = pgEnum('reaction_value', ['up', 'down'])
export const reportStatusEnum = pgEnum('report_status', ['pending', 'reviewed', 'dismissed'])
export const oauthProviderEnum = pgEnum('oauth_provider', [
  'google',
  'apple',
  'github',
  'x',
  'facebook',
])

// ─── Tables ──────────────────────────────────────────────────

export const user = pgTable('user', {
  id: uuid().primaryKey().defaultRandom(),
  role: userRoleEnum().notNull().default('reader'),
  email: text().notNull().unique(),
  displayName: text().notNull(),
  avatarUrl: text(),
  bio: text(),
  settings: jsonb(),
  registeredAt: timestamp({ mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp({ mode: 'date' }).$onUpdateFn(() => new Date()),
})

export const oauthAccount = pgTable(
  'oauth_account',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => user.id),
    provider: oauthProviderEnum().notNull(),
    providerAccountId: text().notNull(),
    profile: jsonb(),
  },
  (t) => [uniqueIndex('oauth_provider_account_idx').on(t.provider, t.providerAccountId)],
)

export const category = pgTable('category', {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull().unique(),
  slug: text().notNull().unique(),
  description: text(),
  color: text(),
  order: smallint().default(0),
})

export const tag = pgTable('tag', {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull().unique(),
  slug: text().notNull().unique(),
})

export const article = pgTable('article', {
  id: uuid().primaryKey().defaultRandom(),
  authorId: uuid()
    .notNull()
    .references(() => user.id),
  title: text().notNull(),
  slug: text().notNull().unique(),
  excerpt: text(),
  heroImageUrl: text(),
  ogImageUrl: text(),
  status: articleStatusEnum().notNull().default('draft'),
  metadata: jsonb(),
  publishedAt: timestamp({ mode: 'date' }),
  createdAt: timestamp({ mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp({ mode: 'date' }).$onUpdateFn(() => new Date()),
})

export const articleCategory = pgTable(
  'article_category',
  {
    articleId: uuid()
      .notNull()
      .references(() => article.id),
    categoryId: uuid()
      .notNull()
      .references(() => category.id),
  },
  (t) => [primaryKey({ columns: [t.articleId, t.categoryId] })],
)

export const articleTag = pgTable(
  'article_tag',
  {
    articleId: uuid()
      .notNull()
      .references(() => article.id),
    tagId: uuid()
      .notNull()
      .references(() => tag.id),
  },
  (t) => [primaryKey({ columns: [t.articleId, t.tagId] })],
)

export const articleBlock = pgTable('article_block', {
  id: uuid().primaryKey().defaultRandom(),
  articleId: uuid()
    .notNull()
    .references(() => article.id),
  type: blockTypeEnum().notNull(),
  content: text().notNull(),
  order: smallint().notNull().default(0),
  meta: jsonb(),
})

export const asset = pgTable('asset', {
  id: uuid().primaryKey().defaultRandom(),
  uploaderId: uuid()
    .notNull()
    .references(() => user.id),
  kind: assetKindEnum().notNull(),
  url: text().notNull(),
  altText: text(),
  width: integer(),
  height: integer(),
  durationSec: integer(),
  sizeBytes: integer(),
  createdAt: timestamp({ mode: 'date' }).notNull().defaultNow(),
})

export const blockAsset = pgTable(
  'block_asset',
  {
    blockId: uuid()
      .notNull()
      .references(() => articleBlock.id),
    assetId: uuid()
      .notNull()
      .references(() => asset.id),
    order: smallint().notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.blockId, t.assetId] })],
)

export const comment = pgTable('comment', {
  id: uuid().primaryKey().defaultRandom(),
  articleId: uuid()
    .notNull()
    .references(() => article.id),
  authorId: uuid()
    .notNull()
    .references(() => user.id),
  parentId: uuid().references((): AnyPgColumn => comment.id, { onDelete: 'cascade' }),
  body: text().notNull(),
  createdAt: timestamp({ mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp({ mode: 'date' }).$onUpdateFn(() => new Date()),
})

export const reaction = pgTable('reaction', {
  id: uuid().primaryKey().defaultRandom(),
  userId: uuid()
    .notNull()
    .references(() => user.id),
  value: reactionValueEnum().notNull(),
  articleId: uuid().references(() => article.id),
  commentId: uuid().references(() => comment.id),
  createdAt: timestamp({ mode: 'date' }).notNull().defaultNow(),
})

export const report = pgTable('report', {
  id: uuid().primaryKey().defaultRandom(),
  reporterId: uuid()
    .notNull()
    .references(() => user.id),
  articleId: uuid().references(() => article.id),
  commentId: uuid().references(() => comment.id),
  reason: text().notNull(),
  status: reportStatusEnum().notNull().default('pending'),
  createdAt: timestamp({ mode: 'date' }).notNull().defaultNow(),
  reviewedAt: timestamp({ mode: 'date' }),
})
