/**
 * Real Ethereum transactions, each verified to decode end to end, chosen so a
 * first-time visitor who has no hash of their own can see every kind of story
 * the page tells: a routed swap, a payment through a middleman, a failure, a
 * batch operation. Titles say what you'll learn, not what the contract is.
 */
/**
 * Well-known moments, each hash verified against the chain (date, and the
 * labelled addresses involved) before being listed. Descriptions state only
 * what this one transaction shows, not the whole incident around it.
 */
export const FAMOUS = [
  {
    title: 'The Bybit hack, 2025',
    detail: '401,347 ETH, worth over $1 billion, taken from an exchange wallet in one transaction.',
    hash: '0xb61413c495fdad6114a7aa863a00b2e3c28945979a10885b12b30316ea9f072c',
  },
  {
    title: 'The Ronin bridge hack, 2022',
    detail: '173,600 ETH withdrawn from the bridge behind the game Axie Infinity.',
    hash: '0xc28fad5e8d5e0ce6a2eaf67b6687be5d58113e16be590824d6cfa1a94467d0b7',
  },
  {
    title: 'The Euler Finance exploit, 2023',
    detail: 'One of the attack transactions: the attacker’s contract comes out $8.8 million ahead.',
    hash: '0xc310a0affe2169d1f6feec1c63dbc7f7c62a887fa48795d327d4d2da2d6b111d',
  },
  {
    title: 'Vitalik Buterin’s SHIB donation, 2021',
    detail: 'Ethereum’s co-founder sends 50 trillion meme coins to India’s Covid relief fund.',
    hash: '0xb65bcbb85c1633b0ab4e4886c3cd8eeaeb63edbb39cacdb9223fdcf4454fd2c7',
  },
] as const

export const EXAMPLES = [
  {
    title: 'A token swap routed through three services',
    detail: 'See every hop the money took, and who took a fee along the way.',
    hash: '0x54dea4ad72b683f048af3170e7f46b29f1c324b74d830d8d11dbb61c7e77bceb',
  },
  {
    title: 'A payment that passed through a middleman',
    detail: 'The contract you call isn’t always the one that gets paid.',
    hash: '0x2b33961dc80d74c6d2ee018f2ee4c2e6ed9ddd0f4eb962e3f69a388a10ccdcea',
  },
  {
    title: 'A transaction that failed',
    detail: 'Why it was rejected, and what it still cost.',
    hash: '0xdf537c0b8f0e1c7b7a92db70d2ad136669be870b3532600195bcb996429732ad',
  },
  {
    title: 'One transaction that minted tokens 100 times',
    detail: 'A batch of 900 internal calls, summed up in a sentence.',
    hash: '0x2fc64493fcd0503f3d8238d6aaeefff47571397902ccf8a8b0a3d269e791800f',
  },
] as const
