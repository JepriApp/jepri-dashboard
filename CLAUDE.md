# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Jepri Dashboard (`jepri-web`) — internal admin panel for Jepri, a produce (fruit & vegetable)
procurement/distribution business in Colombia. The UI is in **Spanish**. It was scaffolded from the
Next.js + Supabase starter kit and heavily extended; the real application lives entirely under
`app/protected/`.

## Commands

```bash
npm run dev                    # next dev --turbopack (localhost:3000)
npm run build                  # next build
npm run start                  # serve production build
npm run lint                   # eslint (next/core-web-vitals + next/typescript)
npm run update-supabase-types  # regenerate database.types.ts from the remote DB
```

- **No test suite exists** (no test runner, no test files). Don't assume one.
- `update-supabase-types` runs `supabase gen types typescript --project-id acuofxciywrktkckokqo`
  and needs `SUPABASE_ACCESS_TOKEN` in the environment (see CLI auth below).
- Node is required (an nvm-managed Node 24 is installed on this machine; `source ~/.nvm/nvm.sh`).
- Both `package-lock.json` and `pnpm-lock.yaml` are committed and there is no `packageManager`
  field. `pnpm-lock.yaml` is the one that actually gets updated — prefer pnpm and keep whichever
  lockfile you touch consistent.

## CLI auth (Vercel / Supabase) — per-shell, isolated

This project's Vercel and Supabase accounts are **different** from any global CLI login or Claude
connector. Activate them for the current shell only:

```bash
source ./scripts/use-jepri-cli.sh   # loads .env.cli.local, scopes vercel + supabase CLIs
```

- `.env.cli.local` (git-ignored) holds `SUPABASE_ACCESS_TOKEN` and the project refs.
- Vercel: team **"Jepri's projects"**, project `jepri-dashboard` (`.vercel/project.json`,
  git-ignored). `vercel login` global also works.
- Supabase project: **"Neptuno"**, ref `acuofxciywrktkckokqo`. This ref is also hardcoded in
  `next.config.ts` (`images.remotePatterns` → `acuofxciywrktkckokqo.supabase.co` storage) and in
  the `update-supabase-types` script — update all three if the project ever changes.

## Architecture

### Auth & routing
- Session handling is a Next middleware, but the file is **`proxy.ts`** at the repo root exporting
  `proxy` (not the conventional `middleware.ts`) — a rename inherited from the starter kit. It calls
  `updateSession()` in `lib/supabase/proxy.ts`, which refreshes the Supabase session and redirects
  any unauthenticated request to `/` unless the path is `/`, `/login`, or `/auth/*`.
- `hasEnvVars` in `lib/utils.ts` short-circuits that check when Supabase env vars are absent.
- Every real page is under `app/protected/`. `app/auth/*`, `components/tutorial/*`,
  `components/*-form.tsx`, `hero.tsx`, `deploy-button.tsx`, `env-var-warning.tsx` are starter-kit
  leftovers.

### Supabase clients (always typed with `Database` from `database.types.ts`)
- `lib/supabase/client.ts` — browser client, `createClient()`.
- `lib/supabase/server.ts` — RSC/server client, `await createClient()` (reads `cookies()`).
- `lib/supabase/proxy.ts` — middleware client.
- Never store the client in a module-global; create a fresh one per request/function (Fluid compute).
- Runtime env: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (in `.env.local`,
  mirrored from Vercel; the publishable key covers both new "publishable" and legacy "anon" keys).

### Data access patterns
- **Server components**: `const supabase = await createClient()` (server.ts), then call a function
  from a colocated `services/*.tsx` file that takes the client and runs `.from().select()`.
  Example: `app/protected/distribution-plans/page.tsx` → `services/listDistributionPlans.tsx`.
- **Client components**: `"use client"` + browser `createClient()` + TanStack Query `useQuery` /
  `useMutation`. Query keys are arrays (e.g. `["distribution-plan", planId]`); after a mutation,
  refresh with `queryClient.invalidateQueries({ queryKey: [...] })`.
- Query client factory: `app/get-query-client.ts` (staleTime 60s, dehydrates pending queries),
  wired through `providers/tanstackProvider.tsx`.

### UI stack
- **Ant Design v6 is the primary component library** (`antd/es/...` deep imports are common).
  Tailwind v3 + shadcn/ui ("new-york" style, `components/ui/`) is present but used for only a few
  components. `providers/providers.tsx` nests: next-themes `ThemeProvider` → `AntdProvider` →
  `TanstackProvider`.
- `app/protected/layout.tsx` renders the sider/header shell; `AutoMenu.tsx` and `AutoTitle` derive
  the current section from `usePathname()`. Nav: Inicio, Pedidos (`sale-orders`), Operación
  (`distribution-plans`), Productos, Usuarios (customers / suppliers / operators[disabled] / admins).
- Path alias: `@/*` → repo root.

### Domain model (`documentacion/ciclo_de_vida.md`, `documentacion/modelo_datos.mmd`)
Catalog (`product`, plus `offer` = a supplier's price for a product) → customer `shopping_cart` →
`sale_order` + `sale_item` → optional `purchase_order` + `purchase_item` for suppliers, linked to
sale items by quantity via `fulfillment` → daily `distribution_plan` + `distribution_plan_order`
(delivery `sequence` and status). Key points:
- The status shown in the UI is **`effective_status`** derived by DB views
  (`sale_order_with_total_and_status`) from the latest `distribution_plan_order`, not
  `sale_order.status` directly. Totals come from `*_with_total` views.
- Human-readable codes (`order_code`, `purchase_code`, `plan_code`) are generated by DB
  triggers/sequences — never set them from the app.
- Roles: `admin` / `operator` / `supplier` / `customer` (Pattern B: `profiles` + one table per role).
- Reference SQL and one-off maintenance scripts live in `scripts/*.sql`
  (`supabase_sql_mvp.sql` = schema, `seed_mock_data.sql`, `delete_operational_data.sql`, etc.).

### Siigo integration
Siigo is a Colombian accounting/invoicing SaaS. The DB carries `siigo_daily_*` snapshot tables,
`siigo_sync_run`, and `get_siigo_*` RPC functions (customer balances, overdue customers, daily
indicators, sales/collections summary). Finance pages under
`app/protected/distribution-plans/[id]/finance/` and product pages consume these.

## Conventions

- **Git commit messages must be written in English** (chat/UI is otherwise Spanish). History is
  mixed; new commits standardize on English.
- `.claude/skills/` and `.agents/skills/` are a vendored copy of `addyosmani/agent-skills`, tracked
  by `skills-lock.json` — treat as external, don't hand-edit.
