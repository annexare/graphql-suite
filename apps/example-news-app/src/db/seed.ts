// ─── Static Seed Data ────────────────────────────────────────
// Exported constants for use in seed scripts and tests.
// No database insertion — just plain objects.

export const users = {
  admin: {
    id: '00000000-0000-4000-a000-000000000001',
    role: 'admin' as const,
    email: 'admin@newsapp.dev',
    displayName: 'Ada Admin',
    avatarUrl: 'https://i.pravatar.cc/150?u=admin',
    bio: 'Site administrator and content lead.',
    settings: { theme: 'dark', locale: 'en', notifications: { email: true, push: true } },
  },
  editor: {
    id: '00000000-0000-4000-a000-000000000002',
    role: 'editor' as const,
    email: 'editor@newsapp.dev',
    displayName: 'Ed Editor',
    avatarUrl: 'https://i.pravatar.cc/150?u=editor',
    bio: 'Senior editor covering tech and science.',
    settings: { theme: 'light', locale: 'en', notifications: { email: true, push: false } },
  },
  reader: {
    id: '00000000-0000-4000-a000-000000000003',
    role: 'reader' as const,
    email: 'reader@newsapp.dev',
    displayName: 'Rita Reader',
    avatarUrl: 'https://i.pravatar.cc/150?u=reader',
    bio: null,
    settings: { theme: 'system', locale: 'en', notifications: { email: false, push: false } },
  },
}

export const categories = {
  tech: {
    id: '00000000-0000-4000-b000-000000000001',
    name: 'Technology',
    slug: 'technology',
    description: 'Latest in tech and innovation',
    color: '#3B82F6',
    order: 1,
  },
  science: {
    id: '00000000-0000-4000-b000-000000000002',
    name: 'Science',
    slug: 'science',
    description: 'Scientific discoveries and research',
    color: '#10B981',
    order: 2,
  },
  opinion: {
    id: '00000000-0000-4000-b000-000000000003',
    name: 'Opinion',
    slug: 'opinion',
    description: 'Perspectives and editorials',
    color: '#F59E0B',
    order: 3,
  },
  culture: {
    id: '00000000-0000-4000-b000-000000000004',
    name: 'Culture',
    slug: 'culture',
    description: 'Arts, entertainment, and lifestyle',
    color: '#8B5CF6',
    order: 4,
  },
}

export const tags = {
  ai: { id: '00000000-0000-4000-c000-000000000001', name: 'AI', slug: 'ai' },
  climate: { id: '00000000-0000-4000-c000-000000000002', name: 'Climate', slug: 'climate' },
  space: { id: '00000000-0000-4000-c000-000000000003', name: 'Space', slug: 'space' },
  open_source: {
    id: '00000000-0000-4000-c000-000000000004',
    name: 'Open Source',
    slug: 'open-source',
  },
  web: { id: '00000000-0000-4000-c000-000000000005', name: 'Web', slug: 'web' },
}

export const articles = {
  aiBreakthrough: {
    id: '00000000-0000-4000-d000-000000000001',
    authorId: users.editor.id,
    title: 'AI Breakthrough: New Model Achieves Human-Level Reasoning',
    slug: 'ai-breakthrough-human-level-reasoning',
    excerpt: 'Researchers announce a landmark achievement in artificial intelligence.',
    heroImageUrl: 'https://picsum.photos/seed/ai/1200/630',
    ogImageUrl: 'https://picsum.photos/seed/ai-og/1200/630',
    status: 'published' as const,
    metadata: { readingTime: 5, seoKeywords: ['AI', 'machine learning', 'reasoning'] },
    publishedAt: new Date('2026-03-10T09:00:00Z'),
    createdAt: new Date('2026-03-09T14:30:00Z'),
  },
  climateReport: {
    id: '00000000-0000-4000-d000-000000000002',
    authorId: users.editor.id,
    title: 'Global Climate Report: What the Latest Data Shows',
    slug: 'global-climate-report-latest-data',
    excerpt: 'A comprehensive look at the newest climate data and what it means.',
    heroImageUrl: 'https://picsum.photos/seed/climate/1200/630',
    ogImageUrl: null,
    status: 'published' as const,
    metadata: { readingTime: 8, seoKeywords: ['climate', 'environment', 'data'] },
    publishedAt: new Date('2026-03-12T11:00:00Z'),
    createdAt: new Date('2026-03-11T08:00:00Z'),
  },
  webFuture: {
    id: '00000000-0000-4000-d000-000000000003',
    authorId: users.admin.id,
    title: 'The Future of the Web Platform',
    slug: 'future-web-platform',
    excerpt: 'Exploring upcoming web standards and where the platform is headed.',
    heroImageUrl: 'https://picsum.photos/seed/web/1200/630',
    ogImageUrl: null,
    status: 'draft' as const,
    metadata: { readingTime: 6, seoKeywords: ['web', 'standards', 'browser'] },
    publishedAt: null,
    createdAt: new Date('2026-03-14T16:00:00Z'),
  },
}

export const articleBlocks = {
  aiIntro: {
    id: '00000000-0000-4000-e000-000000000001',
    articleId: articles.aiBreakthrough.id,
    type: 'text' as const,
    content:
      'In a stunning development, researchers have demonstrated an AI system capable of multi-step logical reasoning that matches human performance on standardized tests.',
    order: 0,
    meta: null,
  },
  aiHeading: {
    id: '00000000-0000-4000-e000-000000000002',
    articleId: articles.aiBreakthrough.id,
    type: 'heading' as const,
    content: 'How It Works',
    order: 1,
    meta: { level: 2 },
  },
  aiBody: {
    id: '00000000-0000-4000-e000-000000000003',
    articleId: articles.aiBreakthrough.id,
    type: 'text' as const,
    content:
      'The system uses a novel architecture that combines chain-of-thought prompting with reinforcement learning from human feedback.',
    order: 2,
    meta: null,
  },
  aiCode: {
    id: '00000000-0000-4000-e000-000000000004',
    articleId: articles.aiBreakthrough.id,
    type: 'code' as const,
    content: 'const result = await model.reason({ steps: "chain-of-thought" })',
    order: 3,
    meta: { language: 'typescript' },
  },
  climateIntro: {
    id: '00000000-0000-4000-e000-000000000010',
    articleId: articles.climateReport.id,
    type: 'text' as const,
    content: 'The latest IPCC data paints a complex picture of our changing climate.',
    order: 0,
    meta: null,
  },
  climateQuote: {
    id: '00000000-0000-4000-e000-000000000011',
    articleId: articles.climateReport.id,
    type: 'quote' as const,
    content: 'We are at a critical inflection point for climate action.',
    order: 1,
    meta: null,
  },
}

export const assets = {
  aiDiagram: {
    id: '00000000-0000-4000-f000-000000000001',
    uploaderId: users.editor.id,
    kind: 'image' as const,
    url: 'https://picsum.photos/seed/diagram/800/600',
    altText: 'AI architecture diagram',
    width: 800,
    height: 600,
    durationSec: null,
    sizeBytes: 245_000,
  },
}

export const comments = {
  topLevel: {
    id: '00000000-0000-4000-aa00-000000000001',
    articleId: articles.aiBreakthrough.id,
    authorId: users.reader.id,
    parentId: null,
    body: 'This is fascinating! I wonder how it compares to previous approaches.',
  },
  reply: {
    id: '00000000-0000-4000-aa00-000000000002',
    articleId: articles.aiBreakthrough.id,
    authorId: users.editor.id,
    parentId: '00000000-0000-4000-aa00-000000000001',
    body: 'Great question — the key difference is the chain-of-thought architecture.',
  },
  secondTop: {
    id: '00000000-0000-4000-aa00-000000000003',
    articleId: articles.climateReport.id,
    authorId: users.reader.id,
    parentId: null,
    body: 'Important reporting. More people need to see this data.',
  },
}

export const reactions = {
  upOnArticle: {
    id: '00000000-0000-4000-ab00-000000000001',
    userId: users.reader.id,
    value: 'up' as const,
    articleId: articles.aiBreakthrough.id,
    commentId: null,
  },
  upOnComment: {
    id: '00000000-0000-4000-ab00-000000000002',
    userId: users.admin.id,
    value: 'up' as const,
    articleId: null,
    commentId: comments.topLevel.id,
  },
}

// ─── Junction Table Data ─────────────────────────────────────

export const articleCategories = [
  { articleId: articles.aiBreakthrough.id, categoryId: categories.tech.id },
  { articleId: articles.aiBreakthrough.id, categoryId: categories.science.id },
  { articleId: articles.climateReport.id, categoryId: categories.science.id },
  { articleId: articles.webFuture.id, categoryId: categories.tech.id },
]

export const articleTags = [
  { articleId: articles.aiBreakthrough.id, tagId: tags.ai.id },
  { articleId: articles.climateReport.id, tagId: tags.climate.id },
  { articleId: articles.webFuture.id, tagId: tags.web.id },
  { articleId: articles.webFuture.id, tagId: tags.open_source.id },
]

export const blockAssets = [
  { blockId: articleBlocks.aiCode.id, assetId: assets.aiDiagram.id, order: 0 },
]
