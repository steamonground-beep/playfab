# Rayvo Game Backend

Original, self-hostable game backend for Unity projects using Photon Realtime/Fusion and Photon Voice. The API and dashboard are designed for Render; PostgreSQL can be hosted by Supabase. Photon remains the realtime/voice transport and requires its own developer configuration.

## Current state

This repository is an early implementation scaffold, not yet a production-ready, complete PlayFab replacement. It contains an Express API, SQL schema/seed, React admin UI, a Unity HTTP SDK, and a cleanup worker. Several services have initial endpoint implementations, but the full request checklist is not covered by automated tests. Custom-ID login now requires a separate random credential; existing accounts need a recovery/link flow before they can authenticate using the new requirement. See [security limitations](docs/SECURITY.md) and [feature status](docs/FEATURES.md).

## Deploy with Render + Supabase

1. Create a Supabase project and copy its PostgreSQL connection string from **Connect**. Use direct PostgreSQL when Render can reach the database over IPv6; if not, use Supabase's **Session pooler** (port 5432) for IPv4. Keep the database password private.
2. In Supabase, use the SQL editor or a local Postgres client to apply migration files in order (`001_initial_schema.sql`, `002_custom_id_credentials.sql`, `003_matchmaking_idempotency.sql`), or run `npm run migrate` from a trusted local environment. The seed file is optional development data and creates a default admin account; do not use it in a public deployment.
3. Push this repository to a Git provider and create a Render Blueprint from `render.yaml`. Set `DATABASE_URL` to the Supabase connection string. Set `CORS_ORIGINS` on the API to the exact admin static-site URL (comma-separated origins only; no trailing slash). The Blueprint trusts one proxy hop for client IP handling on Render; set the correct value for any other reverse-proxy topology.
4. After the services build, set the admin service's `VITE_API_URL` to the API origin, e.g. `https://rayvo-api.onrender.com`, then redeploy the admin static site. Vite variables are baked into the build.
5. For Photon, add the Realtime and Voice App IDs independently to the API service environment. Configure `PHOTON_REALTIME_APP_ID` and `PHOTON_VOICE_APP_ID` from their respective Photon apps; they are not interchangeable. Set region and app version to match Unity.
6. Open `https://<api-host>/health`; it should return `{"status":"ok",...}`. Open the admin static site and sign in only after creating an admin account securely (see below).

The Blueprint provisions the API web service and static dashboard; Render free web services may sleep and have ephemeral local filesystems. The cleanup worker is not included because Render background workers require a paid plan. Run it locally for development, deploy it as an optional paid Render worker, or schedule its tasks on infrastructure you already operate. Free plan availability/limits can change. This setup does not make Supabase, Render, or Photon accounts/configuration part of the repository or guarantee ongoing free tiers.

### Supabase notes

- Use the application database connection string, not the Supabase `service_role` key. Never place Supabase keys in Unity or frontend environment variables.
- Store the URL only in Render's secret environment settings. Supabase connection strings include credentials.
- The current `pg` pool uses TLS without certificate verification for production-compatible connectivity. This encrypts traffic but does not verify the server certificate; hardening that behavior is a remaining deployment task.
- Apply schema migrations with a privileged database role. The current schema uses PostgreSQL extensions/functions and should be reviewed against the selected Supabase project before production.

## Local development

Requirements: Node.js 20+, npm, Docker Desktop (for local PostgreSQL/Redis). Copy `.env.example` to `.env`, replace development secrets, then run:

```sh
npm install
npm run docker:up
npm run migrate
npm run seed
npm run dev
```

In separate terminals use `npm run dev:admin` and `npm run dev:worker`. Local admin credentials seeded by the SQL seed are `admin / Admin123!`; change them immediately and never run that seed against production. Build with `npm run build`; `npm test` runs the current seven focused authentication/server-authority unit tests. Feature and integration coverage remains incomplete.

## Layout

- `backend/` Express API and service modules
- `admin-dashboard/` React/Vite management interface
- `unity-sdk/` Unity C# client source
- `database/` PostgreSQL migration and development seed
- `worker/` periodic expiry cleanup
- `docker/` local compose and container definitions
- `docs/` setup, API, security and feature notes

## Configuration

See [.env.example](.env.example). Production-required values include `DATABASE_URL`, strong unique JWT/session/API-key/Photon signing secrets, `CORS_ORIGINS`, and optional separate Photon IDs. Redis is optional for the current API's core request path; Render Blueprint does not provision it. Current rate limiting is process-local, so multiple instances do not share counters.

## API and SDK

API base path: `/api/v1`. Health: `/health`. The public custom-ID route is `/api/v1/auth/LoginRayvoCustomIDNoPCVR`. See [API notes](docs/API.md). Unity SDK source lives in `unity-sdk/RayvoSDK`; copy the directory into a Unity project and configure the backend URL. Photon client connection snippets and limitations are in [Photon setup](docs/PHOTON.md).

## License

No license has been added yet. Add an appropriate license before redistributing this repository.
