# Contributing to MAP

Thank you for your interest in contributing! This document explains how to get involved.

## Ways to contribute

- **Report a bug** — open a [bug report](https://github.com/YOUR_ORG/MAP/issues/new?template=bug_report.md)
- **Suggest a feature** — open a [feature request](https://github.com/YOUR_ORG/MAP/issues/new?template=feature_request.md)
- **Fix a bug or build a feature** — open a pull request
- **Improve docs** — README, wiki content, or inline comments

## Development setup

**Requirements:** Node 20+, Docker, Docker Compose.

```bash
# 1. Fork and clone
git clone https://github.com/YOUR_ORG/MAP.git
cd MAP

# 2. Install dependencies
npm install

# 3. Create your env file and add a Gemini API key
cp .env.example .env

# 4. Start Postgres and Redis
docker compose up -d postgres redis

# 5. Run migrations
npm run db:migrate

# 6. Start the dev server
npm run dev
```

App available at [http://localhost:3000](http://localhost:3000).

## Before submitting a pull request

```bash
npm run lint       # ESLint
npx tsc --noEmit   # TypeScript type check
npm run build      # Full production build
```

All three must pass. PRs that fail the CI checks will not be reviewed until they're green.

## Commit message format

This project uses [Conventional Commits](https://www.conventionalcommits.org). Your commit messages drive automatic versioning and changelog generation:

| Prefix | Effect |
|---|---|
| `feat: ...` | New feature → minor version bump |
| `fix: ...` | Bug fix → patch version bump |
| `feat!: ...` | Breaking change → major version bump |
| `docs:`, `chore:`, `refactor:` | No version bump |

Examples:
```
feat: add export to PNG
fix: resync dialog crash on empty graph
docs: update MCP connection guide
```

## Pull request process

1. Open a PR against `main`
2. Fill out the PR template
3. A maintainer will review — expect feedback within a few days
4. Once approved and CI is green, a maintainer will merge it

## Code style

- TypeScript for all source files
- Prettier for formatting (`npm run format`)
- ESLint for linting (`npm run lint`)
- No comments explaining *what* code does — only *why* when the reason is non-obvious

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). By participating you agree to abide by its terms.
