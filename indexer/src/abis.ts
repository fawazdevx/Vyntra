export const factoryAbi = [
  {
    type: 'event',
    name: 'TokenSpawned',
    inputs: [
      { name: 'id', type: 'uint256', indexed: true },
      { name: 'token', type: 'address', indexed: true },
      { name: 'curve', type: 'address', indexed: true },
      { name: 'creator', type: 'address', indexed: false },
      { name: 'splitter', type: 'address', indexed: false },
      { name: 'name', type: 'string', indexed: false },
      { name: 'symbol', type: 'string', indexed: false },
      { name: 'imageURI', type: 'string', indexed: false },
    ],
  },
  {
    type: 'function',
    name: 'launchCount',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'getLaunch',
    stateMutability: 'view',
    inputs: [{ name: 'id', type: 'uint256' }],
    outputs: [
      {
        type: 'tuple',
        components: [
          { name: 'token', type: 'address' },
          { name: 'curve', type: 'address' },
          { name: 'creator', type: 'address' },
          { name: 'splitter', type: 'address' },
          { name: 'name', type: 'string' },
          { name: 'symbol', type: 'string' },
          { name: 'createdAt', type: 'uint256' },
        ],
      },
    ],
  },
] as const

export const curveAbi = [
  {
    type: 'event',
    name: 'Buy',
    inputs: [
      { name: 'buyer', type: 'address', indexed: true },
      { name: 'referrer', type: 'address', indexed: true },
      { name: 'botIn', type: 'uint256', indexed: false },
      { name: 'tokensOut', type: 'uint256', indexed: false },
      { name: 'fee', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'Sell',
    inputs: [
      { name: 'seller', type: 'address', indexed: true },
      { name: 'tokensIn', type: 'uint256', indexed: false },
      { name: 'botOut', type: 'uint256', indexed: false },
      { name: 'fee', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'Graduated',
    inputs: [
      { name: 'token', type: 'address', indexed: true },
      { name: 'botLiquidity', type: 'uint256', indexed: false },
      { name: 'tokenLiquidity', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'MigratedToBdex',
    inputs: [
      { name: 'token', type: 'address', indexed: true },
      { name: 'pair', type: 'address', indexed: true },
      { name: 'botAmount', type: 'uint256', indexed: false },
      { name: 'tokenAmount', type: 'uint256', indexed: false },
      { name: 'liquidity', type: 'uint256', indexed: false },
    ],
  },
  { type: 'function', name: 'getProgressBps', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'graduated', stateMutability: 'view', inputs: [], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'migrated', stateMutability: 'view', inputs: [], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'externalPair', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'realBotReserves', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'buyTaxBps', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'sellTaxBps', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
] as const

export const erc20MetaAbi = [
  { type: 'function', name: 'imageURI', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
  { type: 'function', name: 'description', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
] as const

export const boardAbi = [
  {
    type: 'event',
    name: 'ReplyPosted',
    inputs: [
      { name: 'launchId', type: 'uint256', indexed: true },
      { name: 'replyIndex', type: 'uint256', indexed: true },
      { name: 'author', type: 'address', indexed: true },
      { name: 'body', type: 'string', indexed: false },
    ],
  },
] as const
