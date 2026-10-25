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
supabase functions deploy set-language
supabase functions deploy translate-message
```

Translation needs an OpenAI API key ([platform.openai.com](https://platform.openai.com)):

```sh
supabase secrets set OPENAI_API_KEY=sk-...
```

Then create `apps/web/.env.local` (template in `apps/web/env.example`) with your project's URL and anon key, and run the dashboard:

```sh
pnpm --filter web dev
```

### Demo data (optional, dev projects only)

Run `supabase/seed.sql` in the SQL editor of a **development** project. It creates one admin, a demo app, and a handful of realistic queries. The admin username/password and the demo app's API key are defined at the top of that file — read them there.

`seed.sql` is deliberately untracked (it carries those credentials in plaintext), so it exists only on the machine that created it. Never run it against production: real API keys are shown once at creation and only their SHA-256 hash is stored.

## Environment variables

**Web (`apps/web/.env.local`, template in `apps/web/env.example`):**

```
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
```

**SDK:** no env vars — configuration is passed as props (see below). Keep the API key out of source control (e.g. `expo-constants` extra fields or react-native-config).

**Edge Functions (`supabase secrets set`):**

| Secret | Required for | Notes |
| --- | --- | --- |
| `OPENAI_API_KEY` | Translation | Without it, messages are stored and delivered untranslated and the dashboard shows a retry. |
| `TRANSLATION_MODEL` | — | Defaults to `gpt-5.6-luna`. Set it to trade cost for quality without redeploying. |
| `RESEND_API_KEY`, `ESCALATION_CRON_TOKEN`, `DASHBOARD_URL` | Unread escalation | See the escalation section. `ESCALATION_CRON_TOKEN` also authenticates the translation sweep. |

## Multilingual support

End users write in the language they pick in the SDK; admins read and write English. Nobody sees a language they didn't choose.

- **First open** shows a one-time language prompt, pre-selected from `defaultLanguage` (if the host app passes one) or the device locale. The choice is stored server-side per `revenuecat_id`, so it survives a reinstall and follows the user across devices, and it can be changed later from the sheet.
- **Every message is stored twice**: `body` as the sender typed it, `body_translated` as its counterpart. The dashboard shows user messages in English with the original one click away; the SDK shows admin replies in the user's language.
- **Translation never blocks a send.** The message row is written first and translated a moment later. If the provider is down, the message still arrives — untranslated, with a badge and a retry in the dashboard — and a `pg_cron` job sweeps anything that was missed. Push notification copy is localized from a static string table, not the model.
- **List and search stay English**: the query list's excerpt is the translated text, and search matches against both renderings, so an English search term finds a German thread.

Adding a language means touching three tables that are deliberately kept in sync by hand — `supabase/functions/_shared/languages.ts`, `packages/react-native-sdk/src/i18n/languages.ts`, and a new string table under `packages/react-native-sdk/src/i18n/strings/` (the compiler will tell you which keys are missing).

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

In the dashboard sidebar: **Add app** → name it → copy the generated API key from the one-time dialog. Only the key's SHA-256 hash is stored, so a lost key can't be recovered — rotate it instead.

### Rotating an app's key

On the app's page, the key icon beside its name opens **Rotate API key**. Every installed copy of the host app carries the current key, so you choose when it retires:

- **In 30 days** (default) or **in 7 days** — routine rotation. Both keys work until then, while the release with the new key rolls out.
- **Now** — for a leaked key. Installed copies lose support until users update.

The new key is shown once, like at registration. Only one old key is kept: rotating again during a grace period cuts the older one off immediately (the dialog says so first), and **Revoke it now** ends a grace period early.

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
  defaultLanguage="fr"                       // optional; pre-selects the language prompt
/>
```

Peer dependencies: `react`, `react-native`, `react-native-safe-area-context`. The bottom sheet is built on the core `Modal`/`Animated` APIs — no gesture-handler/reanimated native dependencies to install.

The launcher shows an unread badge (admin replies newer than the user's read receipt) and opens a sheet with: new-query actions, the user's open and resolved conversations, a composer with a live 10–300 character counter, and read-only resolved threads showing when they were resolved.

End users never see which admin they are talking to — replies are attributed to the support team, in notifications and in the thread alike, and admin display names are not included in the SDK's API responses at all. The dashboard still shows who wrote and who resolved what.

### Language

The whole sheet — chrome and messages alike — renders in the language the user picks the first time they open support. Pass `defaultLanguage` when your app already knows what they read; the SDK falls back to the device locale, and in both cases it is only a pre-selection, since the user still confirms. Supported: English, Spanish, French, German, Dutch, Portuguese, Italian, Polish, Turkish, Russian, Japanese, Korean, Simplified Chinese, Hindi (`SUPPORTED_LANGUAGES` and `LANGUAGE_LABELS` are exported if you want to build your own picker).

### Launcher appearance

The launcher is the only part of the SDK that lives inside the host app's own UI, so it takes styling props. All optional:

| Prop | Default | What it does |
| --- | --- | --- |
| `variant` | `"solid"` | `solid` — accent fill, elevated: the floating action button. `soft` — surface fill + hairline border, for a header. `minimal` — bare mark, for a nav bar. |
| `size` | `52` | Diameter in px (height when `label` is set). |
| `label` | — | Renders a pill with this text beside the mark instead of a circle. |
| `accentColor` | design-token indigo | Brand color (hex). The pressed shade, the 12% wash behind chips and own-message bubbles, and a legible foreground are all derived from it. |
| `style` | — | Applied to the launcher: position it, add margins. `{ position: 'absolute', right: 20, bottom: 32 }` gives the usual corner FAB. |

The badge caps at `99+`, and pulses twice — not forever — when a new reply arrives.

### Unread and read receipts

The server counts unread as "admin messages newer than the user's read receipt", which is authoritative but always slightly behind the device. The SDK therefore keeps a per-thread watermark: the `created_at` of the newest reply the user has actually seen (a server timestamp, so the device clock is never part of the comparison). Displayed unread is the stricter of the two counts, which is right in both directions — read here but the receipt hasn't landed yet, or read on another device.

That carries three rules worth knowing when reading `useSupportThreads.ts`:

- Responses apply in issue order, so a slow poll can't overwrite a newer one.
- `get-unread-count` returns a bare number that can't be reconciled against local reads, so its answer is dropped if a read happened while it was in flight, and it is skipped entirely while any receipt is unconfirmed — the full payload is polled instead, because that one *can* be reconciled.
- Failed `mark-read` calls are retried with backoff rather than swallowed; until one lands, the watermark holds the UI correct.

Replies that arrive while the user is sitting in a thread are marked read on arrival, so the badge never climbs while they are reading.

### Refresh cadence

Polling adapts to what the user is looking at, so latency is low where it's felt and cheap where it isn't:

| Context | Interval | Endpoint |
| --- | --- | --- |
| Inside a thread | 5s | `get-threads` |
| Sheet open (list) | 15s | `get-threads` |
| Sheet closed (idle) | `pollIntervalMs`, default 60s | `get-unread-count` (~18 bytes) |
| Sheet closed, receipt unconfirmed | as above | `get-threads` (until the receipt lands) |

It also refreshes on mount, whenever the sheet opens, and whenever the app returns to the foreground. Set `pollIntervalMs={0}` to disable idle polling.

### Push notifications (optional)

`expo-notifications` is an **optional** peer dependency. Install it and the SDK asks for notification permission the first time the support sheet opens, then registers an Expo push token so admin replies arrive as notifications:

```sh
npx expo install expo-notifications
```

Skip it and everything else works unchanged — the SDK detects its absence at runtime and never calls it. **A user who denies permission keeps full use of every feature**; the outcome is recorded only so the dashboard can show whether they're reachable, displayed on the thread panel as *Push on* / *Push denied* / *Push not asked*.

Tapping a support-reply notification opens the sheet straight into that thread — from the background or a cold start, no host code needed. If the launcher isn't mounted when the tap arrives (it lives behind sign-in, or on a settings screen), the thread opens when it mounts, provided that's within a minute; after that the tap is dropped rather than popping the sheet open unprompted later. With several launchers mounted, the most recently mounted one takes it.

Push tokens require a development or production build — `getExpoPushTokenAsync` cannot mint one in Expo Go. A granted permission with no token is recorded as such and shown distinctly on hover in the dashboard.

### Example app

```sh
cd packages/react-native-sdk/example
npm install
npm run ios      # or: npm run android / npm start
```

Set `SUPABASE_URL` in `App.tsx` to your project URL. The bundled demo key and user only work if you ran `supabase/seed.sql` on **that** project — otherwise every call comes back `401 Invalid API key` and the sheet shows "Support is unavailable right now" (with the reason logged to the console in dev). Register the app in the dashboard and paste its key into `App.tsx` if you'd rather not seed.

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
- **Edge Functions**: validate the `x-api-key` header by SHA-256 hash against `apps.api_key_hash` (or `previous_api_key_hash` while a rotation's grace period lasts), verify the claimed `app_name` matches that key, and scope every read/write to that app + `revenuecat_id`.
- **Admins**: any row in `admins` matching `auth.uid()` gets select/insert/update via RLS. No roles, no signup. Messages are the exception: an admin can only insert a reply as themself (`sender = 'admin'`, `admin_id = auth.uid()`, no translation of their own), and can't update messages at all — translations are written by the Edge Functions.
- **No deletes**: no DELETE policies exist for anyone — queries and messages are an immutable audit trail.
- **Char limits**: user messages 10–300, admin messages ≤1000 — enforced in the clients, in the Edge Functions, and by CHECK constraints.
- **Push status**: `push_subscriptions` is written only by the `register-push` function (service role) and readable only by admins. `send-push` is the single staff-facing function — it requires an admin JWT, not an API key, and verifies membership in `admins` before sending.
- **Rate limits**: the write endpoints enforce Postgres-backed fixed windows — per user, 5 new queries and 30 replies per hour; per app, 500 writes per hour (blast-radius cap if a key leaks). Blocked requests get a 429 with `Retry-After`; the SDK shows "Too many requests — try again later" inline. Limits live in `supabase/functions/_shared/rate-limit.ts`.
