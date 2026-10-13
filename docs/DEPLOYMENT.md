# Deployment

## Vercel

A Vercel `404 DEPLOYMENT_NOT_FOUND` page means Vercel has no successful build for that URL. Usually the branch had no code yet, or the project points at the wrong branch or repository. Fix it like this:

1. **Create a PostgreSQL database.** Neon, Vercel Postgres (Storage tab) or Supabase all work. Copy its connection string, preferably the *pooled* one, with `sslmode=require`.
2. **Import the repository** in Vercel → *Add New Project* → `balamurugan-sss/lvprm`. The framework is detected as Next.js automatically.
3. **Set the production branch** under *Settings → Git* to the branch you want to deploy (for example `claude/great-sagan-q1juj6`, or `main` after merging). Pushes to other branches get *preview* URLs.
4. **Add environment variables** under *Settings → Environment Variables*:
   | Name | Value |
   |---|---|
   | `DATABASE_URL` | your Postgres connection string |
   | `DEMO_MODE` | `true` to show the demo account picker (omit in real production) |
5. **Deploy.** `package.json` defines `vercel-build`, which Vercel runs automatically. It:
   - applies `db/schema.sql` (idempotent)
   - loads the fictional demo data **only if the database is empty**
   - runs `next build`
6. Open the deployment URL from the Vercel dashboard (*Deployments → Visit*), not an old or guessed URL.

To reset the demo data later: `DATABASE_URL=<url> npm run db:reset`.

## Any Node host / container

```bash
npm ci
DATABASE_URL=postgres://… npm run db:setup   # schema + seed-if-empty
npm run build
DATABASE_URL=postgres://… npm start          # port 3000
```

Session cookies are `Secure` in production, so serve the app over HTTPS. For a plain-HTTP internal test you can set `INSECURE_COOKIES=true`.
