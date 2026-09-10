// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ArgValue from '~~/app/components/ArgValue.vue'
import CallActivity from '~~/app/components/CallActivity.vue'
import CallRow from '~~/app/components/CallRow.vue'
import Narrative from '~~/app/components/Narrative.vue'
import ProvenanceChip from '~~/app/components/ProvenanceChip.vue'

describe('ProvenanceChip', () => {
  it('names the degraded source plainly', () => {
    const wrapper = mount(ProvenanceChip, { props: { provenance: 'logsOnly' } })
    expect(wrapper.text()).toContain('logs only')
    expect(wrapper.text()).toContain('no call data')
  })

  it('names the best source', () => {
    const wrapper = mount(ProvenanceChip, { props: { provenance: 'callTracer' } })
    expect(wrapper.text()).toContain('full trace')
  })
})

describe('CallRow', () => {
  const decoded = {
    confidence: 'decoded' as const,
    contractName: 'USDC',
    via: null,
    functionName: 'transfer',
    signature: 'transfer(address,uint256)',
    selector: '0xa9059cbb' as const,
    args: [{ name: 'to', type: 'address', value: '0x2222222222222222222222222222222222222222' }],
    raw: '0xa9059cbb' as const,
  }

  it('shows the function name and arguments when decoded', () => {
    const wrapper = mount(CallRow, { props: { call: decoded } })
    expect(wrapper.text()).toContain('transfer')
    expect(wrapper.text()).toContain('USDC')
    expect(wrapper.text()).toContain('to')
  })

  it('marks a signature-only result as unverified rather than showing it plainly', () => {
    const wrapper = mount(CallRow, {
      props: { call: { ...decoded, confidence: 'signatureOnly', args: [] } },
    })
    expect(wrapper.text()).toContain('signature only')
  })

  it('shows the selector and raw calldata when nothing decoded', () => {
    const wrapper = mount(CallRow, {
      props: { call: { ...decoded, confidence: 'raw', functionName: null, args: [] } },
    })
    expect(wrapper.text()).toContain('0xa9059cbb')
  })

  it('escapes a hostile contract name instead of rendering it as markup', () => {
    const wrapper = mount(CallRow, {
      props: { call: { ...decoded, contractName: '<img src=x onerror=alert(1)>' } },
    })
    expect(wrapper.html()).not.toContain('<img')
    expect(wrapper.find('img').exists()).toBe(false)
  })

  it('truncates an absurdly long contract name', () => {
    const wrapper = mount(CallRow, {
      props: { call: { ...decoded, contractName: 'A'.repeat(500) } },
    })
    expect(wrapper.text()).not.toContain('A'.repeat(200))
  })
})

describe('CallActivity', () => {
  it('renders a flat list of internal calls', () => {
    const wrapper = mount(CallActivity, {
      props: {
        activity: {
          kind: 'flat',
          calls: [
            {
              kind: 'CALL',
              from: '0x1111111111111111111111111111111111111111',
              to: '0x2222222222222222222222222222222222222222',
              value: '500000000000000000',
              error: null,
            },
          ],
        },
      },
    })
    expect(wrapper.findAll('[data-test="call"]')).toHaveLength(1)
    expect(wrapper.text()).toContain('0.5')
  })

  it('says so plainly when there is no call data, rather than rendering nothing', () => {
    const wrapper = mount(CallActivity, { props: { activity: { kind: 'none' } } })
    expect(wrapper.text()).toContain('No internal call data')
  })
})

describe('ArgValue', () => {
  const long = '0x'.padEnd(4000, 'a')

  it('shows a short value in full', () => {
    const wrapper = mount(ArgValue, { props: { type: 'uint256', value: '123' } })
    expect(wrapper.text()).toContain('123')
    expect(wrapper.find('details').exists()).toBe(false)
  })

  it('truncates an address', () => {
    const wrapper = mount(ArgValue, {
      props: { type: 'address', value: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' },
    })
    expect(wrapper.text()).toContain('0xa0b869…06eb48')
  })

  it('collapses a multi-kilobyte value behind a summary', () => {
    // A real aggregator swap carries encoded calldata tuples running to
    // thousands of characters. Rendered inline they bury every section below.
    const wrapper = mount(ArgValue, { props: { type: 'bytes', value: long } })
    expect(wrapper.find('details').exists()).toBe(true)
    expect(wrapper.find('summary').text()).toContain('…')
  })

  it('states the exact length so nothing is silently hidden', () => {
    const wrapper = mount(ArgValue, { props: { type: 'bytes', value: long } })
    expect(wrapper.find('summary').text()).toContain('4,000 characters')
  })

  it('still contains the full value for copying', () => {
    const wrapper = mount(ArgValue, { props: { type: 'bytes', value: long } })
    expect(wrapper.find('.full').text()).toBe(long)
  })
})

describe('Narrative', () => {
  const base = {
    headline: 'Swapped 935.11816 USDT for 2,336.944687 01',
    details: ['0x222222…222222 kept 2.805354 USDT as a fee.'],
    matcher: 'swap',
    confidence: 'high' as const,
  }

  it('leads with the headline', () => {
    const wrapper = mount(Narrative, { props: { narrative: base } })
    expect(wrapper.find('h1').text()).toBe(base.headline)
  })

  it('lists the supporting details', () => {
    const wrapper = mount(Narrative, { props: { narrative: base } })
    expect(wrapper.findAll('li')).toHaveLength(1)
  })

  it('warns when the summary was computed from incomplete data', () => {
    const wrapper = mount(Narrative, { props: { narrative: { ...base, confidence: 'low' } } })
    expect(wrapper.text()).toContain('may be wrong')
  })

  it('shows no warning at high confidence', () => {
    const wrapper = mount(Narrative, { props: { narrative: base } })
    expect(wrapper.text()).not.toContain('may be wrong')
  })
})
