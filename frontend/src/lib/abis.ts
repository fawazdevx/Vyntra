export const spawnFactoryAbi = [
  {
    type: 'function',
    name: 'spawn',
    stateMutability: 'payable',
    inputs: [
      { name: 'name', type: 'string' },
      { name: 'symbol', type: 'string' },
      { name: 'imageURI', type: 'string' },
      { name: 'description', type: 'string' },
      { name: 'referrer', type: 'address' },
      { name: 'buyTaxBps', type: 'uint256' },
      { name: 'sellTaxBps', type: 'uint256' },
      { name: 'fundsBps', type: 'uint256' },
      { name: 'buybackBps', type: 'uint256' },
      { name: 'dividendsBps', type: 'uint256' },
      { name: 'liquidityBps', type: 'uint256' },
      { name: 'tokenSalt', type: 'bytes32' },
    ],
    outputs: [
      { name: 'token', type: 'address' },
      { name: 'curve', type: 'address' },
    ],
  },
  {
    type: 'function',
    name: 'launchCount',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'getLaunch',
    stateMutability: 'view',
    inputs: [{ name: 'id', type: 'uint256' }],
    outputs: [
      {
        name: '',
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
  {
    type: 'function',
    name: 'getCreatorLaunchIds',
    stateMutability: 'view',
    inputs: [{ name: 'creator', type: 'address' }],
    outputs: [{ name: '', type: 'uint256[]' }],
  },
  {
    type: 'function',
    name: 'graduationThreshold',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'isNameTaken',
    stateMutability: 'view',
    inputs: [{ name: 'name', type: 'string' }],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'isSymbolTaken',
    stateMutability: 'view',
    inputs: [{ name: 'symbol', type: 'string' }],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'findVanitySalt',
    stateMutability: 'view',
    inputs: [
      { name: 'name', type: 'string' },
      { name: 'symbol', type: 'string' },
      { name: 'imageURI', type: 'string' },
      { name: 'description', type: 'string' },
    ],
    outputs: [
      { name: 'salt', type: 'bytes32' },
      { name: 'predictedToken', type: 'address' },
    ],
  },
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
] as const

/** Alias for clarity after Vyntra rename */
export const vyntraFactoryAbi = spawnFactoryAbi

export const bondingCurveAbi = [
  {
    type: 'function',
    name: 'buy',
    stateMutability: 'payable',
    inputs: [
      { name: 'minTokensOut', type: 'uint256' },
      { name: 'referrer', type: 'address' },
    ],
    outputs: [{ name: 'tokensOut', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'sell',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'tokensIn', type: 'uint256' },
      { name: 'minNativeOut', type: 'uint256' },
    ],
    outputs: [{ name: 'nativeOut', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'quoteBuy',
    stateMutability: 'view',
    inputs: [{ name: 'nativeIn', type: 'uint256' }],
    outputs: [
      { name: 'tokensOut', type: 'uint256' },
      { name: 'fee', type: 'uint256' },
    ],
  },
  {
    type: 'function',
    name: 'quoteSell',
    stateMutability: 'view',
    inputs: [{ name: 'tokensIn', type: 'uint256' }],
    outputs: [
      { name: 'nativeOut', type: 'uint256' },
      { name: 'fee', type: 'uint256' },
    ],
  },
  {
    type: 'function',
    name: 'quoteBuyDetailed',
    stateMutability: 'view',
    inputs: [{ name: 'nativeIn', type: 'uint256' }],
    outputs: [
      { name: 'tokensOut', type: 'uint256' },
      { name: 'protocolFee', type: 'uint256' },
      { name: 'memeTax', type: 'uint256' },
    ],
  },
  {
    type: 'function',
    name: 'quoteSellDetailed',
    stateMutability: 'view',
    inputs: [{ name: 'tokensIn', type: 'uint256' }],
    outputs: [
      { name: 'nativeOut', type: 'uint256' },
      { name: 'protocolFee', type: 'uint256' },
      { name: 'memeTax', type: 'uint256' },
    ],
  },
  {
    type: 'function',
    name: 'buyTaxBps',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'sellTaxBps',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'splitter',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'getProgressBps',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'graduated',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'migrated',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'externalPair',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'uniswapV2Router',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'migrateToUniswap',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
  {
    type: 'function',
    name: 'tradeVenue',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
  },
  {
    type: 'function',
    name: 'poolManager',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'poolId',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'bytes32' }],
  },
  {
    type: 'event',
    name: 'MigratedToUniswap',
    inputs: [
      { name: 'token', type: 'address', indexed: true },
      { name: 'pair', type: 'address', indexed: true },
      { name: 'nativeAmount', type: 'uint256', indexed: false },
      { name: 'tokenAmount', type: 'uint256', indexed: false },
      { name: 'liquidity', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'function',
    name: 'realNativeReserves',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'creator',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'creatorFees',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'claimCreatorFees',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
  {
    type: 'function',
    name: 'token',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'getReserves',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: 'nativeReserves', type: 'uint256' },
      { name: 'tokenReserves', type: 'uint256' },
    ],
  },
  {
    type: 'function',
    name: 'spotPriceWad',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'tokensSold',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'totalSupply',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'event',
    name: 'Buy',
    inputs: [
      { name: 'buyer', type: 'address', indexed: true },
      { name: 'referrer', type: 'address', indexed: true },
      { name: 'nativeIn', type: 'uint256', indexed: false },
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
      { name: 'nativeOut', type: 'uint256', indexed: false },
      { name: 'fee', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'TaxCollected',
    inputs: [
      { name: 'trader', type: 'address', indexed: true },
      { name: 'isBuy', type: 'bool', indexed: false },
      { name: 'memeTax', type: 'uint256', indexed: false },
    ],
  },
] as const

export const vyntraCurveAbi = bondingCurveAbi

export const revenueSplitterAbi = [
  {
    type: 'function',
    name: 'buyTaxBps',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'sellTaxBps',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'fundsBps',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'buybackBps',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'dividendsBps',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'liquidityBps',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'fundsAccrued',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'buybackAccrued',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'dividendsAccrued',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'liquidityAccrued',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'creator',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'claimFunds',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
  {
    type: 'function',
    name: 'buyAndBurnMeme',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'nativeAmount', type: 'uint256' },
      { name: 'minTokensOut', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'claimDividends',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
  {
    type: 'function',
    name: 'injectLiquidity',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'nativeAmount', type: 'uint256' }],
    outputs: [],
  },
] as const

export const vyntraKeeperAbi = [
  {
    type: 'function',
    name: 'sweepProtocol',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'curves', type: 'address[]' },
      { name: 'minVyntraOut', type: 'uint256' },
    ],
    outputs: [
      { name: 'nativeClaimed', type: 'uint256' },
      { name: 'vyntraBurned', type: 'uint256' },
    ],
  },
  {
    type: 'function',
    name: 'sweepTax',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'splitters', type: 'address[]' }],
    outputs: [
      { name: 'memeBuybackNative', type: 'uint256' },
      { name: 'liquidityInjected', type: 'uint256' },
    ],
  },
  {
    type: 'function',
    name: 'sweepAll',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'curves', type: 'address[]' },
      { name: 'splitters', type: 'address[]' },
      { name: 'minVyntraOut', type: 'uint256' },
    ],
    outputs: [
      { name: 'nativeClaimed', type: 'uint256' },
      { name: 'vyntraBurned', type: 'uint256' },
      { name: 'memeBuybackNative', type: 'uint256' },
      { name: 'liquidityInjected', type: 'uint256' },
    ],
  },
  {
    type: 'function',
    name: 'feeRouter',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'buybackVault',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'event',
    name: 'ProtocolSweep',
    inputs: [
      { name: 'caller', type: 'address', indexed: true },
      { name: 'curvesTouched', type: 'uint256', indexed: false },
      { name: 'nativeClaimed', type: 'uint256', indexed: false },
      { name: 'nativeDistributed', type: 'uint256', indexed: false },
      { name: 'vyntraBurned', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'TaxSweep',
    inputs: [
      { name: 'caller', type: 'address', indexed: true },
      { name: 'splittersTouched', type: 'uint256', indexed: false },
      { name: 'memeBuybackNative', type: 'uint256', indexed: false },
      { name: 'liquidityInjected', type: 'uint256', indexed: false },
    ],
  },
] as const

export const vyntraBoardAbi = [
  {
    type: 'function',
    name: 'postReply',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'launchId', type: 'uint256' },
      { name: 'body', type: 'string' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'getReplyCount',
    stateMutability: 'view',
    inputs: [{ name: 'launchId', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'getReply',
    stateMutability: 'view',
    inputs: [
      { name: 'launchId', type: 'uint256' },
      { name: 'index', type: 'uint256' },
    ],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'author', type: 'address' },
          { name: 'createdAt', type: 'uint64' },
          { name: 'body', type: 'string' },
        ],
      },
    ],
  },
  {
    type: 'function',
    name: 'getReplies',
    stateMutability: 'view',
    inputs: [
      { name: 'launchId', type: 'uint256' },
      { name: 'offset', type: 'uint256' },
      { name: 'limit', type: 'uint256' },
    ],
    outputs: [
      {
        name: 'page',
        type: 'tuple[]',
        components: [
          { name: 'author', type: 'address' },
          { name: 'createdAt', type: 'uint64' },
          { name: 'body', type: 'string' },
        ],
      },
    ],
  },
  {
    type: 'function',
    name: 'MAX_BODY',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
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

export const erc20Abi = [
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'allowance',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'decimals',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
  },
  {
    type: 'function',
    name: 'name',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
  },
  {
    type: 'function',
    name: 'symbol',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
  },
  {
    type: 'function',
    name: 'imageURI',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
  },
  {
    type: 'function',
    name: 'description',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
  },
] as const

export const vyntraMarketAbi = [
  {
    type: 'function',
    name: 'graduated',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'bool' }],
  },
  {
    type: 'function',
    name: 'getProgressBps',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'spotPriceWad',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'poolManager',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'poolId',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'bytes32' }],
  },
  {
    type: 'event',
    name: 'BuyVyntra',
    inputs: [
      { name: 'buyer', type: 'address', indexed: true },
      { name: 'nativeIn', type: 'uint256', indexed: false },
      { name: 'vyntraOut', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'SellVyntra',
    inputs: [
      { name: 'seller', type: 'address', indexed: true },
      { name: 'vyntraIn', type: 'uint256', indexed: false },
      { name: 'nativeOut', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'Seeded',
    inputs: [
      { name: 'nativeAmount', type: 'uint256', indexed: false },
      { name: 'vyntraAmount', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'function',
    name: 'reserveNative',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'reserveVyntra',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'quoteBuyVyntra',
    stateMutability: 'view',
    inputs: [{ name: 'nativeIn', type: 'uint256' }],
    outputs: [{ name: 'vyntraOut', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'quoteSellVyntra',
    stateMutability: 'view',
    inputs: [{ name: 'vyntraIn', type: 'uint256' }],
    outputs: [{ name: 'nativeOut', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'buyVyntra',
    stateMutability: 'payable',
    inputs: [{ name: 'minVyntraOut', type: 'uint256' }],
    outputs: [{ name: 'vyntraOut', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'sellVyntra',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'vyntraIn', type: 'uint256' },
      { name: 'minNativeOut', type: 'uint256' },
    ],
    outputs: [{ name: 'nativeOut', type: 'uint256' }],
  },
] as const

export const vyntraPromotionAbi = [
  {
    type: 'function',
    name: 'feePerDay',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'promotionCost',
    stateMutability: 'view',
    inputs: [{ name: 'durationDays', type: 'uint8' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'featuredUntil',
    stateMutability: 'view',
    inputs: [{ name: 'token', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'feature',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'durationDays', type: 'uint8' },
    ],
    outputs: [{ name: 'until', type: 'uint256' }],
  },
] as const

export const timelockAbi = [
  {
    type: 'function',
    name: 'getMinDelay',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const

export const vyntraReserveVaultAbi = [
  {
    type: 'function',
    name: 'bucketBalance',
    stateMutability: 'view',
    inputs: [{ name: 'bucket', type: 'uint8' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'rollingOutflow',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: 'used', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'ANNUAL_RELEASE_CAP',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const
