# Contributing

Issues with a concrete reproduction, browser version, and expected behavior are useful. Use synthetic examples only; never attach customer information, internal exports, credentials, or real call recordings.

## Development

Use Node.js 24.16 or newer, then `npm ci` and `npm run dev`. Vite serves the interface at `http://127.0.0.1:4317/` and proxies API requests to the loopback service on port 4318. `npm run build` creates the local frontend and portable HTML demo.

Run `npm run format:check`, `npm run build`, `npm test`, and `npm run test:ui` before submitting functional changes. Linux needs `npx playwright install --with-deps chromium`; Windows uses Edge unless `DWC_BROWSER_CHANNEL` is set. Browser tests use their own service on port 4320 and a separate synthetic database under `.data/`.

## Keep the demo useful

- Keep all fixtures synthetic and repeatable. Update the independent expected results when deliberately changing a scenario.
- Keep shared validation and reporting in the domain/application layers so the memory and HTTP modes agree.
- A save confirmation must reflect an acknowledged result. Preserve the command envelope when a response is uncertain.
- Verify relevant interactions with a keyboard and at mobile widths. Tour controls and help must remain reachable inside dialogs.
- Keep the portable demo self-contained. It must not import the server or HTTP client, fetch external assets, or require browser storage.

After UI changes, run `npm run screenshots` and inspect the three images in `docs/images/`. They capture the real portable demo. Browser test evidence under `reviews/` and `test-results/` is generated and ignored.

## Publishing

The current demo uses GitHub Pages' branch publishing: `gh-pages`, root directory. Build and run the checks before updating that branch with the contents of `demo/dist/` and an empty `.nojekyll` file. Never publish the server's `dist/` directory; that frontend requires the local API.

To automate publishing, copy `docs/ci-workflow.yml.example` to `.github/workflows/ci.yml` using a GitHub credential with workflow permission, then change the Pages source to GitHub Actions. The template runs checks on pull requests and deploys the portable build after successful checks on `main`. Until enabled, tests are run locally and Pages' built-in deployment does not run the application's test suite.

A release can attach `demo/dist/index.html` as `dwc-call-manager-demo.html` for offline use. Its hash and size are recorded in `demo/dist/build-info.json`.
