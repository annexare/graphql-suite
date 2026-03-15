# Example News App

A news website example showcasing `graphql-suite` with a medium-complexity Drizzle schema (13 tables, 7 enums, junction tables, self-referencing comments, JSONB fields).

## Schema Overview

- **Users** with roles (admin/editor/reader) and OAuth accounts
- **Articles** with blocks (text, heading, quote, code, embed), categories, tags
- **Assets** (images, video, audio) linked to blocks
- **Comments** with threaded replies (self-referencing)
- **Reactions** and **Reports** (polymorphic — target article or comment)

## Quick Start

```bash
# Install dependencies (from repo root)
bun install

# Run tests (no database required)
bun test

# Run with a database
export DATABASE_URL="postgres://user:pass@localhost:5432/news_app"
bun run db:push        # Apply schema to DB
bun run db:seed        # Insert sample data
bun run dev            # Start server at http://localhost:4000
```

## Scripts

| Script | Description |
|--------|-------------|
| `bun run dev` | Start the server (requires `DATABASE_URL`) |
| `bun test` | Run all tests (no database needed) |
| `bun run build:app` | Bundle the React SPA |
| `bun run db:generate` | Generate Drizzle migrations |
| `bun run db:migrate` | Run migrations |
| `bun run db:push` | Push schema directly (dev) |
| `bun run db:seed` | Insert seed data |

## Tests

All schema tests use `buildSchemaFromDrizzle()` — no database connection required:

- **`schema.test.ts`** — Verifies all query/mutation types, enums, relations, filters, and junction table read-only config
- **`schema-size.test.ts`** — SDL generation performance, size limits, and parseability
- **`ArticleList.test.tsx`** — Component tests with mock GraphQL client
- **`ArticleView.test.tsx`** — Component tests for article detail view

## Schema Config Tuning

The `BuildSchemaConfig` in `src/config.ts` controls the generated GraphQL schema's size and complexity. For this 13-table schema with many cross-references, the limits have a dramatic impact:

| `limitRelationDepth` | `limitSelfRelationDepth` | Types | SDL Size | SDL Gen Time |
|---|---|---|---|---|
| 2 | 1 | ~450 | ~138 KB | ~40ms |
| 3 | 1 | ~1,100 | ~372 KB | ~100ms |
| 3 | 2 | ~1,100 | ~372 KB | ~100ms |
| 5 | 2 | ~8,900 | ~3,500 KB | ~350ms |

**Key takeaway:** relation depth has a compounding effect on highly-connected schemas. Each additional depth level expands every relation path, so a jump from depth 2 to 5 can produce **20x more types**. For this news app schema:

- **Depth 2** (recommended for most apps) gives a manageable ~450 types with full coverage of immediate relations and one level of nesting.
- **Depth 3** triples the type count due to the many circular relations (article -> author -> articles -> comments -> ...).
- **Depth 5** explodes to nearly 9,000 types and 3.5 MB of SDL — impractical for most use cases.

The `limitSelfRelationDepth` setting controls self-referential relations like `comment.replies -> comment`. At depth 1, self-relations are omitted from the top-level type (but still traversable via nested types). At depth 2, one level of self-nesting is included.

**Recommendation:** Start with `limitRelationDepth: 2` and increase only if your client queries need deeper nesting. Use `pruneRelations` to selectively remove back-references that cause the most expansion (e.g., `'user.reactions': false`).
