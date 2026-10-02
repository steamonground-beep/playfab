# Security and production limitations

The code provides baseline controls (password hashing, signed expiring tokens, active-session checks for player access tokens, parameterized SQL, request schemas on selected routes, role checks on selected admin routes, Helmet, CORS, rate limiting, audit/event records). Those controls do not by themselves establish production readiness.

## Important account risk

`LoginRayvoCustomIDNoPCVR` now requires both a custom ID and a separately stored bcrypt-hashed credential of at least 32 characters; knowing the ID alone no longer grants access. The credential is still a bearer secret on a client device and can be extracted from a compromised client. Never embed one shared credential in the game. Generate a unique credential per account and keep it in platform secure storage, or use a platform identity token verified by the backend for stronger ownership proof. Existing accounts created before migration 002 cannot use this login until a verified recovery/link path is provided. The route name is not security.

## Deployment requirements

- Generate distinct, random secrets (at least 32 bytes) for `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `SESSION_SECRET`, `API_KEY_SALT`, and `PHOTON_AUTH_SECRET`; rotate any value ever committed or shared.
- Do not seed the default admin on a public database. Create an admin through a controlled provisioning procedure and enable TOTP before opening dashboard access.
- Limit dashboard origin via `CORS_ORIGINS`; restrict admin accounts and network exposure where possible. Browser localStorage tokens are vulnerable to script injection; an HttpOnly cookie/session design and stronger browser protections are recommended.
- Configure trusted proxy handling deliberately before using client IP for throttling/auditing. Current in-memory rate limits are per process and unsuitable as a distributed abuse control.
- Set database connection limits appropriate to Supabase's chosen pooler. Apply migrations using a dedicated migration credential and least privilege.
- Do not grant currency/items/statistics from client-callable endpoints. Audit every caller and make valuable writes server-authorized and atomic.
- Set `GAME_SERVER_API_KEY` to a unique random secret before enabling trusted game-server statistic writes. It must remain on a trusted server; Unity client builds must never contain it.
- Validate JSON size and content, paginate queries, add abuse controls, and review all route authorization before exposing publicly.
- HTTPS is provided at the Render edge. Do not deploy the API behind an untrusted plain HTTP proxy.

## Known gaps requiring remediation

Account recovery currently has no complete delivery/verification channel; account linking/merging is not complete; admin TOTP enrollment/backup recovery and provisioning are incomplete; CSRF protections are not implemented for cookie auth; there is no distributed rate-limit store configured; API key permission enforcement and audit coverage need review. Player-callable cloud functions are disabled because existing reward/match handlers accepted client claims. The Photon auth code currently returns signed custom data but does not configure a Photon Custom Authentication provider or prove Photon accepts/validates it. Treat Photon authentication as integration work pending a provider-side implementation and end-to-end test.
