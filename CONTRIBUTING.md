# Contributing

Issues with a concrete reproduction, browser version, and expected behavior are useful. Use synthetic examples only; never attach customer information, internal exports, credentials, or real call recordings.

## Development

Use Node.js 24.16 or newer, then `npm ci` and `npm run dev`. Vite serves the interface at `http://127.0.0.1:4317/` and proxies API requests to the loopback service on port 4318. `npm run build` creates the local frontend and portable HTML demo.

Run `npm run format:check`, `npm run build`, `npm test`, and `npm run test:ui` before submitting functional changes. Linux needs `npx playwright install --with-deps chromium`; Windows uses Edge unless `DWC_BROWSER_CHANNEL` is set. Browser tests use their own service on port 4320 and a separate synthetic database under `.data/`.

Commit both generated files in `demo/dist/` whenever rebuilding changes them. CI rebuilds and runs `git diff --exit-code -- demo/dist/index.html demo/dist/build-info.json`, so source changes cannot silently leave the committed portable demo or its hash stale. Existing GitHub release attachments are separate and are not updated by this check or the Pages deployment.

## Keep the demo useful

- Keep all fixtures synthetic and repeatable. Update the independent expected results when deliberately changing a scenario.
- Keep shared validation and reporting in the domain/application layers so the memory and HTTP modes agree.
- A save confirmation must reflect an acknowledged result. Preserve the command envelope when a response is uncertain.
- Verify relevant interactions with a keyboard and at mobile widths. Tour controls and help must remain reachable inside dialogs.
- Keep the portable demo self-contained. It must not import the server or HTTP client, fetch external assets, or require browser storage.

After UI changes, run `npm run screenshots` and inspect the three images in `docs/images/`. They capture the real portable demo. Browser test evidence under `reviews/` and `test-results/` is generated and ignored.

## Publishing

GitHub Pages uses **GitHub Actions** as its publishing source. The active [Checks and demo workflow](.github/workflows/ci.yml) runs formatting, build, generated-demo freshness, 16 engine/API tests, and 26 Chromium browser tests on pull requests and pushes to `main`. It uploads browser evidence even if a check fails. Only a successful check job on `main` can deploy the `demo/dist/` artifact; pull requests do not deploy. Never publish the server's `dist/` directory; that frontend requires the local API.

Push the updated source and generated demo files to `main`, then verify both `check` and `deploy` in the [Actions run](https://github.com/Ademord/dwc-call-manager/actions/workflows/ci.yml). The workflow can also be dispatched manually on `main` to repeat checks and deployment without changing files. The old `gh-pages` branch is retained for history and is no longer the publishing source. No deployment credentials are stored in the repository: the deploy job uses GitHub's scoped Pages and OIDC permissions.

After a changed demo build passes CI, create a new versioned GitHub release targeting that tested `main` commit. Upload `demo/dist/index.html` under the asset filename `dwc-call-manager-demo.html` and attach its matching `demo/dist/build-info.json`. Mark the release as the latest stable release so the README's offline download link points to it. Download the published HTML and verify its SHA-256 and byte size against the attached metadata before announcing the release.

Pages follows successful `main` builds; the offline download follows the latest stable release. Publishing Pages alone does not update the offline download. If an existing release attachment needs a correction, replace the HTML and its matching build-info together and document the correction in that release's notes. The CI activation changes no application code, so the existing v0.2.0 attachments remain unchanged.
