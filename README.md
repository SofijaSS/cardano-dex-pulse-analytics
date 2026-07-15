# Cardano DEX Pulse

A native-first Cardano DEX volume and TVL dashboard for weekly marketing and analytics reporting. The application does not average conflicting providers or fill gaps with estimates: native exchange metrics are shown as primary observations, DefiLlama remains visible as a benchmark, and unavailable periods render as `Data unavailable` or `N/A`.

## Quick start

Requirements: Node.js `>=22.13.0` and npm.

```bash
cp .env.example .env.local
npm install
npm run dev
```

Open `http://localhost:3000`. All configured production endpoints are public and need no key today. URL overrides stay server-side in `app/api/dashboard/route.ts`; add private headers there if a future provider requires authentication.

Verification commands:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

Set `USE_MOCK_DATA=true` only for local UI development. Mock mode is synthetic, is never enabled by default, and shows a persistent red warning in the interface.

## Data policy

The dashboard offers two explicit views:

- **Reconciled / native-first:** current native DEX data is primary. DefiLlama historical values are used only for WingRiders, SundaeSwap, Dano Finance, DeltaDeFi, and Saturn Swap when the live 24-hour comparison differs by no more than 20%.
- **DefiLlama benchmark:** values are displayed exactly as supplied by DefiLlama. They are not presented as independently verified.

The reconciled total is labelled **Observed** because public native APIs do not provide one complete, semantically aligned Cardano market series. Coverage counts accompany 24-hour, 7-day, and 30-day totals. Missing DEX periods are not extrapolated.

The independent production-grade upgrade path is a Cardano chain indexer such as cardano-db-sync/Yaci/Kupo, with a maintained contract-action registry for every DEX version. Commercial indexed providers such as Maestro or TapTools can reduce that work, but should still be reconciled against exchange-native values.

## Source inventory

Research and comparison were last reviewed on **2026-07-15**. Values below are a point-in-time validation snapshot, not fixtures used by the application.

| Source | Endpoint and field mapping | Expected update | Known limitation |
| --- | --- | --- | --- |
| DefiLlama DEX benchmark | `GET https://api.llama.fi/overview/dexs/cardano?...`; `total24h`, `total7d`, `total30d`, `total14dto7d`, `total60dto30d`, `protocols[]`, `totalDataChart`, `totalDataChartBreakdown` | Mostly hourly ingestion; chart is daily. App stale threshold: 26h for the latest chart point. | Aggregator benchmark only. Adapter scopes and rolling/calendar windows vary by protocol. |
| DefiLlama TVL | `GET https://api.llama.fi/protocols`; filter `category="Dexs"` and Cardano, map `chainTvls.Cardano`, fallback `tvl` | DefiLlama documents hourly TVL updates. App stale threshold: 2h. | Used as TVL fallback when a compatible native metric is unavailable. A protocol can expose multiple versions. |
| CoinGecko | `GET /api/v3/simple/price?ids=cardano&vs_currencies=usd&include_last_updated_at=true`; `cardano.usd`, `last_updated_at` | Near-real-time. App rejects price older than 4h. | Primary ADA/USD display price. No implicit conversion occurs without a fresh primary or fallback price. |
| Coinbase | `GET https://api.coinbase.com/v2/prices/ADA-USD/spot`; `data.amount` | Requested with each cached refresh; app stale threshold: 1h. | Used only when CoinGecko fails or is stale. The public response has no provider timestamp, so the server fetch time is displayed. |
| Minswap | `POST https://api-mainnet-prod.minswap.org/v1/pools/metrics`; sum `pool_metrics[].volume_24h` or `volume_7d` with `currency="usd"`. A parallel no-currency 24h request returns ADA and validates the implied ADA/USD rate. | Rolling/current; app stale threshold: 2h. | Minswap documents that omitted `currency` means ADA and `currency="usd"` means USD. The result uses `limit=100`, so it is a lower bound across pools ranked separately for each period. Native 30d and previous 7d are unavailable. |
| WingRiders | `GET https://api.mainnet.wingriders.com/v1/defillama`; `dailyVolume` in ADA, converted with timestamped CoinGecko price | Current daily metric; app stale threshold: 2h. | Native endpoint exposes only the current daily value. Historical periods use DefiLlama only after live agreement passes. |
| SundaeSwap | `POST https://api.sundae.fi/graphql`; `stats.volume.quantity` for lovelace | Current protocol metric; app stale threshold: 2h. | Public schema does not label the window as clearly as desired. The live value is checked against DefiLlama before benchmark history is accepted. Native `stats.tvl` is intentionally excluded because its semantics did not reconcile with protocol TVL. |
| Splash | `GET https://analytics.splash.trade/platform-api/v1/platform/stats`; `volumeUsd / 1e6`, `tvlUsd / 1e6` | Rolling/current; app stale threshold: 2h. | DefiLlama volume history is excluded when the live variance exceeds 20%. |
| MuesliSwap | `GET .../muesli-protocol-volume?interval=day&days=60`; timestamp-to-ADA daily map. `GET .../muesli-tvl?days=2`; latest `tvl / 1e6` ADA | Daily; app stale threshold: 26h. | Missing days in the returned interval are treated as zero. DefiLlama has no current volume; TVL definitions materially differ. |
| VyFinance | `GET https://api-v3.vyfi.io/fetchmaster?data=allPoolsAnalytics`; `tvl`, `volume24H`, `volume7D`, `volume14D` in ADA | Rolling/current; app stale threshold: 2h. | Previous 7d is `max(0, volume14D - volume7D)`. Public 30d volume is unavailable. DefiLlama has no volume benchmark. |
| Dano Finance | `GET .../defillama-dimensions?timestamp=...`; `data.dailyVolumeAdaValue / 1e6` ADA | Latest complete UTC day; app stale threshold: 50h from the period-start timestamp. | Daily endpoint. DefiLlama history is accepted only after live agreement passes. |
| DeltaDeFi | `GET .../public/volume/daily?timestamp=...`; `volume_usd` | Latest complete UTC day; app stale threshold: 50h from the period-start timestamp. | Daily endpoint. DefiLlama history is accepted only after live agreement passes. |
| Saturn Swap | `GET .../v1/defillama/volume?timestamp=...`; `volume.volume` USD | Latest complete UTC day; app stale threshold: 50h from the period-start timestamp. | A real zero remains zero; it is not converted to unavailable. Historical fallback still requires live agreement. |

All network requests use Zod response validation, a 12-second timeout, and three attempts with exponential backoff (250ms then 500ms). Each source reports `healthy`, `stale`, or `error`. The API route caches successful responses using `DATA_CACHE_SECONDS` (default 15 minutes).

## Comparison snapshot

The 2026-07-15 research run found these approximate 24-hour comparisons after converting ADA at the same CoinGecko timestamp:

| DEX | Native | DefiLlama | Decision |
| --- | ---: | ---: | --- |
| Minswap | $992.7k | $254.7k | About +290%; native top-100 lower bound is primary, DefiLlama history excluded. |
| WingRiders | $84.1k | $81.4k | About +3.4%; live comparison aligned. |
| SundaeSwap | $531.9k | $534.0k | About -0.4%; live comparison aligned. |
| Splash | $59.9k | $11.4k | About +425%; native current value is primary, DefiLlama history excluded. |
| VyFinance | $5.2k | Unavailable | Native only. |
| MuesliSwap | $0.1k latest complete day | Unavailable | Native daily series only. |

Minswap's native 7-day aggregate was approximately $10.8m versus DefiLlama's $2.8m. The app recomputes live comparisons on every refresh; it does not hard-code these research values.

## Calculations and validation

- Percentage change: `((current - previous) / previous) * 100`.
- If current/previous is unavailable, non-finite, or previous is zero, change is `N/A`.
- Volume-to-TVL: `24h volume / current TVL`; missing, zero, or negative TVL returns `N/A`.
- Source variance uses the same safe percentage formula with native as current and DefiLlama as previous.
- Minswap's USD response is accepted only when its ratio to the parallel ADA response is within 5% of the fresh ADA/USD reference price. A mismatch removes Minswap from observed totals and raises a source error.
- `aligned` means absolute live variance is at most 20%; `material-variance` means it exceeds 20%.
- Market share is share of the displayed observed cohort, never silently described as complete Cardano market share.
- Reconciled week-over-week compares only DEXes that have both periods from native or runtime-validated sources.
- Reconciled month-over-month remains unavailable because aligned native previous-30-day coverage is insufficient.

## Data model

`DashboardData` in `lib/types.ts` is the API contract:

- `price`: ADA/USD value, provider, endpoint, and timestamp.
- `aggregates`: observed totals, benchmark totals, comparable changes, and coverage counts.
- `dexes[]`: normalized current/period volumes, TVL, rank, share, native and DefiLlama comparison fields, quality flag, source, period note, and timestamp.
- `benchmarkSeries[]`: daily DefiLlama total plus normalized per-DEX breakdown for historical charts.
- `sources[]`: endpoint health, fetch timestamp, data timestamp, expected update interval, and status message.
- `warnings[]`: material variances, failed sources, and coverage cautions rendered in the UI.

Add or rename exchanges in `config/dexes.ts`; the dashboard components do not need changes. Any additional DefiLlama Cardano protocol with category `Dexs` is discovered dynamically and added as a row. It remains `Data unavailable` for volume until a native loader or benchmark alias is configured.

## Architecture

```text
Browser
  -> GET /api/dashboard
     -> concurrent native DEX fetches
     -> CoinGecko ADA/USD freshness validation
     -> DefiLlama benchmark + TVL fetches
     -> Zod validation, retry, stale detection
     -> native-first reconciliation and normalized DashboardData
  -> responsive React dashboard
     -> metric cards, filters, charts, table, WingRiders report
     -> CSV exports, clipboard summary, print/save-PDF
```

The browser never calls third-party analytics APIs directly and does not receive private environment variables. CSV exports are generated from the currently displayed rows or selected historical benchmark range. The weekly PDF is a print-optimized report using the browser's Save as PDF flow.

## Assumptions and limitations

- Public provider endpoints can change without versioning or an SLA. Failed/changed schemas surface as source errors instead of being coerced.
- DEXes do not use one shared definition for rolling 24h, latest UTC day, aggregator-routed trades, or protocol versions.
- Minswap's top-100 request is deliberately a lower bound, despite currently exceeding DefiLlama materially.
- Historical charts are clearly labelled DefiLlama benchmark because native endpoints do not expose one aligned, complete Cardano series.
- TVL definitions can include different assets, farms, versions, or pricing methods. Native TVL is used only when its units and semantics are compatible.
- The normalized internal model is USD. Selecting ADA divides every displayed USD value by one fresh, timestamped ADA/USD price, including both Minswap and DefiLlama, so providers are never compared in mixed units. ADA display is disabled without a fresh price. This is a display conversion, not historical daily FX conversion.
- This dashboard is decision support for reporting, not trading or financial advice.

## Project structure

```text
app/api/dashboard/route.ts   server-side data endpoint
components/                 reusable dashboard UI
config/dexes.ts             configurable DEX registry
lib/dashboard-data.ts       provider adapters and reconciliation
lib/calculations.ts         guarded calculations
lib/mock-data.ts            explicit development-only fixture
lib/types.ts                normalized API data model
tests/                      calculation and reconciliation tests
```
