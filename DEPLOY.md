# CargoNode Deployment Guide

## Frontend (Vercel)

1. Push to GitHub
2. Import repository in Vercel
3. Set environment variables:
   - `NEXT_PUBLIC_STELLAR_NETWORK=testnet`
   - `NEXT_PUBLIC_ESCROW_CONTRACT_ID=CAI52UIAHEMT3SNQ2EXOJKHHC2PAGLGURZYNL6HFZJ6LL5KDQFURBQUH`
   - `NEXT_PUBLIC_API_URL=https://your-backend.railway.app/api`
4. Deploy

## Backend (Railway)

1. Push to GitHub
2. Import repository in Railway
3. Set environment variables:
   - `PORT=3001`
   - `FRONTEND_URL=https://your-frontend.vercel.app`
   - `STELLAR_NETWORK=testnet`
   - `ESCROW_CONTRACT_ID=CAI52UIAHEMT3SNQ2EXOJKHHC2PAGLGURZYNL6HFZJ6LL5KDQFURBQUH`
   - `USDC_CONTRACT_ID=CAATNNYENLGM6JUS522SLKU2BYHHLN5PYI7XNRJXP7CE2KESE7P52FW5`
   - `DATABASE_URL=postgresql://...`
4. Deploy

## Smart Contract (Stellar Testnet)

```bash
cd contracts
stellar contract build
stellar contract deploy \
  --wasm target/wasm32v1-none/release/cargonode_escrow.wasm \
  --source-account deployer \
  --network testnet \
  -- \
  --deployer <DEPLOYER_ADDRESS> \
  --token-address <TOKEN_ADDRESS>
```

## Database Setup

```bash
# Connect to PostgreSQL
psql postgresql://user:pass@host:5432/dbname

# Run migration
cd backend
npm run db:migrate
```

## Monitoring

- Backend logs: Pino structured logging (JSON in production)
- Request logging: All HTTP requests with method, URL, status, duration
- Health check: GET /api/health
