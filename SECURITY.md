# Security

Vyntra is a memecoin launchpad on BOT Chain. This document is the public security posture for auditors, keepers, and integrators.

## Scope

| In scope | Out of scope (for now) |
| --- | --- |
| `src/*.sol` launch, curve, tax, fees, market, keeper, board | Frontend phishing / wallet UX |
| Fee math (1.25% + optional meme tax) | Third-party BDEX / Uniswap V2 router bugs |
| Graduation → BDEX migrate + LP burn | Compromised deployer keystore / ops treasury |
| Permissionless keeper sweeps | Social engineering |

## Threat model (summary)

### Assets

- User BOT and meme tokens in bonding curves / AMM phase
- Accrued creator / protocol / referrer fees on curves
- Per-launch tax buckets (funds / buyback / dividends / liquidity)
- Platform `$VYNTRA` in the buyback market
- Locked BDEX LP (sent to `0x…dEaD`)

### Trust assumptions

- BOT Chain L1 correctness and finality
- BDEX V2 Router02 / Factory behave like Uniswap V2
- Deployer sets a correct `protocolTreasury` (FeeRouter) and BDEX router
- Users set non-zero slippage in production UIs when migrating capital size grows

### Adversaries

- Snipers / MEV on launch blocks (mitigated by creator-only launch block + 3-block 2% cap)
- Malicious creators (tax config is immutable per launch; bounded 0 or 1–10%)
- Griefers calling permissionless functions (claims, keeper, board spam)
- Flash-loan attackers on balance-weighted dividends (known v1 limitation)

## Known limitations (accepted for current phase)

1. **Dividends are balance-weighted (v1)** — a flash loan can claim a large share of `dividendsAccrued` in one tx. Mitigations planned: TWAB / checkpoints before mainnet TVL push.
2. **Keeper / claim calls are unincentivized** — anyone can run them; no tip market yet. Failure of keepers delays buybacks; funds remain in contracts.
3. **Board replies are uncapped in count** — 280-char body limit only; spam costs gas.
4. **Migrate uses `amountTokenMin = 0` / `amountETHMin = 0`** — sandwich risk on graduation migrate if BDEX liquidity path is hostile. Prefer migrating when router is trusted; add slippage params before large mainnet thresholds.
5. **Owner can change factory treasury / threshold / BDEX router for new launches only** — existing curves keep immutable router/treasury from construction.

## Invariants we test for

- Protocol fee is exactly `125` bps of trade notional; creator + referrer + protocol cuts sum to the fee.
- When meme tax is enabled, buy/sell tax is `0` or `100…1000` bps; four split bps sum to `10_000`.
- Curve ETH balance covers `realBotReserves + creatorFees + protocolFees + Σ referrerFees` (modulo in-flight calls).
- After `migrated == true`, `buy` / `sell` / `injectBotLiquidity` revert; LP recipient is burn address.
- FeeRouter always splits `80%` vault / `20%` ops.
- Factory rejects empty image/description and duplicate name/symbol.

See `test/VyntraSecurity.t.sol` (fuzz + invariant-style checks).

## Hardening already applied

- Reentrancy guards on trade, claim, migrate, distribute, buyback, tax actions
- Custom errors; no `tx.origin`; no `delegatecall` / `selfdestruct`
- Anti-snipe window on bonding buys
- Unique name/symbol; required metadata
- Owner zero-address checks; claim functions revert on zero accrual
- Token allowance cleared after BDEX migrate
- Keeper batch size capped

## Reporting

**Do not open public issues for active exploits.**

Email: `security@vyntra.local` (replace with your real security inbox before mainnet)

Include:

- Affected contract address + chain id
- Vulnerability class and impact (funds at risk)
- PoC (Foundry fork test preferred)
- Suggested fix if you have one

### Severity guide (informal)

| Severity | Example |
| --- | --- |
| Critical | Direct theft of curve / vault / tax BOT or tokens |
| High | Broken accounting that strands or leaks fees at scale |
| Medium | Griefing that permanently blocks migrate/claims without fund theft |
| Low / Informational | Gas, events, docs, theoretical issues under broken trust assumptions |

### Bug bounty (planned)

No paid bounty is live on testnet. Before mainnet TVL:

1. Freeze implementation + publish addresses
2. Fund a bounty pool (recommend ≥ mid-five-figures USD equivalent)
3. Publish this `SECURITY.md` with a real contact and response SLA (e.g. 3 business days ack)

## Audit checklist (pre-mainnet)

- [ ] External audit of `VyntraCurve`, `VyntraRevenueSplitter`, `VyntraFactory`, `VyntraKeeper`, `VyntraMarket`, fee/buyback stack
- [ ] Fix or formally accept dividend flash-loan design
- [ ] Add migrate slippage parameters
- [ ] Verify BDEX router/WBOT addresses on both 968 and 677
- [ ] Multisig / timelock for factory owner
- [ ] Public bug bounty + monitoring (failed migrates, vault balance, keeper heartbeats)
- [ ] Re-run `forge test` + Slither / equivalent on release commit

## Static analysis

```bash
export PATH="$HOME/.foundry/bin:$PATH"
forge build
forge test

# optional Slither (venv)
python3 -m venv .venv-slither
.venv-slither/bin/pip install slither-analyzer
.venv-slither/bin/slither . --config-file slither.config.json
```

### Slither triage (latest local run)

| Detector | Verdict |
| --- | --- |
| `arbitrary-send-eth` (claims / fee router) | **Accepted** — intentional permissionless payouts to known recipients |
| `reentrancy-eth` on buy/migrate | **Mitigated** — `nonReentrant` + CEI reorder (state before tax/transfer); splitter is protocol-deployed |
| `reentrancy-no-eth` on ERC20 `transferFrom` | **Accepted** — meme token is trusted `VyntraToken` (no hooks) |
| `missing-zero-check` | **Hardened** — factory/token/curve constructors + owner setters |
| `calls-loop` on keeper | **Accepted** — by design; batch capped at `MAX_BATCH=50` |
| Naming / equality / div-before-mul / low-level-calls | **Informational** — documented / excluded in `slither.config.json` |

CI should keep `forge test` green on every PR.
