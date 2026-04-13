import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const dir = resolve(process.cwd(), 'public/icons')
const read = (name: string) => readFileSync(resolve(dir, name), 'utf-8')

export const graphqlIcon = read('graphql.svg')
export const drizzleIcon = read('drizzle.svg')
export const typescriptIcon = read('typescript.svg')
export const reactIcon = read('react.svg')
