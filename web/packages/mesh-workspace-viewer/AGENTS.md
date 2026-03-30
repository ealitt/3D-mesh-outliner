# Agents

## Package Goal

This package is the standalone home for the mesh workspace viewer. Treat it as publishable package code, not as an app-internal dumping ground.

## Boundaries

- Public API changes must go through `src/index.ts`.
- Do not import from `web/src/` into this package.
- Keep viewer settings generic and host-agnostic.

## Expectations

- Preserve the current studio interaction model unless a behavior change is explicitly requested.
- Prefer package-owned CSS over host utility classes.
- Add or update package-local tests and docs whenever public behavior changes.
