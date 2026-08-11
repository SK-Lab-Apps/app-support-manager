# Support Platform

Customer support for mobile apps: an admin dashboard, a React Native SDK, and a Supabase backend in one pnpm monorepo.

```
├── apps/web/                  # Next.js 15 admin dashboard
├── packages/react-native-sdk/ # @appsupportkit/support-sdk (+ example/ Expo app)
├── packages/design-tokens/    # Shared colors, spacing, typography
└── supabase/                  # Migrations, RLS, Edge Functions, seed
```

End users file feedback / feature requests / bug reports from inside a mobile app (via the SDK) and chat with admins in two-way threads. Admins triage everything per app in the dashboard. End users never touch the database directly — they go through Edge Functions authenticated by a per-app API key; admins authenticate with Supabase Auth and RLS.

## Prerequisites

- Node 20+ and pnpm 9+
- [Supabase CLI](https://supabase.com/docs/guides/cli)
- A Supabase project ([supabase.com](https://supabase.com), free tier is fine)

## Setup

```sh
pnpm install

# Point the CLI at your Supabase project and apply the schema
supabase link --project-ref <project-ref>
supabase db push

# Deploy the end-user API (JWT verification off — they authenticate via x-api-key)
supabase functions deploy submit-query
supabase functions deploy get-threads
supabase functions deploy get-unread-count
supabase functions deploy post-message
supabase functions deploy mark-read
supabase functions deploy register-push
supabase functions deploy send-push
```

Then create `apps/web/.env.local` (template in `apps/web/env.example`) with your project's URL and anon key, and run the dashboard:

```sh
pnpm --filter web dev
```

### Demo data (optional, dev projects only)

Run `supabase/seed.sql` in the SQL editor of a **development** project. It creates an admin (`sarthak` / `admin1234`), a demo app **Habitloop** with API key `sk_support_demo_habitloop_2f8a1c`, and a handful of realistic queries. Don't run it in production — in production, keys are shown once at creation and only their SHA-256 hash is stored.

## Environment variables

**Web (`apps/web/.env.local`, template in `apps/web/env.example`):**

```
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
```

**SDK:** no env vars — configuration is passed as props (see below). Keep the API key out of source control (e.g. `expo-constants` extra fields or react-native-config).

## Production

Repeat the Setup steps (`supabase link`, `supabase db push`, the `supabase functions deploy` commands) against your production project. The functions only need the default `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` secrets, which Supabase provides automatically. Skip the demo seed.

### Seeding an admin (production)

There is **no signup flow anywhere** — admins are created manually:

1. Create the auth user: Dashboard → Authentication → Users → *Add user* (email + password, confirm email), or:
   ```sh
   supabase auth users create --email you@company.com --password '<password>'
   ```
2. Insert the admin row (SQL editor):
   ```sql
   insert into public.admins (id, username, display_name)
   values (
     (select id from auth.users where email = 'you@company.com'),
     'yourusername',      -- what you type on the login page
     'Your Name'          -- shown on replies and resolutions
   );
   ```

The login page resolves username → email via the `admin_email_for_username` RPC, then uses Supabase password auth.

### Registering an app

In the dashboard sidebar: **Add app** → name it → copy the generated API key from the one-time dialog. Only the key's SHA-256 hash is stored; if the key is lost, register a new app.

## Using the SDK

```tsx
import { SupportButton } from '@appsupportkit/support-sdk';

<SupportButton
  appName="Habitloop"                        // as registered in the dashboard
  apiKey={SUPPORT_API_KEY}                   // shown once at app creation
  supabaseUrl="https://<project-ref>.supabase.co"
  user={{
    name: 'Maya Okafor',
    isPaid: true,
    revenuecatId: 'rc_anon_8f31bd2c',        // RevenueCat app user id
    appVersion: '2.4.1',
  }}
  theme="dark"                               // or "light"; default "dark"
/>
```

Peer dependencies: `react`, `react-native`, `react-native-safe-area-context`. The bottom sheet is built on the core `Modal`/`Animated` APIs — no gesture-handler/reanimated native dependencies to install.

The button shows an unread badge (admin replies newer than the user's read receipt), and opens a sheet with: new-query actions, the user's open/resolved threads, a composer with a live 10–300 character counter, and read-only resolved threads showing who resolved them.

### Refresh cadence

Polling adapts to what the user is looking at, so latency is low where it's felt and cheap where it isn't:

| Context | Interval | Endpoint |
| --- | --- | --- |
| Inside a thread | 5s | `get-threads` |
| Sheet open (list) | 15s | `get-threads` |
| Sheet closed (idle) | `pollIntervalMs`, default 60s | `get-unread-count` (~18 bytes) |

It also refreshes on mount and whenever the app returns to the foreground. Set `pollIntervalMs={0}` to disable idle polling.

### Push notifications (optional)

`expo-notifications` is an **optional** peer dependency. Install it and the SDK asks for notification permission the first time the support sheet opens, then registers an Expo push token so admin replies arrive as notifications:

```sh
npx expo install expo-notifications
```

Skip it and everything else works unchanged — the SDK detects its absence at runtime and never calls it. **A user who denies permission keeps full use of every feature**; the outcome is recorded only so the dashboard can show whether they're reachable, displayed on the thread panel as *Push on* / *Push denied* / *Push not asked*.

Push tokens require a development or production build — `getExpoPushTokenAsync` cannot mint one in Expo Go. A granted permission with no token is recorded as such and shown distinctly on hover in the dashboard.

### Example app

```sh
cd packages/react-native-sdk/example
npm install
npm run ios      # or: npm run android / npm start
```

Set `SUPABASE_URL` in `App.tsx` to your project URL. If you ran the demo seed on that project, the bundled demo key and user work as-is and submitted queries appear live in the dashboard.

### Publishing the SDK

```sh
cd packages/react-native-sdk
npm version <patch|minor|major>
pnpm publish --access public   # runs bob build via prepublishOnly;
                               # pnpm rewrites the workspace:* dependency
```

`@appsupportkit/design-tokens` must be published first (same flow from `packages/design-tokens`), or bundle it by moving it to devDependencies and inlining tokens.

## Development

```sh
pnpm build       # all packages (tokens css → web → sdk)
pnpm typecheck   # strict TS across the workspace
pnpm lint        # eslint (web: next lint)
```

Edge Functions run on Deno and are excluded from the Node toolchain; check them with `deno check supabase/functions/**/index.ts` or at deploy time.

## Security model

- **anon role**: zero direct table access — RLS is enabled everywhere with no anon policies, and default grants are revoked. End users only reach data through Edge Functions.
- **Edge Functions**: validate the `x-api-key` header by SHA-256 hash against `apps.api_key_hash`, verify the claimed `app_name` matches that key, and scope every read/write to that app + `revenuecat_id`.
- **Admins**: any row in `admins` matching `auth.uid()` gets full select/insert/update via RLS. No roles, no signup.
- **No deletes**: no DELETE policies exist for anyone — queries and messages are an immutable audit trail.
- **Char limits**: user messages 10–300, admin messages ≤1000 — enforced in the clients, in the Edge Functions, and by CHECK constraints.
- **Push status**: `push_subscriptions` is written only by the `register-push` function (service role) and readable only by admins. `send-push` is the single staff-facing function — it requires an admin JWT, not an API key, and verifies membership in `admins` before sending.
- **Rate limits**: the write endpoints enforce Postgres-backed fixed windows — per user, 5 new queries and 30 replies per hour; per app, 500 writes per hour (blast-radius cap if a key leaks). Blocked requests get a 429 with `Retry-After`; the SDK shows "Too many requests — try again later" inline. Limits live in `supabase/functions/_shared/rate-limit.ts`.
