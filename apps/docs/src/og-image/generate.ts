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

export interface AppIconConfig {
  size: number
  icons: string[]
  accentColor?: string
}

// ─── Font Loading ────────────────────────────────────────────

async function loadFont(weight: number): Promise<ArrayBuffer> {
  const cssUrl = `https://fonts.googleapis.com/css2?family=Inter:wght@${weight}&display=swap`
  const cssResponse = await fetch(cssUrl, {
    headers: {
      // Use IE11 User-Agent to get TTF format — Satori cannot parse woff2
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Trident/7.0; rv:11.0) like Gecko',
    },
    signal: AbortSignal.timeout(10_000),
  })
  if (!cssResponse.ok) {
    throw new Error(`Failed to fetch font CSS (weight ${weight}): ${cssResponse.status}`)
  }
  const css = await cssResponse.text()
  const fontUrl = css.match(/src:\s*url\(([^)]+)\)/)?.[1]?.replace(/^['"]|['"]$/g, '')
  if (!fontUrl) {
    throw new Error(`Failed to parse font URL for weight ${weight}`)
  }
  const fontResponse = await fetch(fontUrl, { signal: AbortSignal.timeout(10_000) })
  if (!fontResponse.ok) {
    throw new Error(`Failed to fetch font file (weight ${weight}): ${fontResponse.status}`)
  }
  return fontResponse.arrayBuffer()
}

let fontsPromise: Promise<ArrayBuffer[]> | undefined

function loadFonts(): Promise<ArrayBuffer[]> {
  if (!fontsPromise) {
    fontsPromise = Promise.all([loadFont(300), loadFont(400), loadFont(700)]).catch((error) => {
      fontsPromise = undefined
      throw error
    })
  }
  return fontsPromise
}

// ─── Helpers ─────────────────────────────────────────────────

function roundSvg(svg: string, radius: number): string {
  // Extract viewBox dimensions to create a matching clipPath
  const vb = svg.match(/viewBox="0 0 (\d+\.?\d*) (\d+\.?\d*)"/)
  if (!vb) return svg
  const [w, h] = [vb[1], vb[2]]
  const clipPath = `<defs><clipPath id="r"><rect width="${w}" height="${h}" rx="${radius}"/></clipPath></defs>`
  return svg
    .replace(/<svg([^>]*)>/, `<svg$1>${clipPath}<g clip-path="url(#r)">`)
    .replace(/<\/svg>/, '</g></svg>')
}

function svgToDataUri(svg: string): string {
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
}

// biome-ignore lint/suspicious/noExplicitAny: Satori element tree uses loose types
type SatoriNode = Record<string, any>

// Satori accepts a plain `{ type, props }` tree, but types its parameter as
// React's `ReactNode`. Borrow that parameter type for the single cast below.
type SatoriElement = Parameters<typeof satori>[0]

// ─── Generator ───────────────────────────────────────────────

export async function generateOgImage(config: OgImageConfig): Promise<Uint8Array<ArrayBuffer>> {
  const [, fontRegular, fontBold] = await loadFonts()

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
            src: svgToDataUri(roundSvg(svg, 2)),
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

  const svg = await satori(element as SatoriElement, {
    width: WIDTH,
    height: HEIGHT,
    fonts: [
      { name: 'Inter', data: fontRegular, weight: 400, style: 'normal' as const },
      { name: 'Inter', data: fontBold, weight: 700, style: 'normal' as const },
    ],
  })

  return new Uint8Array(await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer())
}

// ─── App Icon Generator ──────────────────────────────────────

export async function generateAppIcon(config: AppIconConfig): Promise<Uint8Array<ArrayBuffer>> {
  const [fontLight, , fontBold] = await loadFonts()

  const accentColor = config.accentColor ?? '#e535ab'
  const { size, icons } = config

  // Scale proportions relative to size
  const accentHeight = Math.max(1, Math.round(size * 0.008))
  const iconSize = Math.round(size * 0.17)
  const iconGap = Math.round(size * 0.06)
  const braceFontSize = Math.round(size * 0.675)
  const braceGap = Math.round(size * 0.04)
  const iconRadius = Math.max(1, Math.round(iconSize / 12))

  const element: SatoriNode = {
    type: 'div',
    props: {
      style: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        height: '100%',
        background: '#f8fafc',
        fontFamily: 'Inter',
        position: 'relative',
      },
      children: [
        // Accent bar at top
        {
          type: 'div',
          props: {
            style: {
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: accentHeight,
              background: accentColor,
            },
          },
        },
        // Content row: { icons }
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            },
            children: [
              // Left brace
              {
                type: 'div',
                props: {
                  style: {
                    fontSize: braceFontSize,
                    fontWeight: 300,
                    color: '#cbd5e1',
                    lineHeight: 1,
                    marginRight: braceGap,
                  },
                  children: '{',
                },
              },
              // Stacked icons
              {
                type: 'div',
                props: {
                  style: {
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: iconGap,
                  },
                  children: icons.map((svg) => ({
                    type: 'img',
                    props: {
                      src: svgToDataUri(roundSvg(svg, iconRadius)),
                      width: iconSize,
                      height: iconSize,
                    },
                  })),
                },
              },
              // Right brace
              {
                type: 'div',
                props: {
                  style: {
                    fontSize: braceFontSize,
                    fontWeight: 300,
                    color: '#cbd5e1',
                    lineHeight: 1,
                    marginLeft: braceGap,
                  },
                  children: '}',
                },
              },
            ],
          },
        },
      ],
    },
  }

  const svg = await satori(element as SatoriElement, {
    width: size,
    height: size,
    fonts: [
      { name: 'Inter', data: fontLight, weight: 300, style: 'normal' as const },
      { name: 'Inter', data: fontBold, weight: 700, style: 'normal' as const },
    ],
  })

  return new Uint8Array(await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer())
}
