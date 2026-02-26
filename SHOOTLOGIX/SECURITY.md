# ShootLogix Security Documentation

## Authentication

### Method
- **Nickname + password** authentication (no email, no SSO, no self-registration)
- Users are created exclusively by administrators

### Password Storage
- Passwords hashed with **bcrypt** (12 rounds)
- Plain text passwords never stored or logged
- Pre-configured accounts have their passwords set during initial seeding only

### Token System
- **Access tokens**: JWT (HS256), 30-minute expiry, stateless
  - Contains: user_id, nickname, is_admin flag
  - Sent via `Authorization: Bearer <token>` header
- **Refresh tokens**: Opaque random string (64 bytes, URL-safe), 30-day expiry
  - Stored in database, revocable
  - Used to obtain new access tokens without re-authentication
- JWT secret loaded from `JWT_SECRET` environment variable
  - Falls back to random per-process secret in development (tokens don't survive restarts)
  - **MUST** be set in production

### Rate Limiting
- Login endpoint: 5 attempts per minute per IP address
- In-memory tracking (resets on server restart)

## Authorization (RBAC)

### Roles
| Role | Description |
|------|-------------|
| ADMIN | Full access to everything, manages users and projects |
| UNIT | Full access to all tabs, cannot modify prices (except fuel), no admin functions |
| TRANSPO | Access limited to BOATS, PICTURE BOATS, SECURITY BOATS, TRANSPORT, FUEL |
| READER | Read-only access to all tabs, can export data |

### Role Assignment
- Roles are **project-scoped**: a user can have different roles on different projects
- One user can be ADMIN on KLAS7 and READER on another project
- ADMIN users (is_admin flag) see all projects regardless of membership

### Access Control Implementation
- Global `before_request` hook on all `/api/` routes
- Two-layer check: authentication (valid JWT) then authorization (role-based)
- Route-to-tab mapping determines which tab a route belongs to
- Tab access checked against role's allowed tab list
- Write operations (POST/PUT/DELETE) additionally blocked for READER role
- Admin panel routes require `is_admin` flag

### Project Isolation
- Users only see projects they are explicitly invited to
- ADMIN users see all projects
- Production ID extracted from URL path or `X-Project-Id` header
- Non-members receive 403 Forbidden

## Frontend Security

### Token Storage
- Tokens stored in `localStorage` (acceptable for this deployment context)
- Automatic redirect to `/login` on 401 responses
- Automatic token refresh using refresh token on access token expiry

### UI Restrictions
- CSS-based hiding of tabs, buttons, and form fields per role
- `role-reader` body class hides all edit/create/delete controls
- `admin-only` class shows admin panel only to ADMIN users
- Price fields marked `price-readonly` for non-ADMIN users

## Security Headers

Currently not configured (to be addressed in deployment phase):
- Content-Security-Policy (CSP)
- X-Content-Type-Options
- X-Frame-Options
- Strict-Transport-Security (HSTS)
- CORS (currently unrestricted for dev)

## Database

- SQLite with WAL mode and foreign keys enabled
- Auth tables: `users`, `project_memberships`, `refresh_tokens`
- Unique constraints on `users.nickname` and `(user_id, production_id)` in memberships
- Indexes on foreign keys for performance

## Decisions & Trade-offs

1. **In-memory rate limiting**: Simple dict-based tracker, resets on restart.
   Acceptable for single-instance deployment. For multi-instance, use Redis.

2. **localStorage for tokens**: Standard for SPAs. Cookie-based storage with
   HttpOnly flag would be more secure but adds complexity for this use case.

3. **No CSRF protection**: API uses Bearer tokens (not cookies), so CSRF is
   not applicable for authenticated requests.

4. **No password complexity validation**: Minimum 6 characters for admin-created
   passwords. No self-registration means password quality is admin-controlled.

5. **SQLite for auth**: Sufficient for expected concurrent user count (<50).
   For higher scale, migrate to PostgreSQL.
