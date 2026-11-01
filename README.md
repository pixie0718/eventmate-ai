# EventMate AI

**Live demo:** https://adorable-douhua-11ee23.netlify.app/

A browser-based planning assistant for **weddings, birthdays and community events**. Enter the basics and get a budget split, a dated timeline, a vendor checklist and personalised ideas. The plan itself runs entirely in the browser; a tiny server-side function (Node locally, a Netlify Function in production) only proxies the optional AI step (DeepSeek) so the key stays server-side.

## Chosen vertical
**Celebration & Event Planner.** A GenAI-powered assistant that helps people organise weddings, birthdays and community events with budgets, timelines, vendor checklists and personalised ideas.

| Persona | Core need | What changes in the plan |
|---|---|---|
| A **wedding couple** | Long lead times, many vendors, a big budget to protect | 365-day timeline, 8 budget lines, officiant, attire and decor vendors |
| A **birthday host** | A short runway and a tight budget; fun over formality | 60-day timeline, cake and entertainment lines, kids and games ideas |
| A **community organiser** | Permits, safety and volunteers on a small budget | 90-day timeline, permits, first aid, AV and outreach vendors |

## Problem-statement alignment
| Challenge expectation | How EventMate AI meets it |
|---|---|
| Smart, dynamic assistant | Form → rule engine → optional AI personalisation and a Q&A chat, all driven by the user's own context |
| Logical decision making from user context | Event type, days left, budget per guest, kids/elders/outdoor/tech preferences and guest count each change the budget split, deadlines, vendors and ideas; tight schedules compress every deadline |
| Practical, real-world usability | Real currencies, realistic lead times, a ticked checklist that is remembered, print/PDF and JSON export, works without AI |
| Clean, maintainable code | Small pure modules, data separated from logic, JSDoc types checked by `tsc`, ESLint, 93 tests with about 99% line coverage |
| Security | Key only on the server, strict CSP, validated input and AI output, prompt-injection fencing, rate limiting |
| Accessibility | Axe-audited, WCAG AA contrast tests, labelled controls, keyboard and screen-reader friendly |

## Run it
ES modules need `http://`, not `file://`. `server.js` (no runtime dependencies; ESLint and TypeScript are dev-only) serves the app and proxies the optional AI step to DeepSeek:

```bash
cp .env.example .env   # then put your DEEPSEEK_API_KEY in it
npm start          # node server.js  -> open http://localhost:8080
npm test           # Node 20+ built-in test runner
npm run lint       # ESLint
npm run typecheck  # JSDoc types checked with tsc (no build step)
npm run check      # all three
npm run build      # dist/ for Netlify
```
It also deploys as-is to GitHub Pages (static files only).

## Approach and logic
The decision engine is deterministic, lives in `js/planner.js` (one module per part in `js/planner/`) and works offline.

| Context given by the user | What the plan does |
|---|---|
| Event type | Picks the budget template, timeline length (wedding 365 d, birthday 60 d, community 90 d) and vendor list |
| Days until the event | If fewer than the ideal, every deadline is compressed proportionally, never set in the past, and a "tight schedule" notice is shown |
| Budget ÷ guests | Compared with a typical per-guest baseline; warns when tight or very tight |
| Kids / low-key / outdoor / tech | Shifts budget points (e.g. kids: food → entertainment, outdoor: venue → contingency buffer) |
| Outdoor, 150+ guests, elders, kids, vegetarian, tech | Adds relevant vendors (tent, generator, marshals, accessibility, live-stream...) and milestones |
| Style + preferences | Ranks the idea pool; ideas that need a preference are hidden unless it is ticked; `{name}` and `{city}` personalise the text |

Budget amounts use largest-remainder rounding, so the lines **always add up exactly** to the total. A contingency buffer is always kept.

**AI layer**: see the next section.

## What the AI does and what the code decides
The assistant is **GenAI-powered, but rules stay in charge**.

| Code decides (deterministic, tested) | AI adds (text only, validated) |
|---|---|
| Budget lines and totals (they always add up exactly) | Budget tips for this specific event |
| Every date, deadline and the "tight schedule" compression | Timeline notes (e.g. peak-season booking advice) |
| Which vendors are needed and their book-by dates | Extra event-specific vendor tasks |
| Ranking of the built-in ideas | More ideas and general tips |
| Input validation and all warnings | Answers to questions about the plan (chat) |

How it works:
- **Personalise:** after "Create my plan", the server builds the prompt from the *validated* plan plus the user's free-text notes ("vegan menu, hill-station venue") and asks DeepSeek. The reply must match a strict schema (max items and lengths, plain strings); anything else is dropped. The result appears inside the Budget, Timeline and Vendor sections, marked with ✨.
- **Chat:** "Ask about your plan" sends one question plus the plan's real figures, so answers like "cut 10%" are based on the calculated budget. The answer is capped at 1200 characters and rendered as plain text.
- **Numbers are never taken from the AI.** The prompt says the app already calculated them, and nothing the AI returns is ever used to compute a total or a date.
- **Fallback:** if there is no key, or the AI fails or times out, the full rule-based plan is already on screen. The page says clearly that AI is off, and the AI buttons are disabled. `/api/status` tells the browser whether a key exists (never the key itself).
- **Prompt-injection hardening:** notes and questions are fenced as untrusted data, and control characters and fake closing tags are stripped.

## Deploy (Netlify)
The repo is ready for Netlify (`netlify.toml`): the build copies only `index.html`, `css/` and `js/` into `dist/`, and one Netlify Function (`netlify/functions/api.js`) serves `/api/status`, `/api/personalize` and `/api/chat`.
1. Import the repo in Netlify (build settings are read from `netlify.toml`).
2. Under *Site configuration → Environment variables* add `DEEPSEEK_API_KEY` (and optionally `DEEPSEEK_MODEL`, default `deepseek-chat`).
3. Make sure *Site protection* (password / login) is off, so visitors can open the site.
4. Redeploy. Open `/api/status`: it should answer `{"ai":true}`.

Netlify's free plan stops a function after about 10 s, so the function gives DeepSeek 8.5 s and then returns a clean `504`. The prompts are kept short (personalise about 4 s, chat about 2 s in testing), and if the AI is slow or off the page still shows the complete rule-based plan.

## Security
- The server sends security headers on every response: the CSP (also in the page), `X-Frame-Options: DENY`, `frame-ancestors 'none'`, `nosniff`, `Referrer-Policy: no-referrer` and a restrictive `Permissions-Policy`. API answers are `no-store`.
- No accounts, no analytics, no third-party scripts. The only server code is `server.js` (static files + AI proxy).
- Strict **Content-Security-Policy**: `default-src 'none'`, scripts/styles only from `'self'`, network only to its own origin (`connect-src 'self'`). No inline scripts, handlers or styles.
- All user and AI text is rendered with `textContent`; `innerHTML` and friends are never used (enforced by a test).
- Inputs are validated and sanitised (type, range, enum, length, control characters).
- API key: lives only in the server's `.env` (git-ignored), never sent to the browser. The server re-validates input, sets the prompt itself (so it is not an open relay), and applies a 3 s per-client cooldown per endpoint (answered with `429` and `Retry-After`; the tracking table is size-capped), a 10 KB body limit and a 30 s upstream timeout.
- POST endpoints only accept `Content-Type: application/json` (`415` otherwise). A plain cross-site form cannot send that type, so other websites cannot use this server to spend the AI quota.
- Prompt-injection hardening: free-text notes are fenced as untrusted data and the model output is schema-validated before display.
- Only non-sensitive form data and checklist ticks are stored in `localStorage`.
- Caveat: the in-memory rate limit is per process; add real rate limiting/auth before exposing it publicly.
- Static files are served with an `ETag` (304 on reload) and gzip.

## Accessibility
Axe audit and contrast tests run in CI. Skip link, labelled controls, `aria-invalid` + `role="alert"` errors with focus on the first bad field, programmatic focus on results, `aria-live` status messages, real `<table>` and checkbox lists (chart bars are decorative), 44 px touch targets, visible focus, light/dark themes, reduced-motion support and a print stylesheet.

## Testing
`tests/` (93 tests, about 99% line coverage via `npm run test:coverage`): template-data integrity (every budget adds up to 100%, every vendor maps to a budget line), budget invariants across all types/preferences, timeline compression and ordering, context-driven vendors/ideas, determinism, input validation edge cases, AI prompts and response parsing, personalisation and chat requests, error mapping, timeouts, the AI-status fallback, the server and the Netlify function (static allow-list, key stays server-side, validation, JSON-only posts, cooldown and `Retry-After`, timeouts, `.env` loading, build output), storage failures, browser-level UI tests (the real page and `app.js` in jsdom: validation, rendering, ticking tasks, AI boxes, chat, download, restoring a saved event, failure fallback), an axe accessibility audit of the rendered page, WCAG AA colour-contrast maths for both themes, and static security guards (CSP, no inline code, no dangerous sinks, labels). CI runs them on every push.

## How the solution works
1. The user fills in one form: event type, name, date, guests, budget, currency, city, style and preferences.
2. `validate.js` checks and sanitises every field, and shows accessible inline errors.
3. `planner.js` turns the validated input into a plan (`js/planner/` builds each part): budget lines, dated milestones, vendors with book-by dates and ranked ideas.
4. `ui/render.js` draws the plan (summary, donut chart, tables, timeline rail, checklists). Ticks are saved in `localStorage`.
5. Optionally, "Get AI ideas" posts the event to `/api/personalize`; the server asks DeepSeek and the schema-validated reply is shown.
6. The plan can be printed or downloaded as JSON.

## Structure
```
index.html          page + CSP
css/styles.css
server.js           local / Node host: static files + the API
api/handlers.js     the API logic shared by server.js and Netlify (key, JSON-only, validation, rate limit, DeepSeek call)
netlify/functions/  Netlify Function wrapper around api/handlers.js
scripts/            build-static.js (publishes only the browser files to dist/)
netlify.toml        Netlify build, function and security headers
js/app.js           entry point: state and wiring
js/dates.js         calendar-date helpers (pure)
js/validate.js      input validation & sanitising (pure)
js/planner.js       puts the plan together (pure)
js/planner/         budget.js, timeline.js, vendors.js, ideas.js and shared rules (pure)
js/data/            budget, timeline, vendor and idea templates (data only)
js/chart.js         donut chart geometry (pure)
js/ai/              prompts.js (prompt building), parse.js (response validation), client.js (requests to our API)
js/types.js         shared JSDoc types
js/ui/              dom helpers, storage, form, rendering, AI panel
tests/              node:test suites
SECURITY.md         how to report a vulnerability and what is already covered
```

## Assumptions
- Per-guest baselines (INR 1500 wedding, 600 birthday, 250 community) and currency rates are rough, fixed approximations used only for warnings; costs vary a lot by city.
- Budget percentages are common rules of thumb, not quotes.
- Dates are local calendar dates; the event must be within the next 3 years.
- Plans are estimates, not professional advice.

## License
MIT
