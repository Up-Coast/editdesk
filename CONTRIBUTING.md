# Contributing

## Set up

1. Install [Node.js](https://nodejs.org) 20.19 or newer.
2. Clone the repository and install its dependencies:

   ```bash
   git clone https://github.com/Up-Coast/editdesk.git
   ```

   ```bash
   npm install
   ```

3. Install the browser the tests use:

   ```bash
   npx playwright install chromium
   ```

4. Turn on the pre-push hook:

   ```bash
   git config core.hooksPath .githooks
   ```

5. Run Editdesk from the clone:

   ```bash
   node bin/editdesk.js tests/fixtures/site
   ```

   Edits change the fixture files. Put them back with `git checkout tests/fixtures`.

## Checks

```bash
npm run check
```

This runs the linter, the formatter in check mode, the type check, the unit tests and the browser tests. The pre-push hook runs the same script, `scripts/check.sh`, and refuses the push when it fails. A push that changes only documents skips it. There is no hosted CI.

| Command                | What it runs                                          |
| ---------------------- | ----------------------------------------------------- |
| `npm test`             | Unit tests, in `tests/unit/`, with Node's test runner |
| `npm run test:browser` | Browser tests, in `tests/browser/`, with Playwright   |
| `npm run lint`         | ESLint                                                |
| `npm run format`       | Prettier, rewriting files                             |
| `npm run typecheck`    | TypeScript, reading the JSDoc types                   |

## What a change includes

- A test that fails without the change. Each test name starts with `criterion:` and states the behaviour it proves
- A doc comment on every exported function and type
- Every sentence a person reads, in `src/messages.js` or `src/client/strings.js`. Every toolbar style, in `src/client/theme.css`
- Updates to each page in `docs/` that describes what changed. Read [how it works](docs/how-it-works.md) first
- An entry under `## Unreleased` in `CHANGELOG.md`

To retake the documentation screenshots:

```bash
node scripts/docs-screenshots.js
```

## Releases

The version lives in `package.json`. To release, move the `Unreleased` entries in `CHANGELOG.md` under a new version heading, raise the version, tag the commit `v<version>` and publish the GitHub release with that changelog section as its notes.
