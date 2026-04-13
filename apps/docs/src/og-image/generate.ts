import satori from 'satori'
import sharp from 'sharp'

const WIDTH = 1200
const HEIGHT = 630
const ICON_SIZE = 48

// ─── Config ──────────────────────────────────────────────────

export interface OgImageConfig {
  title: string
  description?: string
  icons?: string[]
  accentColor?: string
  domain?: string
}

// ─── Font Loading ────────────────────────────────────────────

async function loadFont(weight: number): Promise<ArrayBuffer> {
  const cssUrl = `https://fonts.googleapis.com/css2?family=Inter:wght@${weight}&display=swap`
  const cssResponse = await fetch(cssUrl, {
    headers: {
      // Use IE11 User-Agent to get TTF format — Satori cannot parse woff2
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Trident/7.0; rv:11.0) like Gecko',
    },
  })
  const css = await cssResponse.text()
  const fontUrl = css.match(/src:\s*url\(([^)]+)\)/)?.[1]
  if (!fontUrl) {
    throw new Error(`Failed to parse font URL for weight ${weight}`)
  }
  const fontResponse = await fetch(fontUrl)
  return fontResponse.arrayBuffer()
}

let fontsPromise: Promise<ArrayBuffer[]> | undefined

function loadFonts(): Promise<ArrayBuffer[]> {
  if (!fontsPromise) {
    fontsPromise = Promise.all([loadFont(400), loadFont(700)])
  }
  return fontsPromise
}

// ─── Helpers ─────────────────────────────────────────────────

function svgToDataUri(svg: string): string {
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
}

// biome-ignore lint/suspicious/noExplicitAny: Satori element tree uses loose types
type SatoriNode = Record<string, any>

// ─── Generator ───────────────────────────────────────────────

export async function generateOgImage(config: OgImageConfig): Promise<Buffer> {
  const [fontRegular, fontBold] = await loadFonts()

  const accentColor = config.accentColor ?? '#e535ab'

  const children: SatoriNode[] = [
    // Accent bar at top
    {
      type: 'div',
      props: {
        style: {
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 6,
          background: accentColor,
        },
      },
    },
    // Title
    {
      type: 'div',
      props: {
        style: {
          fontSize: 56,
          fontWeight: 700,
          color: '#0f172a',
          textAlign: 'center',
          lineHeight: 1.2,
        },
        children: config.title,
      },
    },
  ]

  // Description
  if (config.description) {
    children.push({
      type: 'div',
      props: {
        style: {
          fontSize: 24,
          fontWeight: 400,
          color: '#334155',
          textAlign: 'center',
          lineHeight: 1.5,
          marginTop: 48,
        },
        children: config.description,
      },
    })
  }

  // Tech stack icons
  if (config.icons?.length) {
    children.push({
      type: 'div',
      props: {
        style: {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 24,
          marginTop: 56,
        },
        children: config.icons.map((svg) => ({
          type: 'img',
          props: {
            src: svgToDataUri(svg),
            width: ICON_SIZE,
            height: ICON_SIZE,
          },
        })),
      },
    })
  }

  // Domain — fixed at bottom so it doesn't affect centering of main content
  if (config.domain) {
    children.push({
      type: 'div',
      props: {
        style: {
          position: 'absolute',
          bottom: 32,
          fontSize: 16,
          fontWeight: 400,
          color: '#475569',
        },
        children: config.domain,
      },
    })
  }

  const element: SatoriNode = {
    type: 'div',
    props: {
      style: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        height: '100%',
        background: '#f8fafc',
        fontFamily: 'Inter',
        position: 'relative',
        padding: '40px 285px',
      },
      children,
    },
  }

  const svg = await satori(element, {
    width: WIDTH,
    height: HEIGHT,
    fonts: [
      { name: 'Inter', data: fontRegular, weight: 400, style: 'normal' as const },
      { name: 'Inter', data: fontBold, weight: 700, style: 'normal' as const },
    ],
  })

  return await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer()
}
