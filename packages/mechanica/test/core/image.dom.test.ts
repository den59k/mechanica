import { describe, it, expect } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import { Image, type ImageValue } from '@/core/image'

const LQIP = 'data:image/webp;base64,stub'

function mount(props: { image?: ImageValue | null; eager?: boolean }) {
  const el = document.createElement('div')
  const app = createApp({ render: () => h(Image, props) })
  app.mount(el)
  return { el, app, img: el.querySelector('img') }
}

describe('<Image>', () => {
  it('renders the field value with dimension and loading attributes', () => {
    const { img, app } = mount({ image: { src: '/media/a.jpg', alt: 'A mountain', width: 800, height: 600 } })
    expect(img!.getAttribute('src')).toBe('/media/a.jpg')
    expect(img!.getAttribute('alt')).toBe('A mountain')
    expect(img!.getAttribute('width')).toBe('800')
    expect(img!.getAttribute('height')).toBe('600')
    expect(img!.getAttribute('loading')).toBe('lazy')
    expect(img!.getAttribute('decoding')).toBe('async')
    expect(img!.getAttribute('fetchpriority')).toBeNull()
    app.unmount()
  })

  it('eager mode fetches immediately at high priority (hero/LCP images)', () => {
    const { img, app } = mount({ image: { src: '/hero.jpg' }, eager: true })
    expect(img!.getAttribute('loading')).toBe('eager')
    expect(img!.getAttribute('fetchpriority')).toBe('high')
    app.unmount()
  })

  it('renders nothing while no image is chosen', () => {
    expect(mount({ image: { src: '' } }).img).toBeNull()
    expect(mount({}).img).toBeNull()
  })

  it('paints the LQIP preview as background until the image loads', async () => {
    const { img, app } = mount({ image: { src: '/media/a.jpg', previewSrc: LQIP } })
    expect(img!.style.backgroundImage).toContain(LQIP)
    expect(img!.style.backgroundSize).toBe('cover')

    img!.dispatchEvent(new Event('load'))
    await nextTick()
    // Cleared after load — a transparent image must not keep the blurred backdrop.
    expect(img!.style.backgroundImage).toBe('')
    app.unmount()
  })

  it('shows no background when previewSrc is just the no-preview src fallback', () => {
    const { img, app } = mount({ image: { src: '/media/a.jpg', previewSrc: '/media/a.jpg' } })
    expect(img!.style.backgroundImage).toBe('')
    app.unmount()
  })

  it('passes through class and other attrs to the img', () => {
    const el = document.createElement('div')
    const app = createApp({
      render: () => h(Image, { image: { src: '/a.jpg' }, class: 'banner__image' }),
    })
    app.mount(el)
    expect(el.querySelector('img')!.className).toBe('banner__image')
    app.unmount()
  })
})
