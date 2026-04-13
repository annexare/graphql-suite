import type { APIRoute, GetStaticPaths } from 'astro'

import { generateAppIcon } from '../og-image/generate'
import { drizzleIcon, graphqlIcon, reactIcon, typescriptIcon } from '../og-image/icons'

const SIZES = [128, 180, 192, 512]

export const getStaticPaths: GetStaticPaths = () => {
  return SIZES.map((size) => ({ params: { size: String(size) } }))
}

export const GET: APIRoute = async ({ params }) => {
  const size = Number(params.size)
  if (!SIZES.includes(size)) {
    return new Response('Not found', { status: 404 })
  }

  const png = await generateAppIcon({
    size,
    icons: [graphqlIcon, drizzleIcon, typescriptIcon, reactIcon],
  })

  return new Response(png, {
    headers: { 'Content-Type': 'image/png' },
  })
}
