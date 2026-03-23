# Repository instructions for GitHub Copilot

This repo is a template for tiny static GitHub Pages web apps built with Bun, Vite, Preact, and Tailwind CSS v4.

Before changing code:

1. Read `AGENTS.md`
2. Read `CODEX_CONTEXT.md`
3. Read `TESTING.md`

Working rules:

- Keep apps static-host friendly.
- Prefer simple Preact components and `@preact/signals` over heavier state patterns.
- Lazy-load heavy libraries like `three` or `p5`.
- Use workers for expensive processing.
- Respect GitHub Pages repo subpaths and `import.meta.env.BASE_URL`.
- Treat PWA and browser-device APIs as optional capabilities, not defaults.

Required validation before finishing:

```bash
bun run validate
```
