// Collector fixture: widgets in nested directories are found too.
const defineWidget = <T>(definition: T): T => definition

export default defineWidget({
  type: 'embed',
  title: 'Embed',
  icon: '',
  create: () => ({ type: 'embed', editable: false, url: '' }),
})
