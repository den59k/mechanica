// Collector fixture: a `defineWidget` module (self-contained so the fixture
// doesn't depend on package export resolution).
const defineWidget = <T>(definition: T): T => definition

export default defineWidget({
  type: 'cta',
  title: 'CTA button',
  icon: '<svg viewBox="0 0 24 24"></svg>',
  create: () => ({ type: 'cta', editable: false }),
})
