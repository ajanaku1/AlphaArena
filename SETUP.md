# Alpharena Configuration

## Privy Setup

1. Go to [Privy Dashboard](https://dashboard.privy.io/)
2. Create a new application
3. Copy your App ID
4. Add to `.env`: `NEXT_PUBLIC_PRIVY_APP_ID=your-app-id`

## Supabase Setup

1. Go to [Supabase](https://supabase.com/)
2. Create a new project
3. Get your project URL and anon key from Settings > API
4. Add to `.env`:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   ```

## Pacifica API Setup

1. Register for Pacifica API access
2. Add base URL to `.env`: `PACIFICA_API_BASE=https://api.pacifica.io`

## Fuul API Setup

1. Register for Fuul API access
2. Add your API key to `.env`: `FUUL_API_KEY=your-api-key`

## Database Setup

After configuring your DATABASE_URL:

```bash
# Generate Prisma client
npm run db:generate

# Push schema to database (development)
npm run db:push

# Or run migrations (production)
npm run db:migrate
```
