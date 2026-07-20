---
name: mcpmint
description: A precise safety workbench for turning API specifications into inspectable MCP servers.
colors:
  workbench-black: "#0C0C0C"
  workbench-surface: "#161616"
  workbench-surface-hover: "#1E1E1E"
  paper-white: "#EDEDED"
  acid-lime: "#E8FF47"
  signal-green: "#47FFB2"
  signal-blue: "#47B5FF"
  signal-amber: "#FFAA2C"
  signal-red: "#FF4D4D"
  rule-dark: "#2A2A2A"
typography:
  display:
    fontFamily: "Clash Display, sans-serif"
    fontSize: "3rem"
    fontWeight: 700
    lineHeight: 0.95
    letterSpacing: "-0.03em"
  body:
    fontFamily: "Fira Code, monospace"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Fira Code, monospace"
    fontSize: "0.6875rem"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "0.15em"
rounded:
  none: "0px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.acid-lime}"
    textColor: "{colors.workbench-black}"
    rounded: "{rounded.none}"
    padding: "12px 20px"
  input-default:
    backgroundColor: "{colors.workbench-black}"
    textColor: "{colors.paper-white}"
    rounded: "{rounded.none}"
    padding: "10px 12px"
---

# Design System: mcpmint

## Overview

**Creative North Star: "The Safety Workbench"**

mcpmint is a dark-first technical work surface used by a developer at a desk while deciding what code and network behavior to trust. Refined brutalism provides the visual discipline: squared geometry, clear rules, terse labels, and one rare acid-lime action color. Evidence is dense but ordered; routine configuration is quiet.

The system rejects generic AI generator marketing, decorative glassmorphism, neon cyber-security styling, security theater, hidden wizard state, and card grids as a default architecture.

**Key Characteristics:**

- Flat, ruled surfaces with no decorative elevation.
- Acid lime reserved for primary actions, focus, and current selection.
- Semantic green, blue, amber, and red always paired with text or icon meaning.
- Progressive inspection that expands in place and preserves surrounding context.
- Responsive product layouts, not fluid display typography inside workflows.

## Colors

The palette is restrained: near-black work surfaces, warm off-white text, and a scarce acid-lime control signal.

### Primary

- **Acid Lime** (#E8FF47): primary actions, active progress, keyboard focus, and explicit selection only.

### Secondary

- **Signal Green** (#47FFB2): passed checks and safe/read-only evidence.
- **Signal Blue** (#47B5FF): informational capability details and request previews.
- **Signal Amber** (#FFAA2C): partial support, review requirements, and non-blocking risk.
- **Signal Red** (#FF4D4D): blocked downloads, destructive actions, and failed verification.

### Neutral

- **Workbench Black** (#0C0C0C): application canvas and input wells.
- **Workbench Surface** (#161616): panels and toolbars.
- **Workbench Surface Hover** (#1E1E1E): hover and secondary controls.
- **Paper White** (#EDEDED): primary text.
- **Rule Dark** (#2A2A2A): borders and dividers.

**The One Signal Rule.** Acid lime occupies less than ten percent of a workflow screen. Its rarity makes the primary action unmistakable.

## Typography

**Display Font:** Clash Display (sans-serif fallback)
**Body Font:** Fira Code (monospace fallback)
**Label/Mono Font:** Fira Code

**Character:** Clash Display gives the public entry surface a confident industrial voice. Fira Code makes paths, methods, findings, and generated output easy to scan without pretending every label is code.

### Hierarchy

- **Display** (700, 3rem or larger on the landing surface, 0.95): marketing headline only.
- **Headline** (600, 1.5rem, 1.2): workflow page title and major result.
- **Title** (600, 1rem, 1.35): section and endpoint title.
- **Body** (400, 0.875rem, 1.6): instructions and explanations, capped at 72 characters when prose dominates.
- **Label** (500, 0.6875rem, 0.15em letter spacing): short uppercase state and field categories.

**The Work Before Voice Rule.** Display type never appears inside dense configuration, scanner, sandbox, or installation controls.

## Elevation

The interface uses no decorative shadows. Depth comes from tonal surface changes, full one-pixel rules, and content hierarchy. Popovers may sit above content, but their boundary must remain structural rather than atmospheric.

**The Flat-by-Default Rule.** A surface earns separation through function and a complete border, never through decorative blur or a colored side stripe.

## Components

### Buttons

- **Shape:** square and compact (0px radius).
- **Primary:** acid-lime background, workbench-black text, 12px by 20px padding.
- **Hover / Focus:** small tonal change; a visible acid-lime focus outline. Motion lasts 150–200ms and changes state only.
- **Secondary / Ghost:** ruled or transparent surfaces using paper-white text; destructive actions use signal red with explicit copy.

### Chips

- **Style:** full one-pixel border, compact mono label, semantic text and a low-opacity semantic background.
- **State:** selected chips add a readable icon or text state, never color alone.

### Cards / Containers

- **Corner Style:** square (0px radius).
- **Background:** workbench surface on the canvas.
- **Shadow Strategy:** none.
- **Border:** complete one-pixel rule-dark border.
- **Internal Padding:** 16px for dense controls, 24px for primary workflow sections.

### Inputs / Fields

- **Style:** workbench-black well, one-pixel rule, square corners, 10px by 12px padding.
- **Focus:** acid-lime border or outline without layout shift.
- **Error / Disabled:** errors pair signal red with explanatory text; disabled fields remain readable and explain why when non-obvious.

### Navigation

Use a persistent top workflow header with explicit progress semantics. Active steps use acid lime plus text. On narrow screens, preserve the current step and collapse secondary labels without hiding navigation affordances.

### Evidence Rows

Scanner findings, capability gaps, and diffs use a shared evidence row: severity icon and word, affected object, concise explanation, and an inline remediation or inspection action. Rows expand in place rather than opening a modal first.

## Do's and Don'ts

### Do:

- **Do** show the exact tool, parameter, endpoint, construct, or artifact behind every status.
- **Do** reserve acid lime (#E8FF47) for primary actions, focus, active progress, and current selection.
- **Do** keep remediation adjacent to the finding it resolves.
- **Do** pair semantic color with icons, labels, and meaningful text.
- **Do** preserve keyboard focus and surrounding context when content expands.

### Don't:

- **Don't** use generic AI generator marketing that hides limitations behind celebratory copy.
- **Don't** use security theater: unexplained scores, green shields without evidence, or warnings that cannot be acted on.
- **Don't** use decorative glassmorphism, neon cyber-security styling, or dashboard chrome that competes with the work.
- **Don't** use wizard flows that conceal state, silently rewrite choices, or make recovery difficult.
- **Don't** use card grids as the default information architecture for every feature.
- **Don't** use colored side-stripe borders, gradient text, decorative motion, or nested cards.
