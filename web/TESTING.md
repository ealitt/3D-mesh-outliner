# TESTING.md

This file tells Codex and other coding agents exactly how to validate changes in this repository.

## Required validation order

Run these commands in order after making changes:

```bash
bun install
bun run check
bun run test
bun run build
bun run test:pages-build
```

For a single-command pass, run:

```bash
bun run validate
```

## What each command proves

### `bun run check`
Verifies TypeScript types, JSX types, and import-level correctness.

### `bun run test`
Runs the Vitest suite in jsdom for unit and component coverage.

Current test coverage should focus on:
- logic helpers such as conversions and transformations
- Preact components with meaningful interactions
- worker-friendly computation extracted into pure functions

### `bun run build`
Verifies the default local-root production build.

### `bun run test:pages-build`
Builds with:
- `VITE_BASE_PATH=/example-repo/`
- `VITE_ENABLE_PWA=true`

This catches the most important GitHub Pages failure mode: code that works at `/` locally but breaks when deployed under a repo subpath with PWA enabled.

## When to add tests

Add or update tests whenever you change:

- conversion or calculation logic
- parsers or transformers
- worker computation
- important UI interactions
- feature-detection or fallback logic
- base-path-sensitive asset handling

## When visual-only changes do not need new tests

You do not need to add heavy new tests for:

- spacing-only tweaks
- typography-only tweaks
- non-critical decorative changes

Still run the full validation commands after those edits.

## Testing priorities for this template

Prefer these in order:

1. unit tests for logic
2. component tests for important interactions
3. build validation for GitHub Pages correctness
4. browser/device tests only when a project actually adds hardware or advanced PWA behavior

## Notes for hardware projects

If a project adds Web Serial, WebUSB, WebHID, or Bluetooth:

- test feature detection separately from device access
- keep browser support messaging testable
- avoid making real hardware access the only execution path

## Notes for canvas projects

If a project adds three.js or p5.js:

- test the control logic and setup guards
- do not overinvest in fragile DOM snapshots
- validate that lazy imports and cleanup paths still build correctly
