# AlphaArena: Gamified Copy-Trading on Pacifica

A competitive copy-trading platform where users compete in weekly Trading Royale tournaments, mirror top traders on Pacifica DEX, and climb global leaderboards.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-14-black?logo=next.js)](https://nextjs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

![Hero](docs/images/landing.png)

---

## What Is AlphaArena?

AlphaArena connects to Pacifica DEX and lets you copy verified traders with one click. Compete in weekly Trading Royale tournaments for real prizes, track performance through live leaderboards, and earn referral rewards. Desktop only for now, with a mobile app on the way.

---

## Features

- **Trading Royale** - Weekly competitions with real prize pools, performance-ranked
- **One-Click Copy Trading** - Mirror any verified trader's positions proportionally in real time
- **Live Leaderboards** - Real-time rankings with win rates, PnL, and risk metrics
- **Pacifica Integration** - Automated trader data sync from Pacifica DEX
- **Wallet Auth** - Solana wallet-based authentication (Phantom, Solflare)
- **Referral System** - Earn points by referring friends via Fuul integration
- **Mobile Gate** - Desktop-only access with mobile app coming soon

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 (App Router), TypeScript, TailwindCSS |
| Backend | Next.js Route Handlers |
| Database | Neon PostgreSQL, Prisma ORM |
| Auth | Solana Wallet Adapter (Phantom, Solflare) |
| State | React Query (TanStack Query) |
| API | Pacifica DEX REST API |
| Referrals | Fuul SDK |

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/traders` | List traders with pagination, sorting, search |
| GET | `/api/traders/[id]/strategies` | Get a trader's open positions |
| GET | `/api/leaderboard` | Competition leaderboard |
| GET | `/api/stats` | Platform-wide statistics |
| GET | `/api/portfolio` | User portfolio data |
| GET | `/api/prices` | Current token prices |
| POST | `/api/copy/start` | Start copying a trader |
| POST | `/api/copy/stop-trader` | Stop copying a trader |
| POST | `/api/traders/track` | Track a new trader |
| DELETE | `/api/traders/delete` | Remove a tracked trader |
| POST | `/api/auth/sync` | Sync user on wallet connect |
| POST | `/api/referrals/apply` | Apply a referral code |
| GET | `/api/referrals/me` | Get user's referral info |
| GET | `/api/referrals/leaderboard` | Referral leaderboard |

---

## How It Works

```
Browser (Desktop Only)
  |
  v
Next.js Frontend (Vercel)
  |
  +---> Landing Page (/)        [standalone, no app shell]
  |
  +---> App Pages (/arena, /royale, /leaderboard, /portfolio, /referrals)
  |       |
  |       +---> App Shell (nav, footer, wallet connect)
  |
  +---> API Route Handlers
          |
          +---> Neon PostgreSQL (via Prisma)
          |
          +---> Pacifica DEX API (trader sync)
          |
          +---> Fuul API (referrals)
```

---

## Running Locally

```bash
git clone https://github.com/ajanaku1/AlphaArena.git
cd AlphaArena
npm install
```

Copy environment variables and fill in your credentials:

```bash
cp .env.example .env
```

Set up the database and start the dev server:

```bash
npm run db:generate
npm run db:push
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Project Structure

```
AlphaArena/
├── public/                      # Static assets (logo, favicons)
├── src/
│   ├── app/
│   │   ├── (landing)/           # Landing page (standalone layout)
│   │   │   ├── layout.tsx
│   │   │   └── page.tsx
│   │   ├── (app)/               # App pages (shared AppShell layout)
│   │   │   ├── layout.tsx
│   │   │   ├── arena/
│   │   │   ├── royale/
│   │   │   ├── leaderboard/
│   │   │   ├── portfolio/
│   │   │   ├── referrals/
│   │   │   └── add-trader/
│   │   ├── api/                 # Route handlers
│   │   ├── globals.css
│   │   ├── layout.tsx           # Root layout (providers, fonts)
│   │   └── providers.tsx        # Solana wallet + React Query
│   ├── components/
│   │   ├── app-shell.tsx        # Nav, footer, background effects
│   │   ├── mobile-gate.tsx      # Mobile device blocker
│   │   ├── wallet-connect.tsx   # Wallet connection UI
│   │   └── ui/                  # Shared UI primitives
│   ├── hooks/
│   ├── lib/
│   └── server/
├── prisma/
│   └── schema.prisma
└── package.json
```

---

## Scripts

```bash
npm run dev          # Start dev server
npm run build        # Production build
npm run start        # Start production server
npm run db:generate  # Generate Prisma client
npm run db:push      # Push schema to database
npm run db:migrate   # Run migrations
npm run db:studio    # Open Prisma Studio
npm run sync:traders # Sync traders from Pacifica
npm run lint         # Run ESLint
```

---

## License

MIT
