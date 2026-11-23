# Project memory

## Product intent & audience

- App name/context: "P6 Project Controls Automation" (likely Primavera P6–related project controls tool).
- Home screen displays a **project list** fetched from Supabase.
- Audience inferred to be project managers / project controls professionals.

## Brand personality & voice

- User-facing error messaging is friendly and plain-language ("Can't reach the database" with Retry button).
- No broader brand voice details inferred yet.

## Visual design & UX direction

- Home view renders a list of projects as the primary landing content.
- Graceful degradation pattern: on backend failure, show a friendly error screen with a **Retry** button instead of a blank page or stack trace.
- A connection-status banner/flag was added to the home view to surface database reachability issues.
- No specific color, typography, or component library details inferred yet.

## Decisions, constraints & rationale

- **Framework:** Vite + React.
- **Backend:** Supabase (client created at app startup; URL + anon key read from env).
- **Env files:** `.env` and `.env.lite` both exist. Project is *linked* to the Supabase project referenced in `.env.lite` (project ref begins `yfejvdsph…`, named "P6 Project Controls Automation"). `.env` previously pointed at an older, different database — corrected to match `.env.lite`.
- **Resilience hardening:** Supabase client now guards against missing/invalid URL so the app never white-screens; home data fetch fails gracefully.
- Build verified passing after changes.

## Open questions & assumptions

- Why two env files (`.env` vs `.env.lite`) exist and which the running preview actually loads is uncertain — may need consolidation or documentation.
- Full feature set beyond the project list is unknown.
- No `.bolt/prompt` file present; no explicit global instructions or brand/design constraints have been provided by the user.