# Admin operations

This page covers operator-manual flows — the things AsyncOps can't do for itself because there is no billing integration, no SMTP, and no RBAC beyond a single `role: "admin"` flag.

These routes live under `/admin` and require an authenticated user whose `role` field is `admin`. See [deployment.md § Creating the first admin user](deployment.md#creating-the-first-admin-user) for how to grant the role.

## Upgrading a user's plan (replaces self-service billing)

Self-service plan upgrade is **deliberately not implemented**. AsyncOps has no billing integration; a public `POST /upgrade` would let anyone flip themselves to Pro for free. The pricing page's Pro CTA sends users to `mailto:` the operator inbox instead.

When a user wants to upgrade:

1. They email the operator (the mailto on `/pricing` points at whichever address you configured in [`apps/web/app/pricing/page.js`](../apps/web/app/pricing/page.js)).
2. You collect payment out-of-band — Stripe checkout link, invoice, whatever.
3. Once paid, flip their plan:

   ```bash
   curl -X POST "$ASYNCOPS_URL/admin/users/<USER_ID>/plan" \
     -H "Authorization: Bearer <ADMIN_JWT>" \
     -H "Content-Type: application/json" \
     -d '{"plan":"pro"}'
   ```

   Response:

   ```json
   {
     "id": "65f8a42c...",
     "email": "user@example.com",
     "plan": "pro",
     "jobCountMonthly": 42,
     "limit": 50000
   }
   ```

4. The change is immediate — the plan cap check on `POST /jobs` reads the `plan` field fresh on every request.

To downgrade, `POST` with `{"plan":"free"}`. Only `"free"` and `"pro"` are accepted; unknown values return 400.

Plans live in [`apps/api/plans.js`](../apps/api/plans.js). To add a tier, edit that file **and** the validator in [`adminRoutes.js`](../apps/api/routes/adminRoutes.js) that whitelists plan names.

## Delivering email verification links

AsyncOps does not send email. When a user requests verification via `POST /auth/request-verify`, the verification URL is printed to API stdout:

```
[auth] email verification link for user@example.com: https://app.asyncops.com/verify-email?token=eyJhbGciOi... (AsyncOps does not send email — deliver this manually.)
```

Process:

1. User clicks "Send verification email" in the dashboard → API prints the link to stdout.
2. Operator pulls the line from the log aggregator.
3. Operator forwards the URL to the user via support ticket, chat, or whatever channel you already have with them.
4. User opens the URL → dashboard POSTs the token to `/auth/verify-email` → `emailVerified: true` is set on the user doc.

The link JWT has a 1-day TTL. If the user doesn't act in time, they re-trigger the flow.

**Nothing in AsyncOps enforces `emailVerified`.** It's a marker, not a gate. Signup and login work regardless of the flag.

## Retrying a user's job

If a user's job is stuck in `failed` or `completed` and they need it re-run (e.g. they fixed their worker and want replay), admins can retry on their behalf without touching the user's API key:

```bash
curl -X POST "$ASYNCOPS_URL/admin/jobs/<JOB_ID>/retry" \
  -H "Authorization: Bearer <ADMIN_JWT>"
```

This is the same semantics as the user-facing `POST /jobs/:id/retry`:

- Only `failed` and `completed` are retriable. Any other status returns `409 { error: "job_not_retriable", status: "<current>" }`.
- Attempts counter is reset to 0; result and error are cleared.
- Counts against the **job owner's** monthly plan cap (admin-triggered retries still affect quota).
- An audit log line `"Job retry requested by admin"` is appended to the job.

## Inspecting users and their jobs

- `GET /admin/users` — list every user (no passwords returned), sorted newest first.
- `GET /admin/users/:id/jobs` — list that user's last 200 jobs.
- `GET /admin/jobs/:id` — full job doc including embedded logs and the owning `userId`.

These are read-only and exist for support triage. There is no admin dashboard UI today; hit the endpoints from `curl`, a Mongo shell, or whatever query tool you prefer.

## What admins cannot do

- **Change another user's email or password.** There is no `PUT /admin/users/:id`. If a user locks themselves out, update the `users` doc directly in Mongo, then have them re-request verification.
- **Impersonate a user.** No admin-signed JWT-for-another-user path. Intentional — keeps the audit trail clean.
- **Roll API keys on behalf of a user.** Users roll their own via `/api-keys`.
- **See plaintext API keys.** They're bcrypt-hashed on creation and never stored reversibly. If a user loses theirs, they revoke + create a new one.

These are all deliberate omissions. Adding them is an RBAC question, not a small patch.
