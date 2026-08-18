import { GraphQLScalarType, Kind } from 'graphql'

export const GraphQLJSON = new GraphQLScalarType({
  name: 'JSON',
  description:
    'The `JSON` scalar type represents JSON values as specified by [ECMA-404](http://www.ecma-international.org/publications/files/ECMA-ST/ECMA-404.pdf).',

  serialize(value: unknown) {
    return value
  },

  parseValue(value: unknown) {
    return value
  },

  // `variables` carries the operation's coerced variable values, so a variable
  // used inside a JSON literal (`{ theme: $theme }`) resolves to its value
  // instead of being dropped. graphql 16 and 17 both pass it.
  // biome-ignore lint/suspicious/noExplicitAny: JSON scalar returns dynamic types
  parseLiteral(ast, variables): any {
    switch (ast.kind) {
      case Kind.STRING:
      case Kind.BOOLEAN:
        return ast.value
      case Kind.INT:
      case Kind.FLOAT:
        return parseFloat(ast.value)
      case Kind.OBJECT: {
        // biome-ignore lint/suspicious/noExplicitAny: JSON object accumulator
        const value: Record<string, any> = Object.create(null)
        ast.fields.forEach((field) => {
          value[field.name.value] = GraphQLJSON.parseLiteral(field.value, variables)
        })
        return value
      }
      case Kind.LIST:
        return ast.values.map((n) => GraphQLJSON.parseLiteral(n, variables))
      case Kind.NULL:
        return null
      case Kind.VARIABLE:
        return variables?.[ast.name.value]
      default:
        return undefined
    }
  },
})
