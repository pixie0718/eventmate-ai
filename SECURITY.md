# Security policy

## Reporting a vulnerability
Please open a private security advisory on the GitHub repository (Security tab, "Report a vulnerability")
instead of a public issue. Include the steps to reproduce and the affected file or endpoint.

## What is already covered
- The AI provider key lives only in server-side environment variables and is never sent to the browser.
- Strict Content-Security-Policy plus security headers on every response (see `api/handlers.js`).
- All user and AI text is rendered with `textContent`; a test fails the build if a dangerous DOM sink is added.
- Inputs are validated on the client and again on the server; AI output is schema-validated before it is shown.
- API endpoints accept JSON only, limit the body to 10 KB, apply a per-client cooldown with `Retry-After`, and time out upstream calls.
- The app has no runtime dependencies. `npm audit --omit=dev` runs in CI and must stay clean.

## Known limits
The cooldown is kept in memory per process. Before exposing the AI endpoints to heavy public traffic, add a shared rate limiter or authentication.
