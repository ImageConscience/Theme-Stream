# Follow-up Technical Tasks

These items are outside the scope of the current deployment but worth capturing for future sprints.

- **Break down `app/services/theme-stream.server.js`.** (partially done)
  - ✅ Extracted metaobject fetch/migrate helpers into `app/services/theme-stream-data.server.js`.
  - ✅ Extracted staged upload flow into `app/services/theme-stream-upload.server.js`.
  - Remaining: add unit tests around the staged upload flow.
- **Add automated tests.**
  - Unit-test `getManagedBillingStatus` / `resolvePlanFromSubscriptionName` with mocked `billing.check` responses.
  - Add an integration test that covers loader/action happy paths (e.g., using React Router’s data APIs or Playwright component tests).
- **Improve observability.**
  - Replace ad-hoc debug logging with a structured logger (e.g., pino) backed by an env-driven log level.
  - Forward webhook execution metrics to a dashboard (duration, success/failure).
- **Theme extension hardening.**
  - Consider adding visual regression tests (Storybook/Chromatic) for the Theme Stream block.
  - ✅ Documented recommended image sizes and responsive behaviour in `extensions/theme-stream/README.md`.
- **Deployment hygiene.**
  - Automate the Railway deploy (GitHub Actions) with lint/build/test steps.
  - Track required env vars/secrets in a single `.env.example` file for onboarding.
