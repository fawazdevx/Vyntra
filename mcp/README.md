# Vyntra MCP server

Connect an MCP-compatible agent to Vyntra on Kinetiq Elysium Testnet. The server reads public chain and indexer data and can prepare unsigned transaction payloads. It has no wallet, private key, signing, or transaction submission capability.

## Requirements

- Node.js 20 or newer
- The deployed Elysium Testnet Vyntra factory address
- Optional Vyntra indexer URL and platform-token market addresses

## Configure

Copy `.env.example` to `.env` and set the deployed addresses:

```dotenv
VYNTRA_RPC_URL=https://testnet-rpc.elysium.kinetiq.xyz
VYNTRA_FACTORY_ADDRESS=0xYourFactoryAddress
VYNTRA_INDEXER_URL=https://your-indexer.vercel.app/api
VYNTRA_MARKET_ADDRESS=0xYourVyntraMarket
VYNTRA_TOKEN_ADDRESS=0xYourVyntraToken
```

`VYNTRA_FACTORY_ADDRESS` is required. The RPC defaults to Elysium Testnet. `VYNTRA_INDEXER_URL` enables stats, trade history, and wallet activity. The market and token addresses enable $VYNTRA quotes and prepared platform-market trades. No private key belongs in this configuration.

Install and start:

```sh
cd mcp
npm install
npm start
```

The server uses standard input/output for MCP transport. Its logs go to standard error so they do not corrupt the connection.

## Connect an MCP host

Configure your MCP client to start the package locally. Replace `/absolute/path/to/Vyntra` and the example addresses:

```json
{
  "mcpServers": {
    "vyntra": {
      "command": "npm",
      "args": ["--prefix", "/absolute/path/to/Vyntra/mcp", "run", "start"],
      "env": {
        "VYNTRA_FACTORY_ADDRESS": "0xYourFactoryAddress",
        "VYNTRA_INDEXER_URL": "https://your-indexer.vercel.app/api",
        "VYNTRA_MARKET_ADDRESS": "0xYourVyntraMarket",
        "VYNTRA_TOKEN_ADDRESS": "0xYourVyntraToken"
      }
    }
  }
}
```

Add this object to the host's MCP server configuration and restart the host. Each MCP host stores its configuration in a different location.

## Tools

| Tool | What it does | Needs |
| --- | --- | --- |
| `vyntra_search_launches` | Search recent launches by name, ticker, token, or creator | Factory; indexer optional |
| `vyntra_get_launch` | Read a launch, progress, graduation state, and current reserves | Factory and RPC |
| `vyntra_get_stats` | Read launch/trade counts and HYPE volume | Indexer |
| `vyntra_get_launch_trades` | Read the indexed trade tape for one launch | Indexer |
| `vyntra_get_wallet_activity` | Read indexed portfolio and trades for a wallet | Indexer |
| `vyntra_get_trade_quote` | Quote a launch token or $VYNTRA trade against HYPE | Factory; platform quote also needs market address |
| `vyntra_prepare_launch` | Return unsigned factory calldata and the predicted `0x7f7` token address | Factory and RPC |
| `vyntra_prepare_trade` | Return unsigned buy/sell calldata and an approval step when needed | Factory; platform trade also needs market and token addresses |
| `vyntra_prepare_creator_fee_claim` | Return unsigned creator-fee claim calldata | Factory and RPC |

Prepared trades include a quote-derived minimum output and an unsigned transaction payload for chain ID `99801`. Quotes can change before signing. For a sell, provide the wallet address so the server can check its token allowance.

## Safety and data limits

- The agent must show the network, contract, asset amount, quote, minimum output, and approval to the user before any wallet action.
- The MCP server does not request or store seed phrases or private keys, and cannot sign, submit, or fund transactions.
- A launch requires no HYPE liquidity deposit or platform launch fee. The wallet needs HYPE for gas; any value explicitly sent with the factory call is an optional creator buy.
- The indexer can lag the chain. Verify recent transactions in the Elysium explorer.
- Testnet HYPE has no guaranteed dollar value.

See the website guide at `/apps/mcp` and the [Vyntra documentation](/docs).
