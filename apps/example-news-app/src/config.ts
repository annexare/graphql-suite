import type { BuildSchemaConfig } from '@graphql-suite/schema'

export const schemaConfig = {
  mutations: true,
  limitRelationDepth: 2,
  limitSelfRelationDepth: 1,
  suffixes: { list: 'List', single: '' },
  tables: {
    config: {
      articleCategory: { queries: true, mutations: false },
      articleTag: { queries: true, mutations: false },
      blockAsset: { queries: true, mutations: false },
    },
  },
} as const satisfies BuildSchemaConfig
