import { describe, it, expect } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import { Image, imagePosition, type ImageValue } from '@/core/image'

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

  it('renders the cropped derivative and its dimensions in place of the original', () => {
    const { img, app } = mount({
      image: {
        src: '/media/hero.jpg',
        width: 2000,
        height: 1000,
        croppedSrc: '/media/hero.crop-abc.webp',
        croppedWidth: 1200,
        croppedHeight: 600,
      },
    })
    expect(img!.getAttribute('src')).toBe('/media/hero.crop-abc.webp')
    expect(img!.getAttribute('width')).toBe('1200')
    expect(img!.getAttribute('height')).toBe('600')
    app.unmount()
  })

  it('applies the focal point as object-position', () => {
    const { img, app } = mount({ image: { src: '/media/a.jpg', focalX: 0.25, focalY: 0.75 } })
    expect(img!.style.objectPosition).toBe('25% 75%')
    app.unmount()
  })

  it('aligns the LQIP backdrop to the focal point', () => {
    const { img, app } = mount({ image: { src: '/media/a.jpg', previewSrc: LQIP, focalX: 0.2, focalY: 0.8 } })
    expect(img!.style.backgroundPosition).toBe('20% 80%')
    app.unmount()
  })
})

describe('imagePosition', () => {
  it('formats the focal point as a CSS position', () => {
    expect(imagePosition({ src: '/a.jpg', focalX: 0.25, focalY: 0.6 })).toBe('25% 60%')
  })
  it('defaults a missing axis to center', () => {
    expect(imagePosition({ src: '/a.jpg', focalX: 0.3 })).toBe('30% 50%')
  })
  it('is undefined without a focal point (leave the CSS default)', () => {
    expect(imagePosition({ src: '/a.jpg' })).toBeUndefined()
    expect(imagePosition(null)).toBeUndefined()
  })
})
