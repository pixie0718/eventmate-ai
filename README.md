# EventMate AI

A frontend-only planning assistant for **weddings, birthdays and community events**. Enter the basics and get a budget split, a dated timeline, a vendor checklist and personalised ideas. There is **no backend**: everything runs in the browser, and an optional Claude step adds extra ideas.

## Chosen vertical
Event planning with three personas: a **wedding couple**, a **birthday host** and a **community organiser**. Each persona has its own budget template, timeline, vendor list and idea pool.

## Run it
ES modules need `http://`, not `file://`:

```bash
npm start          # python -m http.server 8080  -> open http://localhost:8080
npm test           # Node 20+ built-in test runner, zero dependencies
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

**Optional AI step (`js/ai.js`)**: the user pastes their own Anthropic key; the browser calls the Messages API (`claude-sonnet-5-5`) directly and the reply is validated against a strict schema (max items, max lengths, plain strings only).

## Security
- No backend, no accounts, no analytics, no third-party scripts.
- Strict **Content-Security-Policy**: `default-src 'none'`, scripts/styles only from `'self'`, network only to `https://api.anthropic.com`. No inline scripts, handlers or styles.
- All user and AI text is rendered with `textContent`; `innerHTML` and friends are never used (enforced by a test).
- Inputs are validated and sanitised (type, range, enum, length, control characters).
- API key: password field, validated format, **kept in memory only**, never saved, logged or put in a URL; error messages never echo it. Requests have a 30 s timeout and a 3 s client-side cooldown.
- Prompt-injection hardening: free-text notes are fenced as untrusted data and the model output is schema-validated before display.
- Only non-sensitive form data and checklist ticks are stored in `localStorage`.
- Caveat: a browser-side key is visible to anyone using that browser, so use a key with a spending limit. A production app should proxy the call through a server.

## Accessibility
Skip link, labelled controls, `aria-invalid` + `role="alert"` errors with focus on the first bad field, programmatic focus on results, `aria-live` status messages, real `<table>` and checkbox lists (chart bars are decorative), 44 px touch targets, visible focus, light/dark themes, reduced-motion support and a print stylesheet.

## Testing
`tests/` (33 tests): budget invariants across all types/preferences, timeline compression and ordering, context-driven vendors/ideas, determinism, input validation edge cases, AI prompt/response parsing, error mapping, timeouts, and static security/accessibility guards (CSP, no inline code, no dangerous sinks, labels). CI runs them on every push.

## Structure
```
index.html        page + CSP
css/styles.css
js/validate.js    input validation & sanitising (pure)
js/planner.js     budget / timeline / vendors / ideas engine (pure)
js/ai.js          optional Claude call + response validation
js/app.js         DOM wiring
tests/            node:test suites
```

## Assumptions
- Per-guest baselines (INR 1500 wedding, 600 birthday, 250 community) and currency rates are rough, fixed approximations used only for warnings; costs vary a lot by city.
- Budget percentages are common rules of thumb, not quotes.
- Dates are local calendar dates; the event must be within the next 3 years.
- Plans are estimates, not professional advice.

## License
MIT
