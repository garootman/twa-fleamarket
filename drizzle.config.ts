import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './apps/worker/src/db/schema.ts',
  out: './apps/worker/src/db/migrations',
  dialect: 'sqlite',
  driver: 'd1-http',
  dbCredentials: {
    accountId: 'e023ec3576222c6a7b6cdf933de3d915',
    databaseId: 'c69ea172-cc34-492c-af2c-ad1008927371',
    token: process.env.CLOUDFLARE_API_TOKEN!,
  },
});
