# Anivio website

React + TypeScript frontend, statically hosted, connected to the same Supabase project as the app. No service-role key belongs in the frontend.

```powershell
cd website
npm ci
# Copy .env.example to .env.local and set the app's public URL and anon/publishable key.
npm run dev
npm test
npm run build
```

The dev server binds to `127.0.0.1:5173`. Production output is `dist/`. All public and authentication routes have real `index.html` files, so deep links work on static hosts. An SPA fallback can additionally point unknown routes to `index.html`.

## Account features

- Email sign-in, signup, recovery, email changes, session management, and account deletion.
- Six profiles, custom avatar/banner URLs, colours, shared primary sources, and PIN setting.
- Addon/plugin install, enable/disable, remove, drag reorder, and keyboard-accessible ordering controls.
- Collections, saved library, watch progress, and watched items.
- Exact-ID anime titles and artwork in activity pages, with matching library metadata reused. Metadata enrichment never changes synced content/episode IDs.
- Account-scoped profile selection remembered across dashboard, artwork, and collection pages; the active profile appears in the header and overview.
- Synced mobile preferences generated from the actual Android storage keys, including reader and enhancement options. Preference updates preserve unknown fields and reject stale revisions.
- Provider credentials compatible with `ProviderCredentialCrypto.android.kt`; credentials stay masked and are excluded from backups.
- Jellyfin/Emby server sign-in and library selection. Direct server playback is a separate native module not present in this Android branch.
- Export/restore and versioned GitHub release news.
- Manual Supporter / Supporter Plus grants, optional expiration, removal, and an audit log. Only explicitly bootstrapped, email-confirmed administrators can grant status. No payment processing.

## Backend setup

Apply repository migrations in order. `0008_web_dashboard.sql` adds missing source/collection/credential contracts, optimistic settings writes, and device session listing/revocation. `0009_manual_supporters.sql` provides the app's existing `get_my_member_access` and `get_my_membership_overview` contracts. `0010_media_servers.sql` stores account-scoped server connections. `0011_community_collections.sql` adds moderated publications and profile imports. `0012_device_link.sql` adds expiring, single-use device approvals, protected by a device secret and nonce.

Owner bootstrap is an explicit operation in the Supabase SQL console, replacing the example email below with the intended verified owner. Never grant access based on editable `user_metadata`.

```sql
insert into public.anivio_admins(user_id)
select id from auth.users
where lower(email) = lower('your-verified-owner-email@example.com')
  and email_confirmed_at is not null
on conflict(user_id) do nothing;
```

Add these exact callback paths for your website origin under Supabase Authentication → URL Configuration:

- `https://your-domain/account`
- `https://your-domain/account/recovery`

Deploy both implementations in `supabase/functions/`: `delete-account` and `tv-logins-exchange`. Disable the legacy gateway JWT check for these functions: account deletion verifies the caller with Auth itself; device exchange verifies the approved secret and nonce through a service-only database function. Both use Supabase's server-provided environment variables. Never expose the service-role key in website configuration.

For a public production domain, set the Actions variable `ANIVIO_DEVICE_LINK_URL` to `https://your-domain/link`. To force the same approval URL for existing app builds, insert that URL into `anivio_web_config` with key `device_link_url`. Keep this unset while the Site preview has owner-only access. Account sign-in redirects must use the final domain too.

`public/config.js` contains only the app's public Supabase URL and anon key. Build-time `.env.local` variables override it; the checked-in public configuration lets source builds run without privileged credentials.

Do not copy Nuvio's production keys, account sessions, memberships, or payment endpoints. This website operates on Anivio's backend only. Nuvio's TV-specific preferences and native TV clients are outside the current Android branch.

## Updating settings controls

Run `python scripts/generate-web-settings.py` from the repository root after adding Android sync keys. Handwritten labels, enum options, and JSON-encoded reader preferences live in `src/settings-schema.ts`. Run website tests/build afterward.

## Settings persistence and refresh

The website reads and writes the app's `profile_settings_blobs` row for the selected profile and `platform=mobile`; it does not keep a separate website copy. Typed preference wrappers and JSON-encoded reader payloads match Android's import/export formats. Press **Save changes** to upload edits. Concurrent edits are rejected by revision checks, and existing unrelated fields are preserved.

The website checks for app-side updates every 30 seconds while visible and when focused, unless there are unsaved edits. **Reload** explicitly fetches the latest stored settings. The app uploads observed changes after a 1.5-second debounce and applies remote settings when its profile synchronisation runs (for example after sign-in/profile selection). Reader settings now participate in that upload observation too and are stored separately for each profile; legacy shared preferences are retained for profile 1. Those reader fixes require an updated native app build. This is online sync, not a guarantee of instantaneous changes on an offline or inactive phone.

Device permissions, downloaded files, incognito state, browser light/dark appearance, and the currently selected profile remain local. Use the same account and matching profile number to share supported app preferences. The website's light/dark switch changes the website only; the Theme setting in App Settings changes the synced app theme.

## Hosting

The checked-in `.openai/hosting.json` identifies the private Sites preview. For another static host, publish `dist/` and configure the two public build variables in `.env.example`. The preview's audience stays private until the owner chooses to publish publicly or connect a domain.

App and website source are licensed under the repository's GNU GPLv3 licence. Nuvio is credited on the site and in the app. Artwork in the app preview belongs to its respective owners.
