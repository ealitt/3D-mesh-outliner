# CODEX_CONTEXT.md

This file gives Codex and similar coding agents the missing project context that is easy for humans to assume but easy for agents to miss.

## What this template is for

This repository is a starter for **small, static, browser-first web apps** that ship as **individual GitHub repository projects** and deploy to **GitHub Pages**.

The intended output is not a generic dashboard or an enterprise app shell. It is a polished little tool, sketch, viewer, converter, processor, or hardware experiment that feels finished in one screen.

Typical examples:

- pi digit explorer
- unit converter
- image-to-SVG tool
- little p5.js art toy
- small three.js scene
- browser-to-microcontroller utility using Web Serial or WebUSB

## What matters most here

Optimize for these priorities in order:

1. **Static hosting correctness**
2. **Fast startup and low complexity**
3. **Clean, modern UI**
4. **Agent-friendly maintainability**
5. **Optional advanced capabilities without burdening the default app**

## Architectural stance

Use **Preact + Vite + Bun + Tailwind v4** as the default stack.

Why this stack exists:

- Preact keeps the runtime small while staying familiar to React-trained agents.
- Vite makes static apps, workers, and dynamic imports straightforward.
- Bun keeps install and script ergonomics simple.
- Tailwind v4 gives a modern visual baseline with little setup.
- GitHub Pages stays compatible as long as repo-subpath routing and assets are handled correctly.

## What “good” looks like

A successful repo made from this template usually has these traits:

- one clearly stated purpose
- one main screen or a very small number of views
- good empty, loading, success, and error states
- thoughtful visual polish without overdesign
- local browser processing where practical
- workers for expensive processing
- dynamic import for heavy optional libraries
- no accidental root-path assumptions that break GitHub Pages

## What agents should avoid by default

Do not introduce these unless the user explicitly wants them:

- SSR frameworks
- backend services
- auth
- databases
- large UI kits
- global app state libraries
- complicated routing
- unnecessary network dependencies
- React itself when Preact already covers the use case

## Mode selection

Before coding, decide which of these modes the task belongs to:

### Utility mode
For converters, viewers, parsers, local processors, and small tools.

Default shape:
- simple form controls
- result area
- URL state only when useful
- worker when computation gets heavy

### Canvas mode
For p5.js, three.js, and visual toys.

Default shape:
- minimal Preact shell
- isolated canvas feature module
- cleanup on unmount
- heavy libraries loaded lazily

### Hardware mode
For Web Serial, WebUSB, WebHID, or similar browser-device APIs.

Default shape:
- explicit connect button
- capability detection first
- unsupported-browser fallback
- no auto-connect behavior
- simulated mode when possible

## GitHub Pages assumptions

Every agent should assume this repo will usually deploy under a repo subpath like `/project-name/`, not the origin root.

That means:

- honor `import.meta.env.BASE_URL`
- avoid hardcoded `/asset.png` style paths
- verify a Pages-like build before finishing

## PWA stance

PWA support is optional and should only be enabled when it clearly helps repeated use, offline value, or installability.

Do not enable it just because it exists.

## What Codex should do first

1. Read `AGENTS.md`
2. Read this file
3. Read `TESTING.md`
4. Inspect `README.md`
5. Inspect the existing `src/` tree before editing

## Definition of done

The work is only done when:

- the code matches the chosen app mode
- the repo still works as a static GitHub Pages project
- critical logic has tests
- the validation commands in `TESTING.md` pass
- the README explains the project clearly
