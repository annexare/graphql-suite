import { describe, expect, test } from 'bun:test'
import { relations } from 'drizzle-orm'
import { pgTable, text, uuid } from 'drizzle-orm/pg-core'

import { createDrizzleClient } from './client'
import type { EntityClient } from './entity'
import type { InferEntityDefs } from './infer'
import type { EntityDefsRef, InferResult } from './types'

// ─── Complex Schema (same as infer-complex.test.ts) ──────────

const item = pgTable('item', {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  label: text(),
  categoryId: uuid().notNull(),
  templateId: uuid(),
  selectedVariantId: uuid(),
})

const category = pgTable('category', {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  label: text(),
})

const field = pgTable('field', {
  id: uuid().primaryKey().defaultRandom(),
  itemId: uuid().notNull(),
  fieldTypeId: uuid().notNull(),
  value: text(),
})

const fieldType = pgTable('field_type', {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  label: text(),
})

const fieldTypeToCategory = pgTable('field_type_to_category', {
  id: uuid().primaryKey().defaultRandom(),
  fieldTypeId: uuid().notNull(),
  categoryId: uuid().notNull(),
})

const customization = pgTable('customization', {
  id: uuid().primaryKey().defaultRandom(),
  itemId: uuid().notNull(),
  fieldId: uuid().notNull(),
  value: text(),
})

const customizationLink = pgTable('customization_link', {
  id: uuid().primaryKey().defaultRandom(),
  customizationId: uuid().notNull(),
  linkedItemId: uuid().notNull(),
})

const customizationRef = pgTable('customization_ref', {
  id: uuid().primaryKey().defaultRandom(),
  customizationId: uuid().notNull(),
  fieldId: uuid().notNull(),
})

const itemToItem = pgTable('item_to_item', {
  id: uuid().primaryKey().defaultRandom(),
  parentItemId: uuid().notNull(),
  childItemId: uuid().notNull(),
  sortOrder: text(),
})

const attachment = pgTable('attachment', {
  id: uuid().primaryKey().defaultRandom(),
  itemId: uuid().notNull(),
  fileExt: text(),
  fileSize: text(),
})

const snapshot = pgTable('snapshot', {
  id: uuid().primaryKey().defaultRandom(),
  itemId: uuid(),
  presetId: uuid().notNull(),
})

const preset = pgTable('preset', {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  label: text(),
})

const categoryToPreset = pgTable('category_to_preset', {
  id: uuid().primaryKey().defaultRandom(),
  categoryId: uuid().notNull(),
  presetId: uuid().notNull(),
})

const rule = pgTable('rule', {
  id: uuid().primaryKey().defaultRandom(),
  parentItemId: uuid().notNull(),
})

const ruleEntry = pgTable('rule_entry', {
  id: uuid().primaryKey().defaultRandom(),
  ruleId: uuid().notNull(),
  variantId: uuid().notNull(),
})

const snapshotVariant = pgTable('snapshot_variant', {
  id: uuid().primaryKey().defaultRandom(),
  snapshotId: uuid().notNull(),
  variantId: uuid().notNull(),
})

// ─── Relations ────────────────────────────────────────────────

const itemRelations = relations(item, ({ one, many }) => ({
  category: one(category, { fields: [item.categoryId], references: [category.id] }),
  template: one(item, {
    fields: [item.templateId],
    references: [item.id],
    relationName: 'template',
  }),
  selectedVariant: one(item, {
    fields: [item.selectedVariantId],
    references: [item.id],
    relationName: 'selectedVariant',
  }),
  attachment: one(attachment),
  fields: many(field),
  customizations: many(customization),
  parentLinks: many(itemToItem, { relationName: 'childItem' }),
  childLinks: many(itemToItem, { relationName: 'parentItem' }),
  snapshots: many(snapshot),
}))

const categoryRelations = relations(category, ({ many }) => ({
  items: many(item),
  fieldTypeCategories: many(fieldTypeToCategory),
  presets: many(categoryToPreset),
}))

const fieldRelations = relations(field, ({ one }) => ({
  item: one(item, { fields: [field.itemId], references: [item.id] }),
  fieldType: one(fieldType, { fields: [field.fieldTypeId], references: [fieldType.id] }),
}))

const fieldTypeRelations = relations(fieldType, ({ many }) => ({
  fields: many(field),
  fieldTypeCategories: many(fieldTypeToCategory),
}))

const fieldTypeToCategoryRelations = relations(fieldTypeToCategory, ({ one }) => ({
  fieldType: one(fieldType, {
    fields: [fieldTypeToCategory.fieldTypeId],
    references: [fieldType.id],
  }),
  category: one(category, {
    fields: [fieldTypeToCategory.categoryId],
    references: [category.id],
  }),
}))

const customizationRelations = relations(customization, ({ one }) => ({
  item: one(item, { fields: [customization.itemId], references: [item.id] }),
  field: one(field, { fields: [customization.fieldId], references: [field.id] }),
  linkedItem: one(customizationLink),
  linkedField: one(customizationRef),
}))

const customizationLinkRelations = relations(customizationLink, ({ one }) => ({
  customization: one(customization, {
    fields: [customizationLink.customizationId],
    references: [customization.id],
  }),
  linkedItem: one(item, {
    fields: [customizationLink.linkedItemId],
    references: [item.id],
  }),
}))

const customizationRefRelations = relations(customizationRef, ({ one }) => ({
  customization: one(customization, {
    fields: [customizationRef.customizationId],
    references: [customization.id],
  }),
  field: one(field, {
    fields: [customizationRef.fieldId],
    references: [field.id],
  }),
}))

const itemToItemRelations = relations(itemToItem, ({ one }) => ({
  parentItem: one(item, {
    fields: [itemToItem.parentItemId],
    references: [item.id],
    relationName: 'parentItem',
  }),
  childItem: one(item, {
    fields: [itemToItem.childItemId],
    references: [item.id],
    relationName: 'childItem',
  }),
}))

const attachmentRelations = relations(attachment, ({ one }) => ({
  item: one(item, { fields: [attachment.itemId], references: [item.id] }),
}))

const snapshotRelations = relations(snapshot, ({ one, many }) => ({
  item: one(item, { fields: [snapshot.itemId], references: [item.id] }),
  preset: one(preset, { fields: [snapshot.presetId], references: [preset.id] }),
  variants: many(snapshotVariant),
}))

const presetRelations = relations(preset, ({ many }) => ({
  snapshots: many(snapshot),
  categoryPresets: many(categoryToPreset),
}))

const categoryToPresetRelations = relations(categoryToPreset, ({ one }) => ({
  category: one(category, {
    fields: [categoryToPreset.categoryId],
    references: [category.id],
  }),
  preset: one(preset, {
    fields: [categoryToPreset.presetId],
    references: [preset.id],
  }),
}))

const ruleRelations = relations(rule, ({ one, many }) => ({
  parentItem: one(item, { fields: [rule.parentItemId], references: [item.id] }),
  entries: many(ruleEntry),
}))

const ruleEntryRelations = relations(ruleEntry, ({ one }) => ({
  rule: one(rule, { fields: [ruleEntry.ruleId], references: [rule.id] }),
  variant: one(item, { fields: [ruleEntry.variantId], references: [item.id] }),
}))

const snapshotVariantRelations = relations(snapshotVariant, ({ one }) => ({
  snapshot: one(snapshot, { fields: [snapshotVariant.snapshotId], references: [snapshot.id] }),
  variant: one(item, { fields: [snapshotVariant.variantId], references: [item.id] }),
}))

const complexSchema = {
  item,
  category,
  field,
  fieldType,
  fieldTypeToCategory,
  customization,
  customizationLink,
  customizationRef,
  itemToItem,
  attachment,
  snapshot,
  preset,
  categoryToPreset,
  rule,
  ruleEntry,
  snapshotVariant,
  itemRelations,
  categoryRelations,
  fieldRelations,
  fieldTypeRelations,
  fieldTypeToCategoryRelations,
  customizationRelations,
  customizationLinkRelations,
  customizationRefRelations,
  itemToItemRelations,
  attachmentRelations,
  snapshotRelations,
  presetRelations,
  categoryToPresetRelations,
  ruleRelations,
  ruleEntryRelations,
  snapshotVariantRelations,
}

// ─── Exported Entity Client Values ────────────────────────────
// This is the pattern that triggers TS7056 without EntityDefsRef.
// When a value (not a type alias) is exported, TS must serialize
// its full type — EntityDefsRef prevents expansion of TDefs.

const config = { limitRelationDepth: 5 } as const

const client = createDrizzleClient({
  schema: complexSchema,
  config,
  url: 'http://localhost:3000/api/graphql',
})

// These exports would previously cause TS7056 at depth >= 2
export const itemEntity = client.entity('item')
export const categoryEntity = client.entity('category')
export const fieldEntity = client.entity('field')
export const ruleEntryEntity = client.entity('ruleEntry')

// ─── Type-level assertions ────────────────────────────────────

type Defs = InferEntityDefs<typeof complexSchema, typeof config>
type ExpectTrue<T extends [T] extends [true] ? true : never> = T

// Verify exported entity clients have correct types
type ItemEntity = typeof itemEntity
type _1 = ExpectTrue<ItemEntity extends EntityClient<EntityDefsRef<Defs>, 'item'> ? true : false>

// Verify InferResult works through the ref wrapper
type ItemResult = InferResult<Defs, Defs['item'], { id: true; name: true }>
type _2 = ExpectTrue<ItemResult extends { id: string; name: string } ? true : false>

// Verify nested relation results work
type ItemWithCategory = InferResult<
  Defs,
  Defs['item'],
  { id: true; name: true; category: { id: true; name: true } }
>
type _3 = ExpectTrue<
  ItemWithCategory extends {
    id: string
    name: string
    category: { id: string; name: string } | null
  }
    ? true
    : false
>

// ─── Runtime tests ────────────────────────────────────────────

describe('EntityClient export (TS7056 fix)', () => {
  test('exported entity clients are defined', () => {
    expect(itemEntity).toBeDefined()
    expect(categoryEntity).toBeDefined()
    expect(fieldEntity).toBeDefined()
    expect(ruleEntryEntity).toBeDefined()
  })

  test('exported entity client has all methods', () => {
    expect(typeof itemEntity.query).toBe('function')
    expect(typeof itemEntity.querySingle).toBe('function')
    expect(typeof itemEntity.count).toBe('function')
    expect(typeof itemEntity.insert).toBe('function')
    expect(typeof itemEntity.insertSingle).toBe('function')
    expect(typeof itemEntity.update).toBe('function')
    expect(typeof itemEntity.delete).toBe('function')
  })
})
