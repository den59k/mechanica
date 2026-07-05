import { describe, it, expect, beforeEach } from 'vitest'
import { createApp, h } from 'vue'
import PropToggle from '@/editor/composer/components/PropToggle.vue'

beforeEach(() => {
  document.body.innerHTML = ''
})

function mount(props: Record<string, unknown>) {
  const events = { toggle: 0, reset: 0 }
  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = createApp({
    render: () =>
      h(
        PropToggle,
        { ...props, onToggle: () => events.toggle++, onReset: () => events.reset++ },
        { default: () => h('div', { class: 'pt-body' }, 'editor') },
      ),
  })
  app.mount(host)
  return { host, events }
}

describe('PropToggle', () => {
  it('collapses the editor and leaves the switch off when inactive', () => {
    const { host } = mount({ title: 'Padding', active: false })
    expect(host.querySelector('.mech-composer__prop2-title')!.textContent).toBe('Padding')
    expect(host.querySelector('.mech-composer__switch.is-on')).toBeNull()
    expect(host.querySelector('.pt-body')).toBeNull()
  })

  it('expands the editor and turns the switch on when active', () => {
    const { host } = mount({ title: 'Margin', active: true })
    expect(host.querySelector('.mech-composer__switch.is-on')).not.toBeNull()
    expect(host.querySelector('.pt-body')!.textContent).toBe('editor')
  })

  it('emits toggle when the header is clicked', () => {
    const { host, events } = mount({ title: 'Fill', active: false })
    host.querySelector<HTMLElement>('.mech-composer__prop2-toggle')!.click()
    expect(events.toggle).toBe(1)
  })

  it('offers a reset only when active and overridden, emitting reset on click', () => {
    const inactive = mount({ title: 'Padding', active: true, overridden: false })
    expect(inactive.host.querySelector('.mech-composer__prop2-reset')).toBeNull()

    const { host, events } = mount({ title: 'Padding', active: true, overridden: true })
    const reset = host.querySelector<HTMLElement>('.mech-composer__prop2-reset')!
    expect(reset).not.toBeNull()
    reset.click()
    expect(events.reset).toBe(1)
  })
})
