# Support Platform

Customer support for mobile apps: an admin dashboard, a React Native SDK, and a Supabase backend in one pnpm monorepo.

```
├── apps/web/                  # Next.js 15 admin dashboard
├── packages/react-native-sdk/ # @appsupportkit/support-sdk (+ example/ Expo app)
├── packages/design-tokens/    # Shared colors, spacing, typography
└── supabase/                  # Migrations, RLS, Edge Functions, seed
```

End users chat with support from inside a mobile app (via the SDK), and admins answer — or write first, to one user or many — from the dashboard, where everything is triaged per app. End users never touch the database directly — they go through Edge Functions authenticated by a per-app API key; admins authenticate with Supabase Auth and RLS.

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
supabase functions deploy send-message
supabase functions deploy register-user
supabase functions deploy send-outreach
supabase functions deploy review-opened
supabase functions deploy revenuecat-webhook
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
| `RESEND_API_KEY`, `ESCALATION_FROM`, `ESCALATION_CRON_TOKEN`, `DASHBOARD_URL` | Unread escalation | See the escalation section. `ESCALATION_CRON_TOKEN` also authenticates the translation sweep. |
| `REVENUECAT_WEBHOOK_SECRET` | Cancelled plans | Any long random string. RevenueCat sends it with each event; see the cancellations section. |

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

### Messaging users first

Each app has **Inbox**, **Users** and **Sent** tabs.

- **Users** lists the app's paying and trial users — name, plan (PRO, Trial, or either one cancelled), language, app version, push status, last seen — filterable by plan and push, newest first. Select some (or all shown, up to 1,000) and **Message** them. Free users aren't stored: they're never messaged first, and a user whose trial or subscription lapses leaves the list the next time the SDK reports them. Their conversations stay in the inbox like anyone's.
- The composer takes a custom message or a saved template, with `{first_name}`, `{name}` and `{app}` filled in per user. A user with no name on record loses the placeholder and the space before it, so `Hi {first_name},` reads `Hi,`. Templates are shared across apps (see Templates below).
- Each user gets the message as a new conversation in their support chat, translated into their language: the template is translated once per language with the placeholders intact, then filled in. A language that fails to translate is sent in English and picked up by the translation sweep.
- These conversations stay out of the inbox, the open counts and the response-time stats until the user replies; then they appear like any other.
- Push is a per-send choice, off by default — without it users see the badge on the support button. Apple's guidelines don't allow promotional pushes unless users opted in to them, so keep push for service messages.
- **Sent** lists each send with its audience, how many read it, and how many replied. **Clear log** removes every send from the list, with its counts, in one transaction (`clear_sent_log`); the messages stay in users' chats, and a reply still reaches the inbox.

The send runs in `send-outreach` (admin JWT), and the conversation, first message and broadcast record for every recipient are written in one transaction (`create_outreach`), so a failure part-way sends nothing.

### Templates

**Templates** in the sidebar lists every saved message — shared by all apps — to add, edit and delete. They're offered in two places:

- **Messaging users** from the Users tab, where `{first_name}`, `{name}` and `{app}` are filled in per recipient when it's sent (the composer can also save, update or delete a template on the spot).
- **Replying** in a conversation: the **Templates** picker beside the send button fills the template in for that user and puts it at the cursor, to edit before sending. Like any reply it's written in English and translated for the user.

Deleting a template doesn't touch anything already sent with it.

### Deleting conversations

Tick conversations in an app's inbox (or all shown, with the header box) and **Delete**. After a confirmation they're removed in one transaction (`delete_conversations`), each with all its messages — from the dashboard and from the user's support chat in the app alike. There's no undo.

### Review requests

A reply can carry a **Rate on the App Store / Google Play** button: in a conversation, turn on **Review request** in the composer (it pre-fills a suggested message you can edit) and send. Set up once per app with the star in the app's header — the App Store ID (the number in `apps.apple.com/app/id…`) and the Google Play package.

- The text is an ordinary reply — translated, delivered and pushed like any other. SDK 0.4+ adds the button for the user's platform, opening the store app's write-a-review page (or its web page if the store app won't open). SDKs before 0.4 show the text alone, and the composer says so for those users.
- The button is offered only when the user's store is set up — by the platform their SDK reports, or either store for users on older SDKs.
- One request per stretch of conversation: after asking, the button waits until the user writes again.
- When the user taps through, the dashboard shows **Opened the store** under the request. That's a tap, not a review — the stores don't report who reviewed.
- It is a link to the review page, not an in-app rating prompt, and nothing may be offered in exchange: Apple and Google both forbid incentivized reviews, and the composer repeats this.

### Cancellations

A user who turns off auto-renew keeps their access until the period ends, so their app still reports them as Trial or PRO. RevenueCat's webhook marks them **Trial cancelled** or **PRO cancelled** as soon as they cancel, in the Users tab and the inbox, both filterable by it. Nothing is sent to them — reaching out is up to you. Turning auto-renew back on, renewing or buying again puts them back on Trial or PRO, and like anyone, they leave the Users tab once their app reports them free.

Set up once, then once per app:

1. `supabase secrets set REVENUECAT_WEBHOOK_SECRET=<long random string>` and deploy `revenuecat-webhook`.
2. In RevenueCat, **Integrations → Webhooks → Add**, for the app's project:
   - **URL**: `https://<project-ref>.supabase.co/functions/v1/revenuecat-webhook?app=<app id>` — the app id is the one in the dashboard's URL, `/apps/<app id>`.
   - **Authorization header**: `Bearer <the same secret>`.
3. **Send test event** should come back 200.

Users are matched by RevenueCat app user id (and its aliases), which is why the SDK's `revenuecatId` should be RevenueCat's own. Someone not in the Users tab — free, or never seen by SDK 0.4+ — is skipped.

### Unread escalation

A user message no admin has read 5 hours after it was sent is emailed to every admin, one email per conversation. A `pg_cron` job checks every 5 minutes, so it goes out between 5h00 and 5h05. Opening the conversation in the dashboard, or resolving it, cancels it. Each message is emailed once; one that Resend refuses is tried again on the next check.

Set up once:

1. In Resend, add and verify a sending domain (**Domains → Add domain**, then its DNS records) and create an API key.
2. Set the secrets and deploy:
   ```sh
   supabase secrets set RESEND_API_KEY=re_... ESCALATION_CRON_TOKEN=<long random string> DASHBOARD_URL=https://<your dashboard>
   supabase secrets set ESCALATION_FROM="Support <alerts@yourdomain.com>"
   supabase functions deploy escalate-unread
   ```
3. Give the cron job the project URL and the same token (SQL editor):
   ```sql
   select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
   select vault.create_secret('<the same token>', 'escalation_cron_token');
   ```

`ESCALATION_FROM` must be an address on the verified domain. Without it, mail goes from Resend's test sender, `onboarding@resend.dev`, which only delivers to the Resend account owner — and all admins are on one email, so a single other admin gets the whole email refused. An API key restricted to your domain refuses the test sender outright. A refusal shows in the function's logs and in Resend's, nowhere else.

To see what would be sent without sending it:

```sh
curl -X POST https://<project-ref>.supabase.co/functions/v1/escalate-unread \
  -H "Authorization: Bearer <ESCALATION_CRON_TOKEN>" -H "Content-Type: application/json" \
  -d '{"dry_run": true, "threshold_minutes": 1}'
```

It returns the recipients and each email. Without `dry_run` it sends them.

## Using the SDK

```tsx
import { SupportButton } from '@appsupportkit/support-sdk';

<SupportButton
  appName="Habitloop"                        // as registered in the dashboard
  apiKey={SUPPORT_API_KEY}                   // shown once at app creation
  supabaseUrl="https://<project-ref>.supabase.co"
  user={{
    name: 'Maya Okafor',
    plan: 'pro',                             // "free" | "trial" | "pro"
    revenuecatId: 'rc_anon_8f31bd2c',        // RevenueCat app user id
    appVersion: '2.4.1',
  }}
  theme="system"                             // default; "light" or "dark" pins it
  defaultLanguage="fr"                       // optional; pre-selects the language prompt
/>
```

Peer dependencies: `react`, `react-native`, `react-native-safe-area-context`. The bottom sheet is built on the core `Modal`/`Animated` APIs — no gesture-handler/reanimated native dependencies to install.

The launcher shows an unread badge (admin replies newer than the user's read receipt) and opens the support chat: one continuous conversation with a composer that is always open, up to 1,000 characters a message. A message shows in the chat the moment it's sent and the composer is free for the next one straight away; messages go out one at a time in the order written. One that can't go stays in place marked *Not sent · Tap to retry*, with the reason under the composer, and survives the sheet closing. Before the first message, the empty chat tells the user *We reply within 24 hours* — a promise your team has to keep.

### One chat, many conversations

The user sees a single chat. The dashboard still works in conversations it can resolve, so the two meet like this:

- A message goes to the user's open conversation (`send-message` picks the most recently active one), or starts a new `support` conversation when none is open — a first message, or the first after a resolve.
- A resolve shows in the chat as a divider; the composer stays open, and the next message starts the next conversation.
- Older conversations — including typed feedback, feature requests and bug reports from SDKs before 0.4 — appear in the same scroll, in time order.

`plan` is what the team filters and messages users by. With RevenueCat: `"trial"` when the active entitlement's `periodType` is `TRIAL`, `"pro"` when it is active otherwise, `"free"` without one. `isPaid` is still accepted (true reads as `"pro"`) but can't say `"trial"`.

The SDK reports the user (name, plan, app version) on every load through `register-user`, so the dashboard's Users tab lists paying and trial users before they ever open support, and it refreshes their push token then if notifications are already allowed — it never prompts outside the sheet. A free user is acknowledged but not stored, and their push token is only registered once they open support.

### Compatibility with SDKs before 0.4

Builds already in the App Store keep working unchanged: `submit-query`, `post-message` and the three request types are untouched for them. SDK 0.4 identifies itself with an `x-sdk-version` header; for callers without it, `get-threads` reports `support` conversations (from 0.4 chats, and conversations started from the dashboard) as `feedback`, the type older builds label as general. Users on older builds appear in the Users tab once they write to support, with PRO or Free from `isPaid`.

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
| `accentColor` | design-token cobalt | Brand color: a hex, or `{ light, dark }` for one per mode. The pressed shade, the 12% wash behind chips, a text-safe variant, and whichever of white or ink reads better on top are all derived from it. |
| `style` | — | Applied to the launcher: position it, add margins. `{ position: 'absolute', right: 20, bottom: 32 }` gives the usual corner FAB. |

The badge caps at `99+`, and pulses twice — not forever — when a new reply arrives.

The launcher's mark is the product logo — two overlapping speech bubbles, the same mark as the dashboard's. The gap between the bubbles is cut in the color behind it, so the `minimal` variant assumes the design-token app background (`#0A0A0B` dark, `#FAFAFA` light); on a noticeably different background, prefer `soft`.

### Light and dark mode

`theme` defaults to `"system"`: the sheet and launcher follow the host app's appearance — the device setting, or whatever the app pins with `userInterfaceStyle` — and switch live when it changes. Pass `"light"` or `"dark"` to pin one; the keyboard follows the pinned mode too.

A single `accentColor` has to work in both modes, so it is adjusted where it wouldn't: lightened in dark mode, darkened in light, only as far as it takes to read as a fill (3:1 against the sheet). A navy brand stays navy in light mode and lifts a little in dark; a yellow one turns mustard in light. To control both exactly, pass a pair — `accentColor={{ light: '#0F766E', dark: '#5EEAD4' }}` — and each is used as given.

Text never takes the fill color directly. Every text color, the accent's included, is held to WCAG AA (4.5:1) on both the sheet and the cards on it, in both modes. In dark mode the sheet is an elevated gray rather than the dashboard's near-black, with cards and bubbles a step lighter again, so the layering stays visible over a dimmed app.

### Unread and read receipts

The server counts unread as "admin messages newer than the user's read receipt", which is authoritative but always slightly behind the device. The SDK therefore keeps a per-thread watermark: the `created_at` of the newest reply the user has actually seen (a server timestamp, so the device clock is never part of the comparison). Displayed unread is the stricter of the two counts, which is right in both directions — read here but the receipt hasn't landed yet, or read on another device.

That carries three rules worth knowing when reading `useSupportThreads.ts`:

- Responses apply in issue order, so a slow poll can't overwrite a newer one.
- `get-unread-count` returns a bare number that can't be reconciled against local reads, so its answer is dropped if a read happened while it was in flight, and it is skipped entirely while any receipt is unconfirmed — the full payload is polled instead, because that one *can* be reconciled.
- Failed `mark-read` calls are retried with backoff rather than swallowed; until one lands, the watermark holds the UI correct.

Replies that arrive while the chat is on screen are marked read on arrival, so the badge never climbs while the user is reading. Nothing is marked read while the first-run language prompt covers the chat.

The chat's *New* divider is fixed as the sheet opens, from the badge the user tapped, before anything is marked read. It is a timestamp rather than a count, so replies arriving while the user reads join the block below it instead of pushing it down.

### Refresh cadence

Polling adapts to what the user is looking at, so latency is low where it's felt and cheap where it isn't:

| Context | Interval | Endpoint |
| --- | --- | --- |
| Chat on screen | 5s | `get-threads` |
| Sheet open (language picker) | 15s | `get-threads` |
| Sheet closed (idle) | `pollIntervalMs`, default 10s | `get-unread-count` (~18 bytes) |
| Sheet closed, count moved | right after that tick | `get-threads`, so the chat opens with the new replies already loaded |
| Sheet closed, receipt unconfirmed | as above | `get-threads` (until the receipt lands) |
| Support push arrives, app open | immediately | `get-threads` |

It also refreshes on mount, whenever the sheet opens, and whenever the app returns to the foreground. Polling skips its ticks while the app is in the background — nobody can see the badge there, and the foreground refresh catches up. Set `pollIntervalMs={0}` to disable idle polling; the event-driven refreshes above still happen.

### Push notifications (optional)

`expo-notifications` is an **optional** peer dependency. Install it and the SDK asks for notification permission the first time the support sheet opens, then registers an Expo push token so admin replies arrive as notifications:

```sh
npx expo install expo-notifications
```

Skip it and everything else works unchanged — the SDK detects its absence at runtime and never calls it. **A user who denies permission keeps full use of every feature**; the outcome is recorded only so the dashboard can show whether they're reachable, displayed on the thread panel as *Push on* / *Push denied* / *Push not asked*.

A support reply that arrives while the app is open refreshes the badge at once rather than on the next poll. Tapping a support-reply notification opens the sheet straight into that thread — from the background or a cold start, no host code needed. If the launcher isn't mounted when the tap arrives (it lives behind sign-in, or on a settings screen), the thread opens when it mounts, provided that's within a minute; after that the tap is dropped rather than popping the sheet open unprompted later. With several launchers mounted, the most recently mounted one takes it.

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
- **Review receipts**: a message's `review_opened_at` is written only by `review-opened` (service role), scoped to the app and `revenuecat_id` that own the request; admins can send review requests but can't set the receipt.
- **Deletes**: admins can delete whole conversations — each goes with its messages, read receipts and escalation records (`ON DELETE CASCADE`), and disappears from the user's chat too. Individual messages can't be deleted or edited by anyone through the API. Message templates are the only other thing admins can delete.
- **Char limits**: messages 1–1000 characters — enforced in the clients, in the Edge Functions, and by a CHECK constraint. SDKs before 0.4 still hold users to 10–300 on the device.
- **Push status**: `push_subscriptions` is written only by the `register-push` function (service role) and readable only by admins. `send-push` is the single staff-facing function — it requires an admin JWT, not an API key, and verifies membership in `admins` before sending.
- **Rate limits**: the write endpoints enforce Postgres-backed fixed windows — per user, 5 new conversations and 30 messages per hour; per app, 500 writes per hour (blast-radius cap if a key leaks). `register-user` runs on every launch, so it has its own per-user cap (60/hour) and doesn't count against the app's. Blocked requests get a 429 with `Retry-After`; the SDK shows "Too many requests — try again later" inline. Limits live in `supabase/functions/_shared/rate-limit.ts`.
