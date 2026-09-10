import { type Abi, parseAbi } from 'viem'

/** The subset of ERC-20 that matters for decoding transfers and approvals. */
export const ERC20_ABI: Abi = parseAbi([
  'function transfer(address to, uint256 amount) returns (bool)',
  'function transferFrom(address from, address to, uint256 amount) returns (bool)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function name() view returns (string)',
  'event Transfer(address indexed from, address indexed to, uint256 value)',
  'event Approval(address indexed owner, address indexed spender, uint256 value)',
])

export const ERC721_ABI: Abi = parseAbi([
  'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)',
  'event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId)',
  'event ApprovalForAll(address indexed owner, address indexed operator, bool approved)',
])

export const ERC1155_ABI: Abi = parseAbi([
  'event TransferSingle(address indexed operator, address indexed from, address indexed to, uint256 id, uint256 value)',
  'event TransferBatch(address indexed operator, address indexed from, address indexed to, uint256[] ids, uint256[] values)',
])

export const WETH_ABI: Abi = parseAbi([
  'function deposit() payable',
  'function withdraw(uint256 amount)',
  'event Deposit(address indexed dst, uint256 wad)',
  'event Withdrawal(address indexed src, uint256 wad)',
])

interface RawLabel {
  chainId: number
  address: string
  name: string
  abi: Abi | null
  /** Present only for tokens. Lets the flow layer format amounts with no network call. */
  symbol?: string
  decimals?: number
}

/**
 * Curated, verified by hand. Every address here was checked against
 * eth.blockscout.com on 2026-09-10 before being added — see the plan's
 * Task 8 Step 3.
 */
export const RAW_LABELS: RawLabel[] = [
  // FiatTokenProxy, token symbol USDC, 6 decimals.
  {
    chainId: 1,
    address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
    name: 'USDC',
    abi: ERC20_ABI,
    symbol: 'USDC',
    decimals: 6,
  },
  // TetherToken, token symbol USDT, 6 decimals. Note: its transfer/approve
  // return nothing rather than bool. That only affects return values, which
  // this phase never decodes.
  {
    chainId: 1,
    address: '0xdac17f958d2ee523a2206206994597c13d831ec7',
    name: 'USDT',
    abi: ERC20_ABI,
    symbol: 'USDT',
    decimals: 6,
  },
  // Dai, token symbol DAI, 18 decimals.
  {
    chainId: 1,
    address: '0x6b175474e89094c44da98b954eedeac495271d0f',
    name: 'DAI',
    abi: ERC20_ABI,
    symbol: 'DAI',
    decimals: 18,
  },
  // WETH9, token symbol WETH, 18 decimals.
  {
    chainId: 1,
    address: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
    name: 'WETH',
    abi: [...WETH_ABI, ...ERC20_ABI],
    symbol: 'WETH',
    decimals: 18,
  },
]
