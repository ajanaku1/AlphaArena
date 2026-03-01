# Alpharena

> **Compete. Copy. Conquer.**

A gamified copy-trading platform where users can compete in weekly Trading Royale tournaments, copy top traders from Pacifica, and earn rewards.

## Features

- 🏆 **Trading Royale** - Weekly competitions with real prizes
- 👥 **Copy Trading** - One-click copy of top Pacifica trader strategies
- 📊 **Live Leaderboards** - Real-time rankings and performance tracking
- 🔄 **Pacifica Integration** - Real-time trader data sync from Pacifica DEX
- 🔐 **Privy Auth** - Secure wallet-based authentication
- 💰 **Fuul Referrals** - Earn points by referring friends

## Tech Stack

- **Frontend**: Next.js 14 App Router, TypeScript, TailwindCSS, shadcn/ui
- **Backend**: Next.js Route Handlers, Prisma ORM
- **Database**: SQLite (dev) / PostgreSQL (prod via Supabase)
- **API Integration**: Pacifica DEX API
- **State**: React Query (TanStack Query)

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- Pacifica API access (optional, for trader sync)

### Installation

1. **Clone and install**

```bash
cd AlphaArena
npm install
```

2. **Set up environment variables**

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

```env
# Database (SQLite for local dev)
DATABASE_URL="file:./dev.db"

# Pacifica API (optional - for trader sync)
PACIFICA_API_BASE=https://api.pacifica.fi
PACIFICA_API_KEY=your-api-key  # Optional, for higher rate limits

# Tracked trader wallet addresses (comma-separated)
TRACKED_TRADERS=wallet1,wallet2,wallet3

# Supabase (for production)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# Privy Authentication
NEXT_PUBLIC_PRIVY_APP_ID=your-privy-app-id

# Fuul API (referrals)
FUUL_API_KEY=your-fuul-api-key
```

3. **Set up the database**

```bash
# Generate Prisma client
npm run db:generate

# Push schema to database
npm run db:push
```

4. **Run the development server**

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the application.

## Project Structure

```
AlphaArena/
├── prisma/
│   └── schema.prisma          # Database schema
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── traders/       # Traders API with pagination/sorting
│   │   │   ├── competitions/  # Active competitions
│   │   │   ├── leaderboard/   # Leaderboard data
│   │   │   └── copy/          # Copy position creation
│   │   ├── arena/             # Trader Arena page (copy-trading UI)
│   │   ├── leaderboard/       # Competition leaderboard
│   │   ├── traders/           # Traders browse page
│   │   ├── globals.css        # Global styles + dark theme
│   │   ├── layout.tsx         # Root layout
│   │   └── page.tsx           # Landing page
│   ├── components/
│   │   └── ui/                # shadcn/ui components
│   ├── lib/
│   │   ├── pacifica-client.ts # Pacifica API client
│   │   ├── prisma.ts          # Prisma client
│   │   ├── supabase.ts        # Supabase client
│   │   ├── query-client.ts    # React Query client
│   │   └── utils.ts           # Utility functions
│   └── server/
│       ├── sync/
│       │   └── sync-traders.ts # Trader sync service
│       └── trader.ts          # Server-side operations
├── types/
│   └── index.ts               # TypeScript type definitions
└── package.json
```

## Pacifica Integration

### Trader Sync

Alpharena syncs trader data from Pacifica DEX using their REST API:

```bash
# Sync all tracked traders
npm run sync:traders
```

This will:
1. Fetch account info for each tracked wallet
2. Get current open positions
3. Calculate performance metrics from trade history
4. Upsert traders and strategies to the database
5. Handle rate limiting with exponential backoff

### Adding Tracked Traders

Add trader wallet addresses to your `.env`:

```env
TRACKED_TRADERS=42trU9A5...,7xK9mN2p...,9bQ3rT8w...
```

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/traders` | GET | Get traders with pagination, sorting, search |
| `/api/traders/[id]/strategies` | GET | Get trader's open positions |
| `/api/competitions` | GET | Get active competitions |
| `/api/leaderboard` | GET | Get competition leaderboard |
| `/api/copy` | POST | Create a copy position |

### Query Parameters for /api/traders

```
GET /api/traders?limit=20&offset=0&sortBy=totalPnl&sortOrder=desc&search=trader
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| limit | number | 20 | Results per page (max 100) |
| offset | number | 0 | Pagination offset |
| sortBy | string | totalPnl | Sort field (totalPnl, winRate, accountEquity, totalCopiers) |
| sortOrder | string | desc | Sort order (asc, desc) |
| search | string | - | Search by name or wallet address |

## Database Schema

### Trader Model
- `pacificaTraderId` - Wallet address on Pacifica
- `totalPnl` - Total realized PnL from trade history
- `winRate` - Win rate percentage
- `accountEquity` - Current account equity
- `positionsCount` - Number of open positions
- `lastSyncedAt` - Last sync timestamp

### Strategy Model
- `symbol` - Trading pair (BTC, ETH, etc.)
- `side` - Position direction (bid=long, ask=short)
- `size` - Position size
- `entryPrice` - Entry price (VWAP)
- `pnl` - Current PnL
- `openedAt` - Position open time
- `closedAt` - Position close time (null = open)

## Scripts

```bash
# Development
npm run dev          # Start dev server
npm run build        # Build for production
npm run start        # Start production server

# Database
npm run db:generate  # Generate Prisma client
npm run db:push      # Push schema to database
npm run db:migrate   # Run migrations
npm run db:studio    # Open Prisma Studio

# Sync
npm run sync:traders # Sync traders from Pacifica

# Linting
npm run lint         # Run ESLint
```

## Rate Limiting

The Pacifica API uses a credit-based rate limiting system:

| Tier | Credits/60s |
|------|-------------|
| Unidentified IP | 125 |
| With API Key | 300 |
| Fee Tier 1-5 | 300 - 6,000 |
| VIP 1-3 | 20,000 - 40,000 |

The sync service automatically handles rate limits with:
- Exponential backoff
- Request queuing
- Credit monitoring from response headers

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT License

## Acknowledgments

- [Next.js](https://nextjs.org/)
- [shadcn/ui](https://ui.shadcn.com/)
- [Prisma](https://www.prisma.io/)
- [Pacifica DEX](https://pacifica.fi/)
- [Privy](https://privy.io/)
- [Fuul](https://fuul.io/)
