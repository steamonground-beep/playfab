# Feature status

Status is based on source inspection and focused unit/build checks; it does not mean production validation. Automated coverage remains incomplete.

| Feature | Status | Notes |
|---|---|---|
| Express API and modular service layout | PARTIALLY COMPLETE | Broad initial route/service scaffold; uniform validation and authorization need review. |
| PostgreSQL schema and migration | PARTIALLY COMPLETE | Initial schema, credential migration, and seed; Supabase migration compatibility should be verified on a project. |
| Email/password and guest auth | PARTIALLY COMPLETE | Flows exist; account recovery delivery and full account linking/merge are missing. |
| Custom ID login | PARTIALLY COMPLETE | Separate bcrypt credential required; older accounts need verified recovery/linking before login. |
| Player profile/data/statistics | PARTIALLY COMPLETE | Profile/data APIs exist; client statistic writes are blocked and trusted game-server writes require `GAME_SERVER_API_KEY`. |
| Inventory, currency, catalog | PARTIALLY COMPLETE | Initial schema/services; every mutation and transaction path needs adversarial review. |
| Achievements and leaderboards | PARTIALLY COMPLETE | Initial routes/services and tables; reset/season semantics need verification. |
| Friends, groups, lobbies, matchmaking | PARTIALLY COMPLETE | Initial service/schema implementation; concurrency and complete permissions need tests. |
| Moderation and analytics | PARTIALLY COMPLETE | Initial records and admin operations; coverage and reporting need work. |
| Cloud/server functions | PARTIALLY COMPLETE | Player-callable functions are disabled until trusted execution, idempotency, and server-side price validation are implemented. |
| Worker cleanup | PARTIALLY COMPLETE | Periodic expiry jobs exist; durable scheduling and reset correctness are limited. |
| Admin dashboard | PARTIALLY COMPLETE | React pages exist; secure provisioning, TOTP enrollment, and complete workflows are absent. |
| Unity C# SDK | PARTIALLY COMPLETE | HTTP client methods exist; compile against target Unity versions and exercise response/error handling. |
| Photon Realtime/Fusion and Voice | REQUIRES EXTERNAL CONFIGURATION | Separate app IDs supported in config; provider-side custom auth and real Photon integration test remain required. |
| Render + Supabase deployment | PARTIALLY COMPLETE | Blueprint and setup notes added; credentials/project configuration and live deployment are user-owned steps. |
| Automated test suite | PARTIALLY COMPLETE | Seven unit tests cover custom-ID validation, failed-login recording, account credential hashing, refresh rotation, and server-only statistic mutation; feature and integration coverage is still missing. |
| Full OpenAPI/API reference | NOT IMPLEMENTED | Only route overview currently documented. |
