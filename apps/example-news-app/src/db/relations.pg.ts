import { relations } from 'drizzle-orm'

import {
  article,
  articleBlock,
  articleCategory,
  articleTag,
  asset,
  blockAsset,
  category,
  comment,
  oauthAccount,
  reaction,
  report,
  tag,
  user,
} from './schema.pg'

// ─── User ────────────────────────────────────────────────────

export const userRelations = relations(user, ({ many }) => ({
  oauthAccounts: many(oauthAccount),
  articles: many(article),
  comments: many(comment),
  reactions: many(reaction),
  reports: many(report),
  assets: many(asset),
}))

// ─── OAuth Account ───────────────────────────────────────────

export const oauthAccountRelations = relations(oauthAccount, ({ one }) => ({
  user: one(user, { fields: [oauthAccount.userId], references: [user.id] }),
}))

// ─── Category ────────────────────────────────────────────────

export const categoryRelations = relations(category, ({ many }) => ({
  articleCategories: many(articleCategory),
}))

// ─── Tag ─────────────────────────────────────────────────────

export const tagRelations = relations(tag, ({ many }) => ({
  articleTags: many(articleTag),
}))

// ─── Article ─────────────────────────────────────────────────

export const articleRelations = relations(article, ({ one, many }) => ({
  author: one(user, { fields: [article.authorId], references: [user.id] }),
  articleCategories: many(articleCategory),
  articleTags: many(articleTag),
  blocks: many(articleBlock),
  comments: many(comment),
  reactions: many(reaction),
  reports: many(report),
}))

// ─── Article Category (junction) ─────────────────────────────

export const articleCategoryRelations = relations(articleCategory, ({ one }) => ({
  article: one(article, { fields: [articleCategory.articleId], references: [article.id] }),
  category: one(category, { fields: [articleCategory.categoryId], references: [category.id] }),
}))

// ─── Article Tag (junction) ──────────────────────────────────

export const articleTagRelations = relations(articleTag, ({ one }) => ({
  article: one(article, { fields: [articleTag.articleId], references: [article.id] }),
  tag: one(tag, { fields: [articleTag.tagId], references: [tag.id] }),
}))

// ─── Article Block ───────────────────────────────────────────

export const articleBlockRelations = relations(articleBlock, ({ one, many }) => ({
  article: one(article, { fields: [articleBlock.articleId], references: [article.id] }),
  blockAssets: many(blockAsset),
}))

// ─── Asset ───────────────────────────────────────────────────

export const assetRelations = relations(asset, ({ one, many }) => ({
  uploader: one(user, { fields: [asset.uploaderId], references: [user.id] }),
  blockAssets: many(blockAsset),
}))

// ─── Block Asset (junction) ──────────────────────────────────

export const blockAssetRelations = relations(blockAsset, ({ one }) => ({
  block: one(articleBlock, { fields: [blockAsset.blockId], references: [articleBlock.id] }),
  asset: one(asset, { fields: [blockAsset.assetId], references: [asset.id] }),
}))

// ─── Comment ─────────────────────────────────────────────────

export const commentRelations = relations(comment, ({ one, many }) => ({
  article: one(article, { fields: [comment.articleId], references: [article.id] }),
  author: one(user, { fields: [comment.authorId], references: [user.id] }),
  parent: one(comment, { fields: [comment.parentId], references: [comment.id] }),
  replies: many(comment),
  reactions: many(reaction),
  reports: many(report),
}))

// ─── Reaction ────────────────────────────────────────────────

export const reactionRelations = relations(reaction, ({ one }) => ({
  user: one(user, { fields: [reaction.userId], references: [user.id] }),
  article: one(article, { fields: [reaction.articleId], references: [article.id] }),
  comment: one(comment, { fields: [reaction.commentId], references: [comment.id] }),
}))

// ─── Report ──────────────────────────────────────────────────

export const reportRelations = relations(report, ({ one }) => ({
  reporter: one(user, { fields: [report.reporterId], references: [user.id] }),
  article: one(article, { fields: [report.articleId], references: [article.id] }),
  comment: one(comment, { fields: [report.commentId], references: [comment.id] }),
}))
