import { drizzle } from 'drizzle-orm/bun-sql'

import * as schema from '../db'
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

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error('DATABASE_URL environment variable is required')
  process.exit(1)
}

const db = drizzle({ connection: DATABASE_URL, schema })

console.log('Seeding database...')

// Insert in dependency order
await db.insert(schema.user).values(Object.values(users))
console.log('  Users inserted')

await db.insert(schema.category).values(Object.values(categories))
console.log('  Categories inserted')

await db.insert(schema.tag).values(Object.values(tags))
console.log('  Tags inserted')

await db.insert(schema.article).values(Object.values(articles))
console.log('  Articles inserted')

await db.insert(schema.articleCategory).values(articleCategories)
console.log('  Article-Category links inserted')

await db.insert(schema.articleTag).values(articleTags)
console.log('  Article-Tag links inserted')

await db.insert(schema.articleBlock).values(Object.values(articleBlocks))
console.log('  Article blocks inserted')

await db.insert(schema.asset).values(Object.values(assets))
console.log('  Assets inserted')

await db.insert(schema.blockAsset).values(blockAssets)
console.log('  Block-Asset links inserted')

await db.insert(schema.comment).values(Object.values(comments))
console.log('  Comments inserted')

await db.insert(schema.reaction).values(Object.values(reactions))
console.log('  Reactions inserted')

console.log('Seed complete!')
process.exit(0)
