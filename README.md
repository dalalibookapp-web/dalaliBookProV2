# Backend Starter — Express + Neon PostgreSQL

JWT auth template with access/refresh token cycling, OTP email verification via Resend.

---

## Setup

```bash
npm install
cp .env.example .env
# Fill in your .env values
```

Run the schema against your Neon DB:
```bash
psql $DATABASE_URL -f schema.sql
```

Start dev server:
```bash
npm run dev
```

---

## API Routes

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| POST | `/auth/register` | — | Register, receive OTP via email |
| POST | `/auth/verify-otp` | — | Submit OTP → get tokens on success |
| POST | `/auth/resend-otp` | — | Resend OTP if expired or not received |
| POST | `/auth/login` | — | Login (verified users only) |
| POST | `/auth/refresh` | — | Cycle refresh token, get new token pair |
| POST | `/auth/logout` | — | Revoke refresh token |
| GET | `/auth/me` | Bearer token | Get current user |
| GET | `/health` | — | Health check |

---

## Auth Flow

```
Register
  → account created (unverified)
  → 6-digit OTP sent via Resend (expires in 10 min)
  → NO tokens yet

POST /auth/verify-otp  { email, otp }
  → OTP verified
  → user marked verified
  → access_token (15m) + refresh_token (7d) issued
  → welcome email sent

Login (verified users only)
  → access_token (15m) + refresh_token (7d) issued

Access token expires
  → POST /auth/refresh with refresh_token
  → old refresh_token revoked
  → new access_token + refresh_token issued

Logout
  → POST /auth/logout with refresh_token
  → token marked revoked in DB

Reuse of revoked token detected
  → ALL tokens for that user revoked (security wipe)
```

---

## Request Examples

**Register**
```json
POST /auth/register
{ "email": "user@example.com", "password": "password123" }
```

**Verify OTP**
```json
POST /auth/verify-otp
{ "email": "user@example.com", "otp": "482910" }
```

**Resend OTP**
```json
POST /auth/resend-otp
{ "email": "user@example.com" }
```

**Login**
```json
POST /auth/login
{ "email": "user@example.com", "password": "password123" }
```

**Refresh**
```json
POST /auth/refresh
{ "refreshToken": "eyJ..." }
```

**Logout**
```json
POST /auth/logout
{ "refreshToken": "eyJ..." }
```

**Me**
```
GET /auth/me
Authorization: Bearer <accessToken>
```

---

## Protected Routes

Use `authMiddleware` on any route you want to protect:

```js
const authMiddleware = require('./middleware/auth');

router.get('/your-route', authMiddleware, yourController);
// req.user → { id, email }
```
