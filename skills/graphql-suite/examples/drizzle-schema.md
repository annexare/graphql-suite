# Drizzle Schema Example

Shared example Drizzle schema used across all examples: Users, Posts, and Comments with relations.

```ts
import { relations } from 'drizzle-orm'
import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

// ─── Tables ──────────────────────────────────────────────────

export const user = pgTable('user', {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  email: text().notNull(),
  createdAt: timestamp().defaultNow().notNull(),
})

export const post = pgTable('post', {
  id: uuid().primaryKey().defaultRandom(),
  title: text().notNull(),
  body: text().notNull(),
  published: text().notNull().default('draft'), // 'draft' | 'published' | 'archived'
  userId: uuid().notNull(),
  createdAt: timestamp().defaultNow().notNull(),
})

export const comment = pgTable('comment', {
  id: uuid().primaryKey().defaultRandom(),
  body: text().notNull(),
  postId: uuid().notNull(),
  userId: uuid().notNull(),
  createdAt: timestamp().defaultNow().notNull(),
})

// ─── Relations ───────────────────────────────────────────────

export const userRelations = relations(user, ({ many }) => ({
  posts: many(post),
  comments: many(comment),
}))

export const postRelations = relations(post, ({ one, many }) => ({
  author: one(user, { fields: [post.userId], references: [user.id] }),
  comments: many(comment),
}))

export const commentRelations = relations(comment, ({ one }) => ({
  post: one(post, { fields: [comment.postId], references: [post.id] }),
  author: one(user, { fields: [comment.userId], references: [user.id] }),
}))
```
