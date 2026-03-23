import { describe, expect, test } from 'bun:test'
import { buildSchemaFromDrizzle } from '@graphql-suite/schema'
import { lexicographicSortSchema, parse, printSchema } from 'graphql'

import { schemaConfig } from './config'
import * as drizzleSchema from './db'

// ─── Build Schema ────────────────────────────────────────────

const { schema } = buildSchemaFromDrizzle(drizzleSchema, schemaConfig)

// ─── Tests ───────────────────────────────────────────────────

describe('schema size and performance', () => {
  test('SDL generation completes in under 1s', () => {
    const start = performance.now()
    const sdl = printSchema(lexicographicSortSchema(schema))
    const elapsed = performance.now() - start

    expect(sdl).toBeString()
    expect(elapsed).toBeLessThan(1000)
  })

  test('SDL size is under 200KB', () => {
    const sdl = printSchema(schema)
    const sizeKB = new TextEncoder().encode(sdl).byteLength / 1024

    expect(sizeKB).toBeLessThan(200)
    expect(sizeKB).toBeGreaterThan(1) // sanity: not empty
  })

  test('type count is reasonable', () => {
    const typeMap = schema.getTypeMap()
    const userTypes = Object.keys(typeMap).filter((name) => !name.startsWith('__'))

    // 13 tables with depth=2 relations — should produce hundreds of types
    expect(userTypes.length).toBeGreaterThan(100)
    expect(userTypes.length).toBeLessThan(1000)
  })

  test('printSchema produces valid, parseable SDL', () => {
    const sdl = printSchema(schema)

    // Basic structural checks
    expect(sdl).toContain('type Query')
    expect(sdl).toContain('type Mutation')
    expect(sdl).toContain('type ArticleSelectItem')
    expect(sdl).toContain('type UserSelectItem')
    expect(sdl).toContain('type CommentSelectItem')
    expect(sdl).toContain('enum UserRoleEnum')
    expect(sdl).toContain('enum ArticleStatusEnum')

    // Ensure it can be re-parsed (no syntax errors)
    expect(() => parse(sdl)).not.toThrow()
  })
})
