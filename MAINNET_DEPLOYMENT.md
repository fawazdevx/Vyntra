# Vyntra mainnet deployment

Vyntra targets BOT Chain mainnet (chain ID 677, RPC https://rpc.botchain.ai). The frontend still defaults to testnet unless VITE_CHAIN_ID=677 is set.

## 1. Deploy contracts

Use the Deploy script with a Foundry keystore alias for the mainnet deployer. Replace vyntraMainnetKey with the alias configured on your machine.

The factory scripts default to a 100 BOT graduation threshold. For the intended 1,000 BOT threshold, export the value in wei before running either deployment script (1,000 BOT with 18 decimals):

    export GRADUATION_THRESHOLD=1000000000000000000000

    forge script script/Deploy.s.sol:Deploy \
      --rpc-url https://rpc.botchain.ai \
      --chain-id 677 \
      --account vyntraMainnetKey \
      --sender "$OWNER_ADDRESS" \
      --broadcast \
      --slow \
      -vvv

With that environment variable set, the factory uses a 1,000 BOT graduation threshold. The script defaults to a 5 BOT market seed and a 50,000,000 VYNTRA market seed, and uses the BOT Chain mainnet BDEX router by default. Confirm the treasury and seed balances before broadcasting. Keep GRADUATION_THRESHOLD set if you run FinishDeploy.s.sol or SetFactoryLaunchConfig.s.sol as part of deployment.

Save the printed contract addresses and the deployment block numbers. The factory deployment block initializes the main indexer cursor. The VYNTRA market seed block initializes its separate history cursor.

## 2. Configure the indexer

Use [indexer/.env.mainnet.example](indexer/.env.mainnet.example) as the variable checklist. Set INDEXER_CHAIN_ID=677, the mainnet RPC, all deployed addresses, both start blocks, and a new production Turso database. Keep mainnet data separate from the testnet database. Deploy the indexer through the Render Blueprint at indexer/render.yaml, then point the frontend to the Render service origin.

The INDEXER_START_BLOCK should be the factory deployment block. Set VYNTRA_MARKET_START_BLOCK to the market deployment or seed event block so the indexer records platform-token buys and sells from the beginning.

## 3. Configure the frontend

Use [frontend/.env.mainnet.example](frontend/.env.mainnet.example) for the Production environment. Set VITE_CHAIN_ID=677, all contract addresses from the deploy output, the mainnet indexer URL, and the WalletConnect project ID. Rebuild the frontend after changing VITE_* values. Preview deployments can keep VITE_CHAIN_ID=968 and the testnet addresses.

The frontend connects to only the configured chain. Its wallet prompts, contract writes, balances, labels, and explorer links all follow VITE_CHAIN_ID.

## Charts and BOT price data

- Vyntra’s bonding-curve and $VYNTRA market charts continue to use Vyntra’s own indexed trades, including before a token has a DEX pool.
- After a launched token migrates liquidity to BDEX on mainnet, its page also shows a GeckoTerminal pool chart using the on-chain externalPair address. GeckoTerminal must have indexed that pool before the embed can show market data.
- /api/v1/bot-usd gets the current BOT reference price from GeckoTerminal’s mainnet WBOT feed. The frontend uses it to show dollar estimates alongside BOT values. No CoinGecko API key is required for this price endpoint or the chart embed.

## After deployment

1. Configure and deploy the mainnet indexer, then check /health and /v1/bot-usd on its Render URL.
2. Set the frontend’s VITE_INDEXER_URL to the Render service origin and redeploy the frontend.
3. Check a contract link opens on scan.botchain.ai, verify the landing-page stats and $VYNTRA market history, and confirm the BOT/USD estimate loads.
4. After the first migrated BDEX pool is indexed, confirm its GeckoTerminal chart appears on the token page.
