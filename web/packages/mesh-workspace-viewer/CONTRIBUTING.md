# Contributing

## Code Organization

- Add public exports only through `src/index.ts`.
- Keep package-only runtime details inside `src/core/`.
- Prefer typed helpers for pure logic before adding more component-local branching.

## Tests

- Add or update package-local tests for any change to interaction logic, settings persistence, or runtime math helpers.
- Keep behavior-sensitive tests near the package under `src/test/`.

## Documentation

- Update `README.md` when the public API changes.
- Update `ARCHITECTURE.md` when state ownership or runtime boundaries change.
- Add migration notes to `MIGRATION.md` when host integration changes.

## Release Notes

- Record externally visible package changes in `CHANGELOG.md`.
