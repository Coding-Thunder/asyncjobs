# Using the dashboard

The AsyncOps dashboard is a Next.js app at `/dashboard`. You sign up there, mint API keys, and watch jobs run. It talks to the API over HTTPS using a JWT stored in `localStorage`; it does not connect to Mongo or Redis directly.

## What is it and when to use it

Use the dashboard when you want to:

- Create and revoke API keys.
- Watch jobs execute in real time.
- Read the failure reason for a specific job.
- Retry one or many failed jobs after you ship a handler fix.
- See your monthly usage against the plan cap.

Use the SDK or REST (see [sdk.md](sdk.md)) when you want any of the above from code — tests, CI, scripts, cron.

## Sign up and log in

- **`/signup`** — email + password. Creates a user on your AsyncOps instance. The account starts on the `free` plan (1000 jobs/month).
- **`/login`** — returns a JWT, stored in `window.localStorage` under `token`. Default expiry 7 days (`JWT_EXPIRES_IN`).
- **Log out** — clears `token` and `user` from local storage.

The JWT is sent as `Authorization: Bearer …` on every dashboard request. The same header accepts either a JWT or an `ak_live_…` API key.

## Sections

### Jobs list — `/dashboard/jobs`

The main page. What you'll find on it:

- **Usage card** at the top — shows `jobCountMonthly / monthlyJobLimit` for the current plan, resets on the 1st of the month UTC. The number comes from `GET /me`.
- **Status strip** — four counts (failed, processing, pending, completed). Click any card to filter the list to that status; click again to clear.
- **Filters** (no date filter exists):
  - Free-text **search** over job id and type (substring, case-insensitive).
  - **State** dropdown: `all`, `pending`, `processing`, `completed`, `failed`.
  - **Type** dropdown: auto-populated from the types currently visible in the list.
  - A `[clear]` button appears when any filter is active.
- **Checkbox selection + bulk retry.** Tick the checkbox in the header row to select everything currently visible, or tick individual rows. A green bar appears with `$ retry --count=N` — clicking it issues `POST /jobs/:id/retry` in sequence for each selected id.
- **Stale-pending warning banner.** If any job has been `pending` for more than 15 seconds, a yellow `[WARN] No worker registered for this job type` banner appears, listing the offending `type`s. This is your canonical "why isn't anything happening" signal — see [debugging.md § Symptom 1](debugging.md#symptom-1--job-stuck-pending-forever).
- **List columns:** checkbox, job id (first 8 chars, click to open), type, state (colored badge), age (humanized), tries (`attempts`), arrow to detail page.
- **Refresh model.** The list polls `GET /jobs` **every 2 seconds**. Not SSE — because SSE is per-job. The "live — synced 3s" indicator at the top is just the elapsed time since the last poll.

### Job detail — `/dashboard/jobs/[id]`

Click any row or arrow in the list to open this page. It is **where real-time live updates happen**.

- **Header panel** — full job id, type, status badge, `attempts`, `idempotencyKey` (if one was set on create). There is **no "worker that claimed it"** — AsyncOps does not record worker identity. If you need it, write it into the logs from your handler (`await ctx.log('host=' + os.hostname())`).
- **Tabs:** `Data`, `Result`, `Logs`, `Error`. The page auto-selects a sensible default: `Error` when the job is `failed`, `Result` when `completed`, otherwise `Data`.
- **Real-time updates.** The detail page opens a Server-Sent Events connection to `GET /jobs/:id/stream`. Status transitions and log lines are pushed the moment they're published on the server. If SSE fails to connect, the page falls back to polling every 2 seconds, so you'll still see updates — just less snappy.
- **Retry button.** Issues `POST /jobs/:id/retry`. **The button is disabled when the job is `pending` or `processing`** — this is a guard against manually retrying a job that's about to run or is already running, which would race the in-flight handler against a new claim. You can only retry from this page when the job is `completed` or `failed`.

### API keys — `/dashboard/keys`

- **Create key.** Names are free-text. The API generates 32 random bytes, bcrypts them, and returns the raw `ak_live_…` string **once**. Save it immediately; there is no way to recover it afterwards.
- **List keys.** Shows name, prefix (the 8 characters after `ak_live_`, for visual matching), created/last-used timestamps. The raw key is never returned again.
- **Delete key.** `DELETE /api-keys/:id` — instantaneous revocation. The next request made with that key fails with `401 invalid API key`.

### Docs — `/dashboard/docs`

An in-dashboard mirror of these docs, with your API URL substituted into the code snippets so you can copy-paste commands that point at this specific instance.

## Real-time updates, summarized

| Page | Transport | Refresh cadence |
|---|---|---|
| `/dashboard/jobs` | Polling | `GET /jobs` every 2 s |
| `/dashboard/jobs/[id]` | SSE (falls back to polling on error) | Push-based; no fixed cadence |

The detail page is where you leave the tab open when you're actively debugging. The list page is where you watch aggregate activity.

## What the dashboard does NOT give you

Things users sometimes expect that are not there today:

- **Date range filter** on the jobs list. Filter by status/type/search only.
- **Worker identity** (which host ran which job). Not stored anywhere.
- **Audit log** of who in your account created or retried a job. There are no teams/RBAC — the whole account is one principal.
- **Per-job alerting or webhooks.** Set up your own alerting on your worker's `onError` or on the `GET /me` usage number.
- **Historical metrics** (throughput, p95 latency, failure rate). Not shown. You'll have to compute these from `GET /jobs` yourself or wire Mongo to Grafana.

## Common pitfalls

| Symptom | Cause |
|---|---|
| "Nothing is live — I refresh and numbers change but no push" | You're on the list page. It polls. Open a specific job to get SSE. |
| Retry button is greyed out | Job is `pending` or `processing`. Wait for it to finish, then retry. |
| Jobs stay `pending`, usage card shows N / 1000 and N is going up | Every `POST /jobs` is succeeding, but no worker is running with a handler for the type. Watch for the yellow stale-pending banner — it appears after 15 seconds. |
| `401 session expired` on every page | Dashboard JWT has expired (default 7 days). Log in again. |
| Copied the key and it doesn't work | Copy lost a character, or the key was revoked. Regenerate. |
| Pagination? | There isn't any. `GET /jobs` returns the newest 200, sorted `createdAt` descending. For anything more, use the API. |

See [debugging.md](debugging.md) for the failure-diagnosis drill and [deployment.md](deployment.md) if you're running the dashboard yourself.
