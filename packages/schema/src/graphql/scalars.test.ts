import { describe, expect, test } from 'bun:test'
import { parseValue } from 'graphql'

import { GraphQLJSON } from './scalars'

/** Builds a real `ValueNode` from GraphQL literal syntax. */
const literal = (source: string) => parseValue(source)

describe('GraphQLJSON', () => {
  describe('serialize', () => {
    test('returns value as-is', () => {
      expect(GraphQLJSON.serialize('hello')).toBe('hello')
      expect(GraphQLJSON.serialize(42)).toBe(42)
      expect(GraphQLJSON.serialize(null)).toBeNull()
      const obj = { a: 1 }
      expect(GraphQLJSON.serialize(obj)).toBe(obj)
    })
  })

  describe('parseValue', () => {
    test('returns value as-is', () => {
      expect(GraphQLJSON.parseValue('hello')).toBe('hello')
      expect(GraphQLJSON.parseValue(42)).toBe(42)
      const arr = [1, 2]
      expect(GraphQLJSON.parseValue(arr)).toBe(arr)
    })
  })

  describe('parseLiteral', () => {
    test('parses STRING kind', () => {
      expect(GraphQLJSON.parseLiteral(literal('"test"'), {})).toBe('test')
    })

    test('parses BOOLEAN kind', () => {
      expect(GraphQLJSON.parseLiteral(literal('true'), {})).toBe(true)
      expect(GraphQLJSON.parseLiteral(literal('false'), {})).toBe(false)
    })

    test('parses INT kind', () => {
      expect(GraphQLJSON.parseLiteral(literal('42'), {})).toBe(42)
    })

    test('parses FLOAT kind', () => {
      expect(GraphQLJSON.parseLiteral(literal('3.14'), {})).toBe(3.14)
    })

    test('parses NULL kind', () => {
      expect(GraphQLJSON.parseLiteral(literal('null'), {})).toBeNull()
    })

    test('parses OBJECT kind with nested fields', () => {
      expect(GraphQLJSON.parseLiteral(literal('{ key: "val", num: 10 }'), {})).toEqual({
        key: 'val',
        num: 10,
      })
    })

    test('parses LIST kind with nested values', () => {
      expect(GraphQLJSON.parseLiteral(literal('[1, "two"]'), {})).toEqual([1, 'two'])
    })

    test('returns undefined for unknown kind', () => {
      expect(GraphQLJSON.parseLiteral(literal('FOO'), {})).toBeUndefined()
    })

    test('resolves a variable to its value', () => {
      expect(GraphQLJSON.parseLiteral(literal('$theme'), { theme: 'dark' })).toBe('dark')
    })

    test('resolves variables nested inside an object literal', () => {
      expect(
        GraphQLJSON.parseLiteral(literal('{ a: 1, b: $nested }'), { nested: { z: 9 } }),
      ).toEqual({ a: 1, b: { z: 9 } })
    })

    test('resolves variables nested inside a list literal', () => {
      expect(GraphQLJSON.parseLiteral(literal('[1, $x]'), { x: 'two' })).toEqual([1, 'two'])
    })

    test('yields undefined for a variable with no value', () => {
      expect(GraphQLJSON.parseLiteral(literal('$missing'), {})).toBeUndefined()
      expect(GraphQLJSON.parseLiteral(literal('$missing'), undefined)).toBeUndefined()
    })
  })
})
