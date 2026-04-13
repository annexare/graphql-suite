import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = resolve(dirname(fileURLToPath(import.meta.url)), '../../../public/icons')
const read = (name: string) => readFileSync(resolve(dir, name), 'utf-8')

export const graphqlIcon = read('graphql.svg')
export const drizzleIcon = read('drizzle.svg')
export const typescriptIcon = read('typescript.svg')
export const reactIcon = read('react.svg')
