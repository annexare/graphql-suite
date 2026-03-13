import { describe, expect, test } from 'bun:test'
import { relations } from 'drizzle-orm'
import { pgTable, text, uuid } from 'drizzle-orm/pg-core'

import type { InferEntityDefs } from './infer'

// ─── Complex Schema Fixture ───────────────────────────────────
// A CMS-like schema with ~16 tables, ~50 relations, self-references,
// cross-table cycles, and junction tables. Exercises the same structural
// patterns that cause TS7056 in real-world schemas:
//   - item → customField → customFieldLink → item (cross-table cycle)
//   - item.templateId → item (self-reference)
//   - many junction tables (itemToItem, tagToItem, etc.)
//
// .references() omitted — FK constraints don't affect TS type inference.

// ─── Tables ──────────────────────────────────────────────────

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

// ─── Full schema ──────────────────────────────────────────────

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

// ─── Depth stress tests ───────────────────────────────────────
// Verify InferEntityDefs compiles at various depths without TS7056.

// Default depth (1) — should always work
type DefsDefault = InferEntityDefs<typeof complexSchema>

// Depth 2 — one level of nested relation filters
type DefsDepth2 = InferEntityDefs<typeof complexSchema, { limitRelationDepth: 2 }>

// Depth 3 — server default
type DefsDepth3 = InferEntityDefs<typeof complexSchema, { limitRelationDepth: 3 }>

// Depth 5 — max supported depth
type DefsDepth5 = InferEntityDefs<typeof complexSchema, { limitRelationDepth: 5 }>

// With table exclusions
type DefsExcluded = InferEntityDefs<
  typeof complexSchema,
  { limitRelationDepth: 3; tables: { exclude: readonly ['attachment', 'snapshotVariant'] } }
>

// ─── Type-level assertions ────────────────────────────────────

type ExpectTrue<T extends [T] extends [true] ? true : never> = T

// Default depth: relation filter at depth 1
type ItemFilters = DefsDefault['item']['filters']
type _1 = ExpectTrue<
  ItemFilters extends { customizations?: { some?: { itemId?: { eq?: string | null } } } }
    ? true
    : false
>

// Depth 2: nested relation filter (customization → item → name)
type CustomizationFiltersD2 = DefsDepth2['customization']['filters']
type _2 = ExpectTrue<
  CustomizationFiltersD2 extends { item?: { name?: { eq?: string | null } } } ? true : false
>

// Depth 3: three levels deep (customizationLink → item → customizations → some → value)
type CustomizationLinkFiltersD3 = DefsDepth3['customizationLink']['filters']
type _3 = ExpectTrue<
  CustomizationLinkFiltersD3 extends {
    linkedItem?: { customizations?: { some?: { value?: { eq?: string | null } } } }
  }
    ? true
    : false
>

// Depth 5: five levels deep
// ruleEntry → rule (1) → parentItem (2) → fields (3) → fieldType (4) → fields (5)
type RuleEntryFiltersD5 = DefsDepth5['ruleEntry']['filters']
type _4a = ExpectTrue<
  RuleEntryFiltersD5 extends {
    rule?: {
      parentItem?: {
        fields?: {
          some?: {
            fieldType?: {
              fields?: { some?: { value?: { eq?: string | null } } }
            }
          }
        }
      }
    }
  }
    ? true
    : false
>

// Exclusions: excluded tables should not appear
type _4 = ExpectTrue<'attachment' extends keyof DefsExcluded ? false : true>
type _5 = ExpectTrue<'item' extends keyof DefsExcluded ? true : false>

// ─── Runtime tests ────────────────────────────────────────────

describe('InferEntityDefs - complex schema', () => {
  test('compiles at depth 1 (default)', () => {
    const _: DefsDefault = {} as DefsDefault
    expect(true).toBe(true)
  })

  test('compiles at depth 2', () => {
    const _: DefsDepth2 = {} as DefsDepth2
    expect(true).toBe(true)
  })

  test('compiles at depth 3 (server default)', () => {
    const _: DefsDepth3 = {} as DefsDepth3
    expect(true).toBe(true)
  })

  test('compiles at depth 5 (max supported)', () => {
    const _: DefsDepth5 = {} as DefsDepth5
    expect(true).toBe(true)
  })

  test('respects table exclusions with depth', () => {
    const _: DefsExcluded = {} as DefsExcluded
    expect(true).toBe(true)
  })

  test('filter type supports deep nested relation filters at depth 3', () => {
    // customizationLink → linkedItem → customizations → some → value filter
    const filter: CustomizationLinkFiltersD3 = {
      linkedItem: {
        customizations: {
          some: {
            value: { like: '%test%' },
          },
        },
      },
    }
    expect(filter.linkedItem?.customizations?.some?.value?.like).toBe('%test%')
  })

  test('filter type supports 5-level nested relation filters at depth 5', () => {
    // ruleEntry → rule → parentItem → fields → fieldType → fields
    const filter: RuleEntryFiltersD5 = {
      rule: {
        parentItem: {
          fields: {
            some: {
              fieldType: {
                fields: {
                  some: { value: { eq: 'deep' } },
                },
              },
            },
          },
        },
      },
    }
    expect(filter.rule?.parentItem?.fields?.some?.fieldType?.fields?.some?.value?.eq).toBe('deep')
  })
})
