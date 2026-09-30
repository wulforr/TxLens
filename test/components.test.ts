// @vitest-environment happy-dom
import { config, mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import AmountChip from '~~/app/components/AmountChip.vue'
import ArgValue from '~~/app/components/ArgValue.vue'
import CallActivity from '~~/app/components/CallActivity.vue'
import CallRow from '~~/app/components/CallRow.vue'
import CopyButton from '~~/app/components/CopyButton.vue'
import HashForm from '~~/app/components/HashForm.vue'
import Icon from '~~/app/components/Icon.vue'
import Narrative from '~~/app/components/Narrative.vue'
import Party from '~~/app/components/Party.vue'
import PartyList from '~~/app/components/PartyList.vue'
import ProvenanceChip from '~~/app/components/ProvenanceChip.vue'
import StepList from '~~/app/components/StepList.vue'
import TokenBadge from '~~/app/components/TokenBadge.vue'
import type { NarrativePart } from '~~/shared/format'

config.global.components = { AmountChip, Icon, Party, TokenBadge, ArgValue, CopyButton }

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
    parts: [
      { kind: 'text' as const, text: 'Swapped ' },
      {
        kind: 'amount' as const,
        text: '935.11816 USDT',
        value: '935.11816',
        symbol: 'USDT',
        iconUrl: 'https://i.example/usdt.png',
        address: '0xdac17f958d2ee523a2206206994597c13d831ec7',
        raw: false,
      },
      { kind: 'text' as const, text: ' for ' },
      {
        kind: 'amount' as const,
        text: '2,336.944687 01',
        value: '2,336.944687',
        symbol: '01',
        iconUrl: null,
        address: '0x32708538a107253b51a735a724330a23106ca4ca',
        raw: false,
      },
    ] as NarrativePart[],
    details: ['0x222222…222222 kept 2.805354 USDT as a fee.'],
    matcher: 'swap',
    confidence: 'high' as const,
  }

  it('leads with the headline', () => {
    const wrapper = mount(Narrative, {
      props: { narrative: base },
      global: { components: { TokenBadge } },
    })
    // The visible text is what a screen reader hears, USD values included: an
    // aria-label here would override it with the plain headline.
    expect(wrapper.find('h1').attributes('aria-label')).toBeUndefined()
    expect(wrapper.find('h1').text()).toContain('Swapped')
  })

  it('renders each token as a chip with its icon, or a generic coin when its symbol starts with a digit', () => {
    const wrapper = mount(Narrative, {
      props: { narrative: base },
      global: { components: { TokenBadge } },
    })
    const amounts = wrapper.findAll('.amount')
    expect(amounts).toHaveLength(2)
    expect(amounts[0].find('img').attributes('src')).toBe('https://i.example/usdt.png')
    expect(amounts[1].find('img').exists()).toBe(false)
    expect(amounts[1].find('.fallback').exists()).toBe(false)
    expect(amounts[1].find('.generic').exists()).toBe(true)
    expect(amounts[1].find('.symbol').text()).toBe('01')
  })

  it('lists the supporting details', () => {
    const wrapper = mount(Narrative, {
      props: { narrative: base },
      global: { components: { TokenBadge } },
    })
    expect(wrapper.findAll('li')).toHaveLength(1)
  })

  it('warns when the summary was computed from incomplete data', () => {
    const wrapper = mount(Narrative, {
      props: { narrative: { ...base, confidence: 'low' } },
      global: { components: { TokenBadge } },
    })
    expect(wrapper.text()).toContain('may be wrong')
  })

  it('shows no warning at high confidence', () => {
    const wrapper = mount(Narrative, {
      props: { narrative: base },
      global: { components: { TokenBadge } },
    })
    expect(wrapper.text()).not.toContain('may be wrong')
  })
})

describe('Narrative USD', () => {
  it('shows a dollar value next to a priced amount', () => {
    const part = {
      kind: 'amount' as const,
      text: '935.11816 USDT',
      value: '935.11816',
      symbol: 'USDT',
      iconUrl: null,
      address: '0xdac17f958d2ee523a2206206994597c13d831ec7',
      raw: false,
      assetKey: 'erc20:0xdac17f958d2ee523a2206206994597c13d831ec7',
      units: '935118160',
    }
    const wrapper = mount(Narrative, {
      props: {
        narrative: {
          headline: 'Sent 935.11816 USDT',
          parts: [{ kind: 'text' as const, text: 'Sent ' }, part],
          details: [],
          matcher: 'transfer',
          confidence: 'high' as const,
        },
        tokens: {
          [part.assetKey]: {
            address: part.address as `0x${string}`,
            symbol: 'USDT',
            name: 'Tether',
            decimals: 6,
            standard: 'ERC-20' as const,
            iconUrl: null,
          },
        },
        prices: { [part.assetKey]: 1 },
      },
    })
    expect(wrapper.find('.usd').text()).toBe('≈ $935.12')
  })
})

describe('TokenBadge', () => {
  it('uses a letter disc only when the symbol starts with a letter', () => {
    expect(
      mount(TokenBadge, { props: { symbol: 'WBTC' } })
        .find('.fallback')
        .text(),
    ).toBe('W')
    expect(
      mount(TokenBadge, { props: { symbol: '01' } })
        .find('.fallback')
        .exists(),
    ).toBe(false)
  })
})

describe('StepList', () => {
  const people = {
    '0xaaaa000000000000000000000000000000000001': {
      address: '0xaaaa000000000000000000000000000000000001',
      label: 'Sender',
      role: 'sender' as const,
    },
    '0xaaaa000000000000000000000000000000000002': {
      address: '0xaaaa000000000000000000000000000000000002',
      label: 'Wallet A',
      role: 'wallet' as const,
    },
    '0xaaaa000000000000000000000000000000000003': {
      address: '0xaaaa000000000000000000000000000000000003',
      label: 'Contract A',
      role: 'contract' as const,
    },
  }
  const amount = {
    kind: 'amount' as const,
    text: '0.5 ETH',
    value: '0.5',
    symbol: 'ETH',
    iconUrl: null,
    address: null,
    raw: false,
    assetKey: 'native',
    units: '500000000000000000',
  }
  const step = (overrides = {}) => ({
    from: '0xaaaa000000000000000000000000000000000001',
    to: '0xaaaa000000000000000000000000000000000002',
    kind: 'transfer' as const,
    amount,
    usd: 1240,
    via: [],
    ...overrides,
  })

  it('reads as a sentence with names instead of hex', () => {
    const text = mount(StepList, { props: { steps: [step()], people } }).text()
    expect(text).toContain('Sender')
    expect(text).toContain('sent')
    expect(text).toContain('Wallet A')
    expect(text).toContain('≈ $1,240')
    expect(text).not.toContain('0xaaaa')
  })

  it('names the contract a transfer passed through', () => {
    const text = mount(StepList, {
      props: { steps: [step({ via: ['0xaaaa000000000000000000000000000000000003'] })], people },
    }).text()
    expect(text).toContain('passing through')
    expect(text).toContain('Contract A')
  })

  it('caps a long list behind a button that says how many there are', () => {
    const wrapper = mount(StepList, {
      props: { steps: Array.from({ length: 20 }, () => step()), people },
    })
    expect(wrapper.findAll('li')).toHaveLength(12)
    expect(wrapper.find('button.more').text()).toBe('Show all 20 steps')
  })
})

describe('PartyList', () => {
  it('gives each address a copy button and an explorer link with a spoken name', () => {
    const wrapper = mount(PartyList, {
      props: {
        people: [
          {
            address: '0xaaaa000000000000000000000000000000000002',
            label: 'Wallet A',
            role: 'wallet' as const,
          },
        ],
        explorerBase: 'https://etherscan.io',
      },
    })
    expect(wrapper.find('button').attributes('aria-label')).toBe(
      'Copy the full address of Wallet A',
    )
    expect(wrapper.find('a').attributes('href')).toBe(
      'https://etherscan.io/address/0xaaaa000000000000000000000000000000000002',
    )
  })
})

describe('HashForm', () => {
  it('says what a valid transaction id looks like when given junk', async () => {
    const wrapper = mount(HashForm)
    await wrapper.find('input').setValue('0xdeadbeef')
    await wrapper.find('form').trigger('submit')
    expect(wrapper.find('[role="alert"]').text()).toContain('64 characters')
  })
})

describe('CallRow amounts', () => {
  it('reads a token amount in real units when the called contract is a known token', () => {
    const SHIB = '0x95ad61b0a150d79219dcf64e1e6cc01f0b64c4ce'
    const wrapper = mount(CallRow, {
      props: {
        call: {
          confidence: 'decoded' as const,
          contractName: 'SHIB',
          via: null,
          functionName: 'transfer',
          signature: 'transfer(address,uint256)',
          selector: '0xa9059cbb' as const,
          raw: '0xa9059cbb' as const,
          args: [{ name: 'amount', type: 'uint256', value: '50693552078053780000000000000000' }],
        },
        target: SHIB,
        tokens: {
          [`erc20:${SHIB}`]: {
            address: SHIB as `0x${string}`,
            symbol: 'SHIB',
            name: 'SHIBA INU',
            decimals: 18,
            standard: 'ERC-20' as const,
            iconUrl: null,
          },
        },
      },
    })
    expect(wrapper.text()).toContain('50.69 trillion SHIB')
  })
})

describe('CallActivity empty states', () => {
  it('says there were no internal calls when the read was complete', () => {
    expect(
      mount(CallActivity, { props: { activity: { kind: 'none' }, complete: true } }).text(),
    ).toBe('This transaction made no internal calls.')
  })
})
