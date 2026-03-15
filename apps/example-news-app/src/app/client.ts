import { createDrizzleClient } from '@graphql-suite/client'

import { schemaConfig } from '../config'
import * as drizzleSchema from '../db'

export const graphqlClient = createDrizzleClient({
  schema: drizzleSchema,
  config: schemaConfig,
  url: '/graphql',
})
