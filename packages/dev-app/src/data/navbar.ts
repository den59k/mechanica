import { defineData } from 'mechanica'

/**
 * Site header content. Site chrome that's identical on every page, so it lives
 * outside <Content/> (rendered by App.vue) and is edited as shared data — set it
 * once at Site scope, override per page only if ever needed.
 */
export const useNavbar = defineData({
  id: 'navbar',
  title: 'Navbar',
  props: {
    brand: { type: 'string', default: 'Mechanica' },
    homeHref: { type: 'string', default: '/' },
    links: {
      type: 'array',
      items: { label: 'string', href: 'string' },
    },
    ctaLabel: { type: 'string', default: 'Get started' },
    ctaHref: { type: 'string', default: '/#get-started' },
  },
})
