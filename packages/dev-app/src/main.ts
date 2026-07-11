import { defineMechanicaApp } from 'mechanica'
import App from './App.vue'
import SiteLayout from './layouts/SiteLayout.vue'
import BareLayout from './layouts/BareLayout.vue'

// The first layout is the default: pages without `layout:` frontmatter get the
// site shell; `layout: bare` drops the chrome (404, standalone form pages).
export default defineMechanicaApp({
  root: App,
  layouts: { site: SiteLayout, bare: BareLayout },
})
