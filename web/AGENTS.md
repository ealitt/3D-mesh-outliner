# AGENTS.md

This frontend is both a production app and a reference implementation for the user's preferred web-tool aesthetic.

Use this file to preserve:

- product feel
- visual language
- layout conventions
- interaction quality
- implementation preferences
- validation expectations

Do not treat it as a command to clone every screen exactly. Treat it as a house style guide for future coding agents. Preserve these patterns unless the user explicitly asks for a different direction.

## Read these files first

In addition to this file, load:

- `CODEX_CONTEXT.md` for product and architecture context
- `TESTING.md` for the required validation commands
- `README.md` for the current feature set and runtime expectations

## Mission

Build small, polished, local-first browser tools that feel like serious desktop workspaces.

The target vibe is:

- tool-like rather than marketing-like
- calm, practical, and confident
- visually warm but technically sharp
- compact enough for repeat use
- spatial and grounded when graphics are involved
- modern without feeling trendy or decorative

The user likes web apps that feel closer to slicer, CAD, mapping, or studio software than to a startup landing page.

## House style summary

When starting a new app for this user, default to this visual and interaction formula:

- a warm light shell around a darker focused work surface
- one dominant main stage and one clearly secondary control rail
- restrained accent color with strong hierarchy and minimal noise
- compact panels, chips, segmented controls, and anchored popovers
- selection that feels explicit and stable
- settings that persist and do not reset unrelated state
- dense enough to be useful, but never cramped or chaotic

## Core product feel

### What the user wants

- serious browser-based tools
- direct workflows
- visible state
- predictable controls
- little wasted space
- interfaces that reward repeated use

### What to avoid

- marketing sections and splashy hero layouts
- oversized cards with too much air
- loud gradients competing with the work
- toy-like iconography or color use
- overly rounded, pillowy UI everywhere
- hidden state changes or magical auto-resets

## Layout rules

### Default workspace composition

Prefer a split workspace:

- primary work area on the left
- controls and metadata on the right
- the work surface should dominate
- the control rail should stay visible but secondary

In this app, that means:

- desktop workspace grid of `minmax(0, 1.24fr) 330px`
- a large left preview article for the viewer and export tray
- a right rail of stacked collapsible tool panels

Carry this ratio into new projects unless the task clearly needs a different layout.

### Header pattern

Use a compact top bar:

- left-aligned product title
- one utility action cluster on the right
- settings accessible from a cog in the top-right

Avoid giant mastheads or marketing copy above the workspace.

### Mobile behavior

On smaller screens:

- stack the right rail below the main stage
- keep the visual language intact instead of redesigning into a different app
- preserve dense cards, segmented controls, and panel headers
- let anchored popovers widen toward full available width when needed

## Visual language

### Overall direction

This app establishes the preferred look:

- warm off-white outer workspace
- dark technical viewport
- olive-gray accent for primary actions and selected tabs
- blue reserved mostly for focus rings and selection halos
- subtle borders, low-noise shadows, soft overlays

Do not default to full dark mode for the whole app. The preferred pattern is a light workbench with dark focal surfaces where it helps the work.

### Core tokens

Use these tokens or very close descendants unless the user asks to change the palette:

```css
:root {
  --ink-strong: #202520;
  --ink-soft: #697064;
  --paper: #f3efe7;
  --paper-2: #ebe4d8;
  --paper-3: #dfd7ca;
  --line: rgba(88, 96, 86, 0.16);
  --accent: #66745d;
  --accent-deep: #4c5946;
  --accent-soft: rgba(102, 116, 93, 0.12);
  --success-soft: rgba(76, 103, 73, 0.1);
  --success-line: rgba(76, 103, 73, 0.18);
  --warning-soft: rgba(165, 129, 73, 0.11);
  --warning-line: rgba(165, 129, 73, 0.18);
  --danger-soft: rgba(156, 84, 74, 0.11);
  --danger-line: rgba(156, 84, 74, 0.18);
}
```

The page background should feel softly atmospheric, not flat:

- layered radial highlights
- subtle warm gradient wash
- no harsh high-contrast wallpaper

### Surface treatment

Default surfaces should feel like studio hardware panels:

- lightly translucent off-white backgrounds
- 1px quiet borders
- restrained shadows
- corner radius mostly between `0.55rem` and `0.95rem`
- slightly larger radii for overlays and major cards

Use radius intentionally. Do not round everything to the same value without hierarchy.

### Dark work surfaces

For canvases, viewers, or high-focus stages, use a dark technical surface:

- deep navy-to-charcoal gradient
- faint grid, plate, or reference geometry when appropriate
- light text and controls over the dark surface
- glassy or translucent dark overlays rather than solid black boxes

The dark surface should feel anchored and work-oriented, not cinematic.

## Typography

### Font system

Use:

- `"Space Grotesk"` for primary UI text and headings
- `"IBM Plex Mono"` for metadata, chips, code, and compact labels

Fallbacks should stay neutral and modern.

### Type hierarchy

Follow this general pattern:

- page title: bold, compact, slightly tight tracking
- panel kicker: tiny uppercase label with loose tracking
- panel title: confident, not oversized
- body copy: quiet and readable
- chips and metadata: monospaced, compact

Typography should communicate structure and confidence, not ornament.

## Component patterns

### Panels

Panel design should be consistent:

- use warm studio surfaces
- keep panel padding tight and practical
- use kicker plus title for section headers
- use collapsible panels in secondary rails when the workflow benefits from it
- panels in the rail should be slightly tighter than the main stage panel

### Buttons

Default button families:

- primary button: olive fill, white text, strong weight
- secondary button: white or translucent light surface with border
- viewer/tool button: dark glass or translucent on dark surfaces

Transitions should be subtle:

- small `translateY(-1px)` hover lift
- quick background and border transitions
- no springy or playful motion

### Segmented controls and tabs

Use segmented controls frequently for mode switches:

- quiet container shell
- active segment uses the olive accent fill
- inactive segments stay light and understated
- tabs and mode switches should feel like tool toggles, not navigation chrome

### Chips

Use chips for compact metadata:

- monospaced type
- muted background
- small radius
- low-contrast border

They should read as instrumentation, not as tags for decoration.

### Fields

Form controls should be compact and readable:

- off-white or white field surface
- quiet border
- medium radius
- clear focus ring
- labels above fields

Avoid oversized form rows and tall, mobile-app-like controls unless touch is the primary context.

### Toggles

Prefer toggle cards over raw checkbox rows when the choice affects a workflow mode or important setting.

Toggle cards should:

- have a panel-like background
- place the control first
- keep the label and supporting copy visually grouped

### Lists and selectable rows

Selectable rows should be flatter and denser than cards:

- short height
- light background
- clear hover state
- stronger selected state
- optional thin inset accent strip on selection

If a list item maps to a canvas or viewer object, support a synchronized color swatch when colors are meaningful.

### Popovers

Settings and utility popovers should be:

- anchored to the invoking control
- compact
- high enough contrast to float clearly over the workspace
- dismissible by clicking away

Do not replace this with giant centered modal takeovers unless the task genuinely needs a large editor.

## Viewer and canvas rules

### Viewer chrome

For 3D or canvas-heavy tools:

- make the stage the visual anchor
- place lightweight utility controls inside the stage edges
- use a dark footer or glass toolbar for active transform actions
- keep tool labels direct and functional

### Grounding

The user likes grounded workspaces:

- build plate
- grid
- axis cues
- stable frame of reference

Prefer predictable anchors over clever dynamic framing that makes the scene feel unstable.

### Empty states

Empty states should still look like the product:

- stay inside the real workspace shell
- keep copy short
- provide a clear action
- avoid marketing illustrations or generic onboarding fluff

## Interaction rules

### Selection

Selection must behave like a mature tool:

- selection persists until the user changes or clears it
- hover never overrides explicit selection
- click-away deselect should work naturally
- selection should survive nearby UI changes when possible
- list selection and canvas selection should stay synchronized

### View state

Protect camera and viewport context:

- no unexpected refits
- no hidden camera resets
- no remount-driven state loss
- fit-to-content should be explicit or very narrowly scoped

This is especially important for graphics work. Stable framing matters more than clever automatic adjustments.

### Tool modes

Switching modes should not:

- wipe selection
- reset transforms
- remount the viewer
- clear viewport state

Tool changes should feel additive and controlled.

### Numeric inputs

Use draft-string editing for numeric fields when live formatting would be intrusive.

Preferred behavior:

- allow temporary states such as empty string, `0`, or `0.`
- commit validation on blur, Enter, or debounce
- let select-all and replace work naturally

Avoid aggressive coercion while the user is still typing.

### Keyboard shortcuts

Shortcuts are welcome when they feel like real tool shortcuts.

Rules:

- scope them to the active selection or current mode
- do not fire while typing in an input
- do not conflict with normal text editing
- prefer familiar CAD or editor conventions when they fit

### Persistence

Preferences should stick:

- use local storage or equivalent browser persistence for stable defaults
- settings changes should apply without resetting unrelated state
- communicate that settings are saved automatically when useful

## Naming and copy

Use labels that match what the user sees.

Prefer:

- intent-driven names
- concrete nouns
- compact copy
- familiar workspace language

Avoid:

- internal jargon
- vague CTA labels like "Run" when "Create Projection" or an equivalent task name is available
- duplicated labels inside already-clear compact rows

## Engineering preferences

### Architecture

Prefer:

- explicit state ownership
- nearest-common-parent shared state when two surfaces must stay synchronized
- separation between render-time UI state and export logic
- pure helpers for math, geometry, and formatting

Avoid:

- multiple competing sources of truth
- hidden fallback paths that silently override the real runtime path
- sweeping UI rewrites when a narrow fix will do

### Browser verification

When changing browser-visible UI behavior, verify in a real browser when practical.

Static code review is not enough for:

- selection bugs
- viewport bugs
- pointer interactions
- layout and density changes
- overlay or popover behavior

### Debugging

For stubborn UI problems:

- identify the actual runtime component
- add targeted instrumentation
- prove the render path
- log before and after important transitions
- patch narrowly
- re-test in the browser

## Repo and stack contract

Keep these defaults unless the user asks otherwise:

- package manager/runtime: Bun
- bundler/dev server: Vite
- UI framework: Preact
- styling: Tailwind CSS v4 plus focused local CSS
- testing: Vitest plus Testing Library
- graphics: three.js when the feature genuinely needs 3D
- hosting target: GitHub Pages

This repo is static-hosted:

- no server runtime
- no backend secrets
- no SSR assumptions
- respect `import.meta.env.BASE_URL`

### Browser-first UX

Prefer browser-native workflows whenever they fit:

- drag and drop
- file input
- paste
- pointer interactions
- keyboard shortcuts
- local processing over network roundtrips

### Asset and path rules

- use `public/` only for assets that truly need fixed filenames
- prefer imported assets from `src/` when Vite can fingerprint them
- never hardcode root-relative paths that break under a GitHub Pages subpath
- keep GitHub Pages deployment behavior in mind for all asset and router decisions

### PWA

PWA support is optional.

Use it when:

- the tool is a recurring utility
- offline use materially helps
- installability improves the experience

Skip it when it adds more complexity than value.

## Styling implementation rules

When building new screens or apps in this house style:

- define shared design tokens in `index.css`
- keep most layout and one-off styling in component-level classes or utilities
- use local CSS for global tokens, layered backgrounds, viewer shells, and complex component states
- avoid sprawling selector chains or mixing many styling systems

## Performance rules

Always keep the app fast and local-first:

- lazy-load heavy libraries when practical
- use workers for CPU-heavy tasks
- debounce expensive live recomputation
- clean up timers, listeners, animation frames, and WebGL resources

## Accessibility expectations

Even tool-heavy interfaces should meet a practical accessibility bar:

- keyboard-reachable controls
- visible focus states
- clear labels
- usable contrast
- intentional motion
- status text for long-running work

Canvas-heavy apps should still expose real HTML controls and status outside the canvas when possible.

## Testing and validation

Before finishing substantial work, run:

```bash
bun run check
bun run test
bun run build
bun run test:pages-build
```

Add focused tests for:

- pure logic
- geometry and formatting helpers
- important state transitions
- interaction regressions that affect selection, sync, or viewport behavior

## Code review checklist for future agents

Before finalizing a UI or interaction change, check:

1. Did selection remain stable?
2. Did viewport or camera state remain stable?
3. Did any component remount and wipe state unexpectedly?
4. Did settings or tool toggles reset unrelated state?
5. Does the result still feel like the warm-workbench plus dark-stage house style?
6. Did the layout keep a dominant main stage and clearly secondary rail?
7. Was browser-visible behavior verified in a real browser when practical?

If any answer is "maybe," do more verification before claiming success.

## Default decision heuristics

When the user has not specified a direction, prefer:

- stable over clever
- explicit over implicit
- tool-like over decorative
- compact over bloated
- anchored popovers over giant modals
- light workbench plus dark focal stage over full-app dark mode
- visible state over hidden automation
- focused patches over broad rewrites

Avoid:

- UI surprises
- aggressive auto-formatting while typing
- decorative color systems
- unnecessary dependencies
- giant empty areas that weaken the workspace feel

## Final note for agents

Think like you are extending a family of desktop-quality browser tools.

The desired result is:

- calm
- capable
- compact
- spatial
- polished
- local-first
- easy for the next agent to continue without re-inventing the design language
