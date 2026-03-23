# AGENTS.md

This repository is a **template for tiny static web apps** deployed to **GitHub Pages**.

Read this file before making changes.

## Read these files first

In addition to this file, load:

- `CODEX_CONTEXT.md` for the high-level product and architecture explanation
- `TESTING.md` for the exact validation commands that must pass before you finish
- `.github/copilot-instructions.md` when working through GitHub Copilot surfaces


## Mission

Build **small, polished, client-side apps** that do one thing well.

Typical project shapes:

- utility tool
- reference viewer
- image/file transformer
- generative art sketch
- lightweight three.js scene
- browser-hardware experiment
- installable PWA

The result should feel **intentional, fast, modern, and clean**, not like a bloated SPA.

---

## Stack contract

Use these defaults unless the task clearly requires something else:

- **Package manager/runtime:** Bun
- **Bundler/dev server:** Vite
- **UI framework:** Preact
- **State:** local state first, `@preact/signals` for simple shared or reactive state
- **Styling:** Tailwind CSS v4 utilities plus small local CSS where needed
- **Testing:** Vitest + Testing Library
- **Hosting target:** GitHub Pages
- **PWA:** opt-in via `VITE_ENABLE_PWA=true`

Do **not** switch frameworks unless the user explicitly asks.

---

## Why Preact is the default here

Choose Preact patterns first because this template is optimized for:

- lightweight bundles
- React-shaped JSX and hooks
- compatibility with more third-party examples and libraries
- easier reuse by coding agents that already know React-like patterns

Use `preact/compat` only when a dependency needs React compatibility. Do not add React itself.

---

## Non-negotiable repo assumptions

1. **Static hosting only**
   - No custom server
   - No server-side rendering
   - No backend secrets
   - No dependence on Node APIs in shipped client code

2. **GitHub Pages path safety**
   - Production deploys under a repo subpath such as `/my-project/`
   - Always respect `import.meta.env.BASE_URL`
   - Do not hardcode root-relative asset URLs unless they intentionally live in `public/` and still work with the configured base path

3. **Fast startup**
   - Keep the initial route light
   - Lazy-load heavy libraries like `three`, `p5`, code editors, parsers, or large image tools
   - Push expensive work into workers when practical

4. **Browser-first UX**
   - Use native browser capabilities well
   - Favor drag-and-drop, file input, paste, pointer, keyboard shortcuts, and shareable URLs
   - Prefer local processing over network roundtrips

---

## How to choose the app shape

For each request, classify the app into one of these modes.

### A. Utility mode
Examples:
- pi digits viewer
- measurement converter
- color tool
- markdown previewer
- image to SVG converter
- JSON inspector

Preferred architecture:
- one screen or a very small number of views
- form inputs + result area
- state in component state or signals
- worker for heavy parsing/conversion
- optional URL param persistence for shareable state

### B. Canvas mode
Examples:
- p5.js art
- three.js scene
- shader toy-like experiments
- interactive visualizers

Preferred architecture:
- a minimal app shell
- dedicated canvas mount component
- feature module loaded dynamically
- controls separated from rendering logic
- careful cleanup on unmount

### C. Hardware mode
Examples:
- Web Serial microcontroller console
- WebUSB tool
- WebHID dashboard
- Bluetooth experiment

Preferred architecture:
- explicit connect/disconnect controls
- capability detection before showing advanced actions
- unsupported-browser message
- optional demo/simulated mode
- no assumption that every browser supports the API

---

## Design rules

The visual bar should be higher than default boilerplate.

### Use this style direction
- soft glass or layered surfaces are okay, but keep them restrained
- strong spacing and hierarchy
- rounded corners
- clear hover/focus states
- excellent typography contrast
- dark mode by default is acceptable for tools and art apps

### Avoid
- crowded dashboards
- excessive gradients everywhere
- five different accent colors
- tiny text
- placeholder lorem ipsum
- generic “Submit” / “Process” / “Run” labels when a more specific label fits

### Default UI principle
A tiny tool should feel like a finished product in one screen.

---

## Preact rules

### Prefer
- function components
- hooks for local UI state
- `@preact/signals` for simple shared or frequently updated state
- small presentational components
- derived values computed close to usage

### Avoid
- over-abstracting a tiny app
- global state libraries unless clearly needed
- giant component trees for small tools
- creating a router for a one-screen app

### Compatibility
If a package expects React:
- first see if it works with the existing Preact Vite preset aliases
- use `preact/compat` only as needed
- do not add React and ReactDOM just to satisfy habit

---

## Tailwind rules

Use Tailwind utilities for almost all styling.

### Prefer
- semantic layout grouping in components
- utility classes directly in JSX
- a tiny amount of local CSS for:
  - global background
  - custom canvas sizing
  - animation keyframes
  - complex layered visual effects

### Avoid
- sprawling custom CSS files
- deep selector chains
- styling through IDs
- mixing multiple styling systems

---

## Performance rules

Always design for small static apps.

### Required habits
- lazy-load heavy dependencies
- debounce or throttle expensive live updates where necessary
- use workers for CPU-heavy processing
- reuse object URLs and revoke them when done
- clean up event listeners, timers, animation frames, and WebGL resources

### Good candidates for workers
- image transforms
- SVG/path generation
- text parsing
- simulation
- large numeric loops
- compression/decompression
- data import/export transforms

---

## File and asset rules

### Public assets
Use `public/` only for assets that must keep a fixed filename, like:
- favicon
- PWA icons
- social preview images
- static examples that must be addressable directly

### Imported assets
Prefer importing assets from `src/` when possible so Vite can fingerprint and manage them.

### Paths
Respect the current Vite base path. This template deploys to GitHub Pages project pages, so repo subpaths matter.

---

## PWA rules

PWA support is **optional**, not mandatory.

### Enable PWA when
- the app is a recurring utility
- offline use matters
- mobile installability helps
- caching improves the user experience

### Skip PWA when
- the project is a one-off demo
- the value is mostly visual and short-lived
- service worker complexity adds little benefit

### If PWA is enabled
- keep caching simple
- include meaningful icons
- include a sensible app name and theme color
- make update prompts understandable
- test installability and refresh behavior

---

## three.js rules

When using `three`:

- load it dynamically if it is not the only core feature
- keep scene setup isolated in its own module
- clean up renderer, textures, geometries, materials, and event listeners
- resize properly
- provide a fallback message if WebGL is unavailable
- keep surrounding UI minimal and readable

Use three.js when the project genuinely benefits from 3D or shader-driven visuals. Do not add it for decorative motion alone.

---

## p5.js rules

When using `p5`:

- mount it inside a dedicated component container
- encapsulate sketch setup and teardown cleanly
- expose user controls outside the sketch when practical
- make the sketch responsive
- avoid hidden global state

Use p5.js for generative art, visual experiments, or interaction-first sketches. Keep the sketch module separate from the broader app shell.

---

## Hardware API rules

For Web Serial, WebUSB, WebHID, or Bluetooth:

- assume limited browser support
- gate all actions behind feature detection
- explain support requirements clearly
- do not auto-connect
- surface permission and connection state visibly
- handle disconnects gracefully
- provide a non-hardware demo path if possible

Remember that powerful device APIs may require **secure contexts** and are not universally available.

---

## Accessibility rules

Every app should still be usable.

### Minimum bar
- keyboard reachable controls
- visible focus states
- labels for inputs
- sufficient color contrast
- buttons that say what they do
- reduced-motion consideration for intense animation
- status text for long-running tasks

Canvas-heavy apps should still expose controls and explanations in accessible HTML outside the canvas.

---

## Suggested project structure

You do not need every folder, but prefer a structure like this:

```text
src/
  app.tsx
  main.tsx
  index.css
  components/
  features/
  lib/
  workers/
  sketches/
```

### Guidance
- `components/` for reusable UI pieces
- `features/` for app-specific functionality
- `lib/` for helpers, browser utilities, adapters, and constants
- `workers/` for worker entry points
- `sketches/` for p5/three/canvas modules

Keep it flat if the app is tiny.

---

## Testing rules

Treat validation as required, not optional. Before finishing, run:

```bash
bun run check
bun run test
bun run build
bun run test:pages-build
```

Write tests when the app has meaningful logic.

Good test targets:
- conversion logic
- parser behavior
- state transitions
- file transform helpers
- components with important interactions

Do not spend half the project on testing tiny visual wrappers. Focus on logic and critical interactions.

---

## What to avoid

Do not introduce the following unless clearly justified:

- Next.js / SSR frameworks
- server APIs
- giant UI libraries
- auth systems
- databases
- CSS-in-JS
- Redux-like global state for a tiny tool
- complicated routing for a one-page app
- unnecessary animation libraries
- unnecessary package churn

This repo exists for **small, elegant, static apps**.

---

## Delivery checklist

Before finishing, make sure the project has:

- a focused single purpose
- a polished landing screen
- responsive layout
- correct GitHub Pages base path behavior
- no obvious main-thread blocking for heavy operations
- clear empty, loading, success, and error states
- accessible labels and focus states
- no dead code or unused dependencies
- updated README with how to run and what the app does
- `bun run validate` passing locally before handing off

---

## README expectations

When you update the README for a new repo, include:

- what the project does
- how to run it with Bun
- how to build it
- whether PWA is enabled
- any browser support notes
- any device/hardware support notes
- any privacy note if files stay local in-browser

---

## Implementation preference order

When solving a task, prefer:

1. browser-native APIs
2. small focused libraries
3. dynamic imports for heavy libraries
4. workers for expensive processing
5. extra dependencies only when they clearly simplify the app

---

## Final note for agents

Think like you are shipping a tiny product, not scaffolding a demo.

The best outcome is:
- small
- clear
- attractive
- fast
- local-first
- easy to host
- easy for the next agent to extend
