# EventMate AI

A frontend-only planning assistant for **weddings, birthdays and community events**. Enter the basics and get a budget split, a dated timeline, a vendor checklist and personalised ideas. The plan itself runs entirely in the browser; a tiny Node server only proxies the optional AI step (DeepSeek) so the key stays server-side.

## Chosen vertical
Event planning with three personas: a **wedding couple**, a **birthday host** and a **community organiser**. Each persona has its own budget template, timeline, vendor list and idea pool.

## Run it
ES modules need `http://`, not `file://`. `server.js` (no runtime dependencies; ESLint and TypeScript are dev-only) serves the app and proxies the optional AI step to DeepSeek:

```bash
cp .env.example .env   # then put your DEEPSEEK_API_KEY in it
npm start          # node server.js  -> open http://localhost:8080
npm test           # Node 20+ built-in test runner
npm run lint       # ESLint
npm run typecheck  # JSDoc types checked with tsc (no build step)
npm run check      # all three
```
It also deploys as-is to GitHub Pages (static files only).

## Approach and logic
The decision engine is deterministic, lives in `js/planner.js` and works offline.

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

## Security
- The server sends security headers on every response: the CSP (also in the page), `X-Frame-Options: DENY`, `frame-ancestors 'none'`, `nosniff`, `Referrer-Policy: no-referrer` and a restrictive `Permissions-Policy`. API answers are `no-store`.
- No accounts, no analytics, no third-party scripts. The only server code is `server.js` (static files + AI proxy).
- Strict **Content-Security-Policy**: `default-src 'none'`, scripts/styles only from `'self'`, network only to its own origin (`connect-src 'self'`). No inline scripts, handlers or styles.
- All user and AI text is rendered with `textContent`; `innerHTML` and friends are never used (enforced by a test).
- Inputs are validated and sanitised (type, range, enum, length, control characters).
- API key: lives only in the server's `.env` (git-ignored), never sent to the browser. The server re-validates input, sets the prompt itself (so it is not an open relay), and applies a 3 s per-client cooldown per endpoint (the tracking table is size-capped) and a 30 s upstream timeout.
- Prompt-injection hardening: free-text notes are fenced as untrusted data and the model output is schema-validated before display.
- Only non-sensitive form data and checklist ticks are stored in `localStorage`.
- Caveat: the in-memory rate limit is per process; add real rate limiting/auth before exposing it publicly.
- Static files are served with an `ETag` (304 on reload) and gzip.

## Accessibility
Axe audit and contrast tests run in CI. Skip link, labelled controls, `aria-invalid` + `role="alert"` errors with focus on the first bad field, programmatic focus on results, `aria-live` status messages, real `<table>` and checkbox lists (chart bars are decorative), 44 px touch targets, visible focus, light/dark themes, reduced-motion support and a print stylesheet.

## Testing
`tests/` (62 tests, about 97% line coverage via `npm run test:coverage`): budget invariants across all types/preferences, timeline compression and ordering, context-driven vendors/ideas, determinism, input validation edge cases, AI prompts and response parsing, personalisation and chat requests, error mapping, timeouts, the AI-status fallback, the server (static allow-list, key stays server-side, validation, cooldown), browser-level UI tests (the real page and `app.js` in jsdom: validation, rendering, ticking tasks, AI boxes, chat, failure fallback), an axe accessibility audit of the rendered page, WCAG AA colour-contrast maths for both themes, and static security guards (CSP, no inline code, no dangerous sinks, labels). CI runs them on every push.

## How the solution works
1. The user fills in one form: event type, name, date, guests, budget, currency, city, style and preferences.
2. `validate.js` checks and sanitises every field, and shows accessible inline errors.
3. `planner.js` turns the validated input into a plan: budget lines, dated milestones, vendors with book-by dates and ranked ideas.
4. `ui/render.js` draws the plan (summary, donut chart, tables, timeline rail, checklists). Ticks are saved in `localStorage`.
5. Optionally, "Get AI ideas" posts the event to `/api/ideas`; the server asks DeepSeek and the schema-validated reply is shown.
6. The plan can be printed or downloaded as JSON.

## Structure
```
index.html          page + CSP
css/styles.css
server.js           static files + AI proxy (holds the key)
js/app.js           entry point: state and wiring
js/dates.js         calendar-date helpers (pure)
js/validate.js      input validation & sanitising (pure)
js/planner.js       budget / timeline / vendors / ideas engine (pure)
js/data/            budget, timeline, vendor and idea templates (data only)
js/chart.js         donut chart geometry (pure)
js/ai.js            prompts, AI client, response validation
js/types.js         shared JSDoc types
js/ui/              dom helpers, storage, form, rendering, AI panel
tests/              node:test suites
```

## Assumptions
- Per-guest baselines (INR 1500 wedding, 600 birthday, 250 community) and currency rates are rough, fixed approximations used only for warnings; costs vary a lot by city.
- Budget percentages are common rules of thumb, not quotes.
- Dates are local calendar dates; the event must be within the next 3 years.
- Plans are estimates, not professional advice.

## License
MIT
