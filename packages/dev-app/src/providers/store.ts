import type { PageProvider } from 'mechanica/plugin'
import type { VirtualPage } from 'mechanica-shared'

/**
 * `generatePages` provider for the demo store backend (see the sibling
 * `store-backend` project, live at demo-store.jt3.ru). It fetches the product
 * catalog — once per locale — and emits one `VirtualPage` per (product × locale)
 * at `/shop/<slug>`, plus a `/shop` index whose card list it bakes in directly
 * (it already has every product, so no `usePages` is needed).
 *
 * These pages have no `.page.md` file: the backend owns them, they render
 * through the normal pipeline, and they're read-only in the editor. This is the
 * canonical `generatePages` use case — many near-identical routes from an
 * external source. Override the origin with `STORE_API` for local backends.
 */
const API = (process.env.STORE_API ?? 'https://demo-store.jt3.ru').replace(/\/+$/, '')

/**
 * The backend builds image URLs from the request origin, which — behind a
 * TLS-terminating proxy with no `PUBLIC_URL` set — comes through as `http://`.
 * Pin every media URL back onto the canonical (https) API origin so the pages
 * never trip mixed-content on the live site.
 */
const canonical = (url: string): string => url.replace(/^https?:\/\/[^/]+/, API)

interface ApiProduct {
  slug: string
  title: string
  tagline: string
  description: string
  price: number
  currency: string
  compareAtPrice?: number
  badge?: string
  rating: number
  reviews: number
  stock: number
  categoryLabel: string
  material: string
  dimensions: string
  colors: string[]
  image: string
  gallery: string[]
  updatedAt: string
}

async function fetchProducts(locale: string): Promise<ApiProduct[]> {
  const res = await fetch(`${API}/api/products?locale=${locale}`)
  if (!res.ok) throw new Error(`store API ${res.status} for locale "${locale}"`)
  const body = (await res.json()) as { products: ApiProduct[] }
  return body.products
}

export const storePages: PageProvider = async ({ locales }) => {
  const all = locales?.all ?? ['en']
  const pages: VirtualPage[] = []

  for (const locale of all) {
    let products: ApiProduct[]
    try {
      products = await fetchProducts(locale)
    } catch (err) {
      // Never take down the dev server / export if the backend is unreachable —
      // just skip the locale and warn.
      console.warn(`[store] ${(err as Error).message} — skipping generated /shop pages`)
      continue
    }

    for (const p of products) {
      pages.push({
        path: `/shop/${p.slug}`, // logical path; the plugin adds the /ru, /ja prefix
        locale,
        locales: all,
        content: [
          {
            id: p.slug,
            blockId: 'product',
            data: {
              title: p.title,
              tagline: p.tagline,
              description: p.description,
              badge: p.badge ?? '',
              categoryLabel: p.categoryLabel,
              price: p.price,
              currency: p.currency,
              compareAtPrice: p.compareAtPrice ?? 0,
              rating: p.rating,
              reviews: p.reviews,
              stock: p.stock,
              material: p.material,
              dimensions: p.dimensions,
              colors: p.colors,
              image: canonical(p.image),
              gallery: p.gallery.map(canonical),
            },
          },
        ],
        data: { head: { title: `${p.title} — Mechanica Store`, description: p.tagline } },
        meta: { title: p.title },
        lastmod: p.updatedAt,
      })
    }

    pages.push({
      path: '/shop',
      locale,
      locales: all,
      content: [
        {
          id: 'shop',
          blockId: 'shop-index',
          data: {
            products: products.map((p) => ({
              slug: p.slug,
              title: p.title,
              tagline: p.tagline,
              price: p.price,
              currency: p.currency,
              badge: p.badge ?? '',
              categoryLabel: p.categoryLabel,
              image: canonical(p.gallery[0] ?? p.image),
            })),
          },
        },
      ],
      data: {
        head: { title: 'Shop — Mechanica Store', description: 'Furniture generated from a third-party backend.' },
      },
      meta: { title: 'Shop' },
    })
  }

  return pages
}
