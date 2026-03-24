# AGENTS.md - Coding Agent Guidelines

## Project Overview

Bun monorepo with three workspace packages that bridge Drizzle ORM and GraphQL:

- **`packages/schema`** - Server-side GraphQL schema builder from Drizzle table definitions (PostgreSQL)
- **`packages/client`** - Type-safe GraphQL client with entity-based API
- **`packages/query`** - React hooks wrapping `@tanstack/react-query` for the client

## Build / Lint / Test Commands

```bash
# Install dependencies
bun install

# Build all packages (schema + client first, then query)
bun run build

# Type-check all packages
bun run check-types

# Lint and format (Biome - auto-fixes)
bun run lint

# Run ALL tests across all packages
bun run test

# Run tests for a single package
bun test                                    # in a package directory
bun run --filter '@graphql-suite/schema' test
bun run --filter '@graphql-suite/client' test

# Run a single test file
bun test packages/schema/src/schema-builder.test.ts

# Run tests matching a pattern
bun test --test-name-pattern "builds basic list"
```

Build order matters: `schema` and `client` must build before `query` (query depends on client).

## Workspace Package Layout

```
packages/
  schema/   -> @graphql-suite/schema   (peer: drizzle-orm, graphql)
  client/   -> @graphql-suite/client   (peer: drizzle-orm)
  query/    -> @graphql-suite/query    (peer: react, @tanstack/react-query)
```

Each package has `src/index.ts` as entry point, builds with `bun build` to `dist/`, and emits `.d.ts` via `tsc -p tsconfig.build.json`.

## Code Style

### Formatter & Linter: Biome

All formatting and linting is handled by Biome (not ESLint/Prettier). Run `bun run lint` to auto-fix.

Key settings:
- **Indent**: 2 spaces
- **Line width**: 100 characters
- **Quotes**: single quotes (`'`)
- **Semicolons**: omitted (ASI-style, no trailing semicolons)
- **Trailing commas**: always (including function parameters)
- **Arrow parens**: always (`(x) => ...`, not `x => ...`)
- **Bracket spacing**: `{ foo }` not `{foo}`
- **Line endings**: LF

### Import Organization

Biome auto-organizes imports into groups separated by blank lines:

```typescript
// 1. External packages (with or without protocol)
import { relations } from 'drizzle-orm'
import { pgTable, text, uuid } from 'drizzle-orm/pg-core'
import type { GraphQLSchema } from 'graphql'

// 2. Aliases (path aliases like @graphql-suite/client)
import type { AnyEntityDefs } from '@graphql-suite/client'

// 3. Relative paths
import { SchemaBuilder } from './schema-builder'
import type { BuildSchemaConfig } from './types'
```

- Use `import type { ... }` for type-only imports (enforced by TypeScript strict mode).
- Unused imports produce warnings; unused variables produce warnings.

### TypeScript

- **Strict mode** enabled globally (`"strict": true`)
- **Target**: ESNext, **Module**: ESNext, **moduleResolution**: bundler
- All packages are `"type": "module"` (ESM only)
- Prefer explicit return types on exported functions
- Use `as const` for literal types, `satisfies` for type-checked object literals

### Naming Conventions

- **Files**: `kebab-case.ts` (e.g., `schema-builder.ts`, `case-ops.ts`, `type-builder.ts`)
- **Test files**: co-located as `<name>.test.ts` (e.g., `schema-builder.test.ts`)
- **Classes**: PascalCase (`SchemaBuilder`, `GraphQLClient`, `PgAdapter`)
- **Types/Interfaces**: PascalCase, prefer `type` over `interface` (`EntityDef`, `BuildSchemaConfig`)
- **Functions/variables**: camelCase (`buildSchema`, `createClient`, `uncapitalize`)
- **Constants**: camelCase for module-level consts (not SCREAMING_SNAKE)
- **Generics**: `T` prefix (`TSchema`, `TDefs`, `TEntity`, `TWithOrder`)

### Error Handling

- Throw descriptive `Error` with `"GraphQL-Suite Error: ..."` prefix in schema package
- Use custom error classes for client errors: `GraphQLClientError`, `NetworkError`
- In GraphQL resolvers, catch errors and re-throw as `GraphQLError`
- Pattern for resolver error handling:
  ```typescript
  catch (e: unknown) {
    if (typeof e === 'object' && e !== null && 'message' in e && typeof e.message === 'string') {
      throw new GraphQLError(e.message)
    }
    throw e
  }
  ```

### `noExplicitAny` Suppression Pattern

The codebase allows `any` where Drizzle/GraphQL generics require it, always with an inline suppression comment explaining why:

```typescript
// biome-ignore lint/suspicious/noExplicitAny: Drizzle generic parameters
db: PgDatabase<any, any, any>
```

Always include a reason after the colon. Common reasons:
- `Drizzle generic parameters`
- `GraphQL resolver signature`
- `mock db for testing`
- `consumer-facing loose type`
- `matches GraphQL's own GraphQLFieldConfig signature`

### Section Comments

Use ASCII box-style section headers to organize long files:

```typescript
// ─── Public API ──────────────────────────────────────────────
// ─── Helpers ─────────────────────────────────────────────────
// ─── Test Schema ─────────────────────────────────────────────
```

### Testing

- Framework: **Bun test** (`bun:test`)
- Imports: `import { describe, expect, test } from 'bun:test'`
- Coverage enabled by default via `bunfig.toml`
- Tests use mock DB objects (no real database connection needed):
  ```typescript
  const mockDb = {
    _: { fullSchema: schema, schema: tables, tableNamesMap },
    query: { tableName: { findMany: () => Promise.resolve([]), findFirst: () => Promise.resolve(null) } },
    select: () => ({ from: () => ({ where: () => ({}) }) }),
  }
  ```
- Use `as any` with biome-ignore comment when casting mock objects
- Test structure: `describe` blocks per feature, `test` (not `it`) for individual cases

### React (query package)

- JSX uses `react-jsx` transform (no `import React`)
- Client components marked with `'use client'` directive
- Hooks follow `use<Name>` convention: `useEntityQuery`, `useEntityMutation`, `useEntityList`

### Dependencies

- Use exact versions for `bun install` (configured in `bunfig.toml`: `exact = true`)
- Peer dependencies specify minimum versions with `>=` (e.g., `"drizzle-orm": ">=0.44.0"`)
- Packages are published to npm; the root re-exports all three via subpath exports

## Documentation

Any change to public API, default values, config options, or behavior **must** be reflected across all four surfaces:

1. **Tests** (`packages/*/src/*.test.ts`) — feature coverage and regression prevention
2. **Docs site** (`apps/docs/src/content/docs/`) — user-facing Astro/Starlight docs
3. **Skills** (`skills/graphql-suite/`) — AI agent reference (SKILL.md, references/, examples/, patterns/)
4. **READMEs** (`packages/*/README.md`, root `README.md`) — npm package pages

Key files to update per area:

| Area | Tests | Docs page | Skill file |
|------|-------|-----------|------------|
| Schema config | `schema-builder.test.ts` | `schema/config.mdx` | `references/configuration.md` |
| Schema API | `schema-builder.test.ts` | `reference/schema-api.mdx` | `references/schema-api.md` |
| Client operations | `entity.test.ts` | `client/entity-client.mdx` | `references/client-api.md` |
| Client API | `client.test.ts` | `reference/client-api.mdx` | `references/client-api.md` |
| Query hooks | `useEntity*.test.tsx` | `query/queries.mdx`, `query/mutations.mdx` | `references/query-api.md` |
| Permissions | `permissions.test.ts` | `schema/permissions.mdx` | `references/permissions.md` |
| Hooks | `row-security.test.ts` | `schema/hooks.mdx` | `patterns/hooks-patterns.md` |
| Codegen | `codegen.test.ts` | `schema/codegen.mdx` | `references/codegen.md` |
| Type inference | `infer.test.ts` | `client/type-inference.mdx` | `references/client-api.md` |

Verify after changes:
- `bun run test` — all tests pass
- `bun run check-types` — no type errors
- `cd apps/docs && bun run build` — docs build
