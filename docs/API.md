# API Reference

All API routes are under `/api/v1`. Authenticated player routes accept `Authorization: Bearer <accessToken>`. Success responses use `{ "success": true, "data": ... }`; errors use `{ "success": false, "error": { "code", "message" } }`.

## Common Response Format

### Success Response
```json
{
  "success": true,
  "data": { ... }
}
```

### Error Response
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message"
  }
}
```

## Authentication Routes

### POST /auth/LoginRayvoCustomIDNoPCVR
Login or create account using custom ID with a separate secret credential.

**Request Body:**
```json
{
  "customId": "string (3-128 chars)",
  "customSecret": "string (32-256 chars)",
  "displayName": "string (optional, max 64 chars)",
  "createAccount": "boolean (default: true)"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "player": {
      "publicId": "string",
      "displayName": "string",
      "isGuest": "boolean",
      "customId": "string"
    },
    "accessToken": "string",
    "refreshToken": "string",
    "expiresIn": "15m"
  }
}
```

### POST /auth/guest
Create a temporary guest account.

**Request Body:**
```json
{
  "displayName": "string (optional)"
}
```

**Response:** Same as LoginRayvoCustomIDNoPCVR

### POST /auth/register
Register with email and password.

**Request Body:**
```json
{
  "email": "string (valid email)",
  "password": "string (min 8 chars)",
  "displayName": "string (1-64 chars)"
}
```

**Response:** Same as LoginRayvoCustomIDNoPCVR

### POST /auth/login
Login with email and password.

**Request Body:**
```json
{
  "email": "string",
  "password": "string"
}
```

**Response:** Same as LoginRayvoCustomIDNoPCVR

### POST /auth/refresh
Refresh access token using refresh token.

**Request Body:**
```json
{
  "refreshToken": "string"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "accessToken": "string",
    "refreshToken": "string"
  }
}
```

### POST /auth/logout
Logout and invalidate session.

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "refreshToken": "string (optional)"
}
```

### DELETE /auth/account
Permanently delete player account.

**Headers:** `Authorization: Bearer <token>`

### GET /auth/export
Export all player data (GDPR compliance).

**Headers:** `Authorization: Bearer <token>`

### POST /auth/recover
Request account recovery via email.

**Request Body:**
```json
{
  "email": "string"
}
```

### POST /auth/recover/custom-id
Request recovery for custom-ID accounts without secret.

**Request Body:**
```json
{
  "customId": "string",
  "email": "string"
}
```

### POST /auth/recover/custom-id/complete
Complete custom-ID recovery with new secret.

**Request Body:**
```json
{
  "customId": "string",
  "token": "string",
  "newSecret": "string (32-256 chars)"
}
```

## Player Routes

### GET /player/profile
Get current player profile.

**Headers:** `Authorization: Bearer <token>`

### PUT /player/profile
Update player profile.

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "displayName": "string (optional)",
  "avatarUrl": "string (optional)",
  "bio": "string (optional, max 500 chars)"
}
```

### GET /player/data
Get player data.

**Headers:** `Authorization: Bearer <token>`

**Query Params:** `keys` (optional, comma-separated list), `visibility` (optional: private, public, readonly)

### PUT /player/data
Update player data.

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "data": {
    "key1": { "value": any, "visibility": "private|public|readonly" },
    "key2": { "value": any }
  },
  "expectedVersions": {
    "key1": 1
  }
}
```

### DELETE /player/data
Delete player data keys.

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "keys": ["key1", "key2"]
}
```

### GET /player/statistics
Get player statistics.

**Headers:** `Authorization: Bearer <token>`

**Note:** Player clients can only read statistics. Server-authoritative writes require game server authentication.

## Economy Routes

### GET /economy/inventory
Get player inventory.

**Headers:** `Authorization: Bearer <token>`

### GET /economy/currency
Get player currency balances.

**Headers:** `Authorization: Bearer <token>`

### GET /economy/catalog
Get catalog items.

**Headers:** `Authorization: Bearer <token>`

## Leaderboard Routes

### GET /leaderboards/:leaderboardId
Get leaderboard entries.

**Query Params:** `limit` (default: 100), `offset` (default: 0)

### GET /leaderboards/:leaderboardId/position
Get player's position on leaderboard.

**Headers:** `Authorization: Bearer <token>`

## Achievement Routes

### GET /achievements
Get player achievements and progress.

**Headers:** `Authorization: Bearer <token>`

## Social Routes

### GET /social/friends
Get friends list.

**Headers:** `Authorization: Bearer <token>`

### POST /social/friends/request
Send friend request.

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "toPublicId": "string"
}
```

### POST /social/friends/respond
Respond to friend request.

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "fromPublicId": "string",
  "accept": "boolean"
}
```

### DELETE /social/friends/:friendPublicId
Remove friend.

**Headers:** `Authorization: Bearer <token>`

### POST /social/block
Block a player.

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "blockedPublicId": "string"
}
```

### DELETE /social/block/:blockedPublicId
Unblock a player.

**Headers:** `Authorization: Bearer <token>`

### GET /social/search
Search for players.

**Query Params:** `q` (search query, min 2 chars), `limit` (default: 20)

## Matchmaking Routes

### POST /matchmaking/ticket
Create matchmaking ticket.

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "queueName": "string",
  "partyMembers": ["publicId1", "publicId2"],
  "skillRating": "number",
  "region": "string"
}
```

### GET /matchmaking/ticket/:ticketId
Get ticket status.

**Headers:** `Authorization: Bearer <token>`

### DELETE /matchmaking/ticket/:ticketId
Cancel matchmaking ticket.

**Headers:** `Authorization: Bearer <token>`

## Photon Routes

### GET /photon/realtime/auth
Get Photon Realtime authentication data.

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "data": {
    "appId": "string",
    "userId": "string",
    "authToken": "string",
    "region": "string",
    "appVersion": "string"
  }
}
```

### GET /photon/voice/auth
Get Photon Voice authentication data.

**Headers:** `Authorization: Bearer <token>`

**Response:** Same format as Realtime auth

## Cloud Functions Routes

### GET /functions
List available cloud functions.

### POST /functions/:functionName
Execute a cloud function.

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "idempotencyKey": "string (optional)",
  "currencyCode": "string (for grant_daily_reward)",
  "statKey": "string (for update_statistic)",
  "value": "number (for update_statistic)"
}
```

### GET /functions/:functionName/logs/my
Get player's function execution logs.

**Headers:** `Authorization: Bearer <token>`

**Query Params:** `limit` (default: 50)

## Analytics Routes

### POST /analytics/events
Submit game events.

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "events": [
    {
      "eventType": "string",
      "properties": {}
    }
  ]
}
```

## Admin Routes

### POST /admin/login
Admin login.

**Request Body:**
```json
{
  "username": "string",
  "password": "string",
  "totpCode": "string (optional, if 2FA enabled)"
}
```

### GET /admin/players/search
Search for players (admin).

**Headers:** `Authorization: Bearer <adminToken>`

**Query Params:** `q`, `limit`

### GET /admin/players/:publicId
Get player details (admin).

**Headers:** `Authorization: Bearer <adminToken>`

### POST /admin/players/:publicId/ban
Ban player (admin).

**Headers:** `Authorization: Bearer <adminToken>`

**Request Body:**
```json
{
  "reason": "string",
  "durationMinutes": "number (optional)",
  "adminNotes": "string (optional)"
}
```

### POST /admin/players/:publicId/unban
Unban player (admin).

**Headers:** `Authorization: Bearer <adminToken>`

### POST /admin/players/:publicId/grant-item
Grant item to player (admin).

**Headers:** `Authorization: Bearer <adminToken>`

**Request Body:**
```json
{
  "itemId": "string",
  "quantity": "number (default: 1)"
}
```

### POST /admin/players/:publicId/grant-currency
Grant currency to player (admin).

**Headers:** `Authorization: Bearer <adminToken>`

**Request Body:**
```json
{
  "currencyCode": "string",
  "amount": "number",
  "reason": "string"
}
```

### GET /admin/catalog/items
Get catalog items (admin).

**Headers:** `Authorization: Bearer <adminToken>`

### POST /admin/catalog/items
Create catalog item (admin).

**Headers:** `Authorization: Bearer <adminToken>`

### PATCH /admin/catalog/items/:itemId
Update catalog item (admin).

**Headers:** `Authorization: Bearer <adminToken>`

### POST /admin/leaderboards/:leaderboardId/reset
Reset leaderboard (admin).

**Headers:** `Authorization: Bearer <adminToken>`

### GET /admin/matchmaking/queues
Get active matchmaking queues (admin).

**Headers:** `Authorization: Bearer <adminToken>`

### GET /admin/matchmaking/matches
Get active matches (admin).

**Headers:** `Authorization: Bearer <adminToken>`

### GET /admin/photon/config
Get Photon configuration (admin).

**Headers:** `Authorization: Bearer <adminToken>`

### PUT /admin/photon/config
Update Photon configuration (admin).

**Headers:** `Authorization: Bearer <adminToken>`

**Request Body:**
```json
{
  "realtimeAppId": "string",
  "voiceAppId": "string",
  "region": "string",
  "appVersion": "string"
}
```

### GET /admin/analytics/summary
Get analytics summary (admin).

**Headers:** `Authorization: Bearer <adminToken>`

### GET /admin/audit-logs
Get audit logs (admin).

**Headers:** `Authorization: Bearer <adminToken>`

**Query Params:** `limit` (default: 100)

### POST /admin/api-keys
Create API key (superadmin only).

**Headers:** `Authorization: Bearer <adminToken>`

**Request Body:**
```json
{
  "name": "string",
  "permissions": ["read", "write"]
}
```

### POST /admin/2fa/setup
Setup 2FA for admin account.

**Headers:** `Authorization: Bearer <adminToken>`

**Response:**
```json
{
  "success": true,
  "data": {
    "secret": "string",
    "qrUri": "string"
  }
}
```

### POST /admin/2fa/enable
Enable 2FA after verification.

**Headers:** `Authorization: Bearer <adminToken>`

**Request Body:**
```json
{
  "totpCode": "string"
}
```

## Game Server Routes

### PUT /server/players/:publicId/statistics
Update player statistics from trusted game server.

**Headers:** 
- `x-game-server-key: <GAME_SERVER_API_KEY>`
- `Idempotency-Key: <unique-id>`

**Request Body:**
```json
{
  "statistics": [
    {
      "statKey": "string",
      "increment": "number",
      "value": "number (optional, absolute value)"
    }
  ]
}
```

**Note:** This endpoint requires the `GAME_SERVER_API_KEY` environment variable. Never ship this key in Unity clients.

## Health Check

### GET /health
Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "ISO-8601 timestamp"
}
```

## Rate Limiting

Most endpoints are rate-limited. Standard limits:
- Auth endpoints: 10 requests per minute per IP
- API endpoints: 60 requests per minute per player
- Admin endpoints: 30 requests per minute per admin

Rate limit headers are included in responses:
- `X-RateLimit-Limit`: Request limit
- `X-RateLimit-Remaining`: Remaining requests
- `X-RateLimit-Reset`: Unix timestamp when limit resets

## Error Codes

Common error codes:
- `VALIDATION_ERROR`: Invalid request data
- `UNAUTHORIZED`: Missing or invalid authentication
- `FORBIDDEN`: Insufficient permissions
- `NOT_FOUND`: Resource not found
- `CONFLICT`: Resource conflict (e.g., duplicate)
- `RATE_LIMIT_EXCEEDED`: Too many requests
- `ACCOUNT_BANNED`: Account is banned
- `ACCOUNT_LOCKED`: Account temporarily locked
- `INTERNAL_ERROR`: Server error

## Example Usage

### Login
```sh
curl -X POST "$RAYVO_URL/api/v1/auth/LoginRayvoCustomIDNoPCVR" \
  -H 'Content-Type: application/json' \
  -d '{"customId":"example-player-123","customSecret":"replace-with-random-credential","createAccount":true}'
```

### Get Player Data
```sh
curl -X GET "$RAYVO_URL/api/v1/player/data" \
  -H 'Authorization: Bearer <accessToken>'
```

### Create Matchmaking Ticket
```sh
curl -X POST "$RAYVO_URL/api/v1/matchmaking/ticket" \
  -H 'Authorization: Bearer <accessToken>' \
  -H 'Content-Type: application/json' \
  -d '{"queueName":"ranked","skillRating":1200,"region":"us"}'
```

### Game Server Statistic Update
```sh
curl -X PUT "$RAYVO_URL/api/v1/server/players/player-123/statistics" \
  -H 'x-game-server-key: <GAME_SERVER_API_KEY>' \
  -H 'Idempotency-Key: unique-match-id' \
  -H 'Content-Type: application/json' \
  -d '{"statistics":[{"statKey":"wins","increment":1}]}'
```
