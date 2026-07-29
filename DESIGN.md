---
name: Domino
description: "A compact household warranty dispatch manifest built for fast scanning and decisive claim action."
colors:
  paper: "#f5f3ed"
  sheet: "#fffefa"
  white: "#ffffff"
  ink: "#172033"
  muted: "#687184"
  rule: "#d8d9d3"
  orange: "#e65322"
  orange-ink: "#99330f"
  orange-soft: "#fff0e8"
  blue-ink: "#294968"
  blue-soft: "#eaf0f7"
  green: "#176b4d"
  green-soft: "#e7f3ed"
  red: "#a3332b"
  red-soft: "#fae9e7"
typography:
  display:
    fontFamily: '"Arial Nova", "Aptos", "Helvetica Neue", Arial, sans-serif'
    fontSize: "clamp(2.2rem, 5vw, 4.5rem)"
    fontWeight: 700
    lineHeight: 0.92
    letterSpacing: "-0.04em"
  headline:
    fontFamily: '"Arial Nova", "Aptos", "Helvetica Neue", Arial, sans-serif'
    fontSize: "clamp(1.78rem, 3.8vw, 3.5rem)"
    fontWeight: 700
    lineHeight: 0.95
    letterSpacing: "-0.04em"
  title:
    fontFamily: '"Arial Nova", "Aptos", "Helvetica Neue", Arial, sans-serif'
    fontSize: "1.12rem"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.025em"
  body:
    fontFamily: '"Arial Nova", "Aptos", "Helvetica Neue", Arial, sans-serif'
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.625
    letterSpacing: "normal"
  label:
    fontFamily: '"Arial Nova", "Aptos", "Helvetica Neue", Arial, sans-serif'
    fontSize: "0.68rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0.055em"
rounded:
  square: "0px"
  pill: "9999px"
spacing:
  tight: "8px"
  compact: "12px"
  default: "16px"
  roomy: "20px"
  section: "32px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.white}"
    typography: "{typography.body}"
    rounded: "{rounded.square}"
    padding: "0 20px"
    height: "48px"
  button-primary-hover:
    backgroundColor: "{colors.orange}"
    textColor: "{colors.white}"
  button-secondary:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.square}"
    padding: "0 16px"
    height: "44px"
  search-field:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.square}"
    padding: "0 16px"
    height: "48px"
  card:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    rounded: "{rounded.square}"
    padding: "{spacing.default}"
  badge-success:
    backgroundColor: "{colors.green-soft}"
    textColor: "{colors.green}"
    typography: "{typography.label}"
    rounded: "{rounded.square}"
    padding: "2px 8px"
    height: "24px"
  badge-attention:
    backgroundColor: "{colors.orange-soft}"
    textColor: "{colors.orange-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.square}"
    padding: "2px 8px"
    height: "24px"
  badge-danger:
    backgroundColor: "{colors.red-soft}"
    textColor: "{colors.red}"
    typography: "{typography.label}"
    rounded: "{rounded.square}"
    padding: "2px 8px"
    height: "24px"
  badge-info:
    backgroundColor: "{colors.blue-soft}"
    textColor: "{colors.blue-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.square}"
    padding: "2px 8px"
    height: "24px"
  navigation-active:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.square}"
    padding: "0 12px"
    height: "44px"
---

# Design System: Domino

## Overview

**Creative North Star: "Household Dispatch Manifest"**

Domino treats household coverage as a living dispatch manifest: a compact, orderly record of what the household owns, what remains covered, and where action is required. Paper-white sheets, blue-black ink, thin routing rules, and restrained marketplace product imagery make the application feel dependable and immediately legible rather than ornamental.

The system is information-dense without becoming administrative theater. Familiar controls, square geometry, and explicit status language support the operating sequence of scan, attend, search, and act. Safety orange interrupts the ledger only for a true exception or decisive action. The system refuses generic metric-card dashboards and overt bounty-hunter cosplay; Domino's name contributes resolve, not costume.

**Key Characteristics:**

- Compact, card-led inventory ledgers with a clear scan path
- Paper-white working sheets on a warm paper field
- Blue-black ink and thin routing rules as the structural vocabulary
- Safety orange reserved for exceptions, focus, and decisive actions
- Square controls and containers, with circles limited to small state markers
- Marketplace-like product imagery grounded by practical record detail

## Colors

The palette reads like a marked household record: warm paper, clean sheets, blue-black ink, and semantic washes that remain quiet until the user needs them.

### Primary

- **Dispatch Ink:** The default for text, strong dividers, navigation, and solid actions; it gives the ledger its authority.
- **Safety Orange:** The exceptional accent for active claims, current steps, focused search, and action hover states.

### Secondary

- **Coverage Green:** Confirms covered, connected, and completed states.
- **Claim Red:** Identifies failed or dangerous claim states that require intervention.

### Tertiary

- **Reference Blue Wash:** Supports informational document and lifetime-coverage states without competing with an active claim.
- **Exception, Coverage, and Claim Washes:** Tint local state regions while preserving dark, readable labels.

### Neutral

- **Household Paper:** The warm application field and quiet inset-field background.
- **Working Sheet:** The near-white surface for cards, controls, drawers, and working panels.
- **Navigation White:** High-contrast text and icon color on solid Dispatch Ink and Safety Orange actions.
- **Muted Ledger Ink:** Secondary descriptions, dates, metadata, and inactive navigation.
- **Routing Rule:** Hairline separation between records, fields, and stages.

### Named Rules

**The Exception Ink Rule.** Safety orange is a routing signal, not ambient decoration; use it for urgent attention, current state, focus, or a decisive action.

**The Paired Status Rule.** Every semantic color is paired with plain-language status text and a distinct fill or border treatment; color never carries state alone.

## Typography

**Display Font:** Arial Nova (with Aptos, Helvetica Neue, Arial, and sans-serif fallbacks)  
**Body Font:** Arial Nova (with Aptos, Helvetica Neue, Arial, and sans-serif fallbacks)  
**Label Font:** Arial Nova (with Aptos, Helvetica Neue, Arial, and sans-serif fallbacks)

**Character:** One utilitarian sans-serif family keeps the interface domestic, fast, and deployment-friendly. Authority comes from compressed display leading, strong weight contrast, and disciplined uppercase labels rather than a decorative type pairing.

### Hierarchy

- **Display** (bold, fluid, tightly led): Product-record identities and the largest operational titles.
- **Headline** (bold, fluid, compact): Primary page messages and inventory orientation.
- **Title** (bold, compact): Section headings, card names, and claim subjects.
- **Body** (regular or semibold, relaxed when explanatory): Metadata, instructions, notes, and supporting descriptions, typically held near a readable 72-character line.
- **Label** (bold, tightly tracked, uppercase): Kicker lines, field names, statuses, and ledger metadata.

### Named Rules

**The Ledger Label Rule.** Uppercase, tracked labels identify fields and statuses; they never replace readable sentence-case body copy.

**The Weight Before Ornament Rule.** Establish hierarchy with size, weight, leading, and ink tone before introducing another font or decorative treatment.

## Layout

Desktop application surfaces use a fixed left navigation rail (232px) and a fluid working region. The inventory home can expand to a wide ledger container (1540px), while focused forms and settings use narrower containers between 980px and 1180px. Page gutters progress from 16px on small screens to 24px and then 36px on large screens.

The recurring rhythm is compact: 8px for internal pairings, 12px for control groups, 16px for card padding and grid gaps, 20–24px for local section breathing room, and 32px for major separation. Inventory cards progress from one column to two at 640px and three at 1280px. Wide split layouts and the persistent navigation rail begin at 1024px; on smaller screens the rail becomes an overlay and the command header remains directly accessible.

Information is arranged around tasks rather than detached statistics: page identity and search first, items needing attention next, then the card-led record surface. Dense record details use hairline dividers and aligned definition lists so urgent information remains findable during a claim.

**The Scan-Attend-Search-Act Rule.** Every operational surface should expose identity, present exceptions, support direct lookup, and keep the next meaningful action close to the affected record.

## Elevation & Depth

Domino is flat by default. Paper tone, sheet contrast, and one-pixel rules establish most depth. The ambient sheet shadow (`0 14px 34px rgba(23, 32, 51, 0.08), 0 2px 5px rgba(23, 32, 51, 0.05)`) is reserved for raised or hovered records and floating controls; resting product cards use only a faint baseline shadow (`0 1px 0 rgba(23, 32, 51, 0.04)`). Search focus becomes a firm orange lower edge (`0 4px 0 #e65322`) rather than a diffuse glow.

### Shadow Vocabulary

- **Raised Sheet:** Ambient lift for a hovered product or deliberately floating sheet.
- **Card Baseline:** A nearly flat grounding line for resting product cards.
- **Search Focus Edge:** A structural orange edge that confirms keyboard focus within the universal search.

### Named Rules

**The Flat Ledger Rule.** Surfaces remain flat at rest; elevation appears only when interaction or layering makes it informative.

## Shapes

The core form language is square and paper-cut: buttons, inputs, badges, cards, navigation selections, image frames, and working panels use zero-radius corners. One-pixel rules in routing gray separate ordinary content; dispatch ink strengthens selected controls, primary section endings, and high-value boundaries. Dashed rules identify empty and upload targets.

Circles are narrowly reserved for status dots, connection indicators, and step markers where the silhouette itself communicates sequence. Product imagery is clipped to rectangular marketplace frames, usually at a 16:9 or 16:10 aspect ratio.

**The Square Working Surface Rule.** Do not soften ordinary cards or controls with generic rounded corners; reserve the pill radius for small indicators and timeline nodes.

## Components

Components feel direct and workmanlike: strong ink, exact alignment, square edges, and just enough motion to confirm interactivity.

### Buttons

- **Shape:** Square, with a minimum touch height of 44–48px.
- **Primary:** Dispatch Ink with Working Sheet text, bold body copy, and 20px horizontal padding; hover shifts to Safety Orange.
- **Hover / Focus:** Color changes are concise; the global keyboard focus treatment is a 3px orange-white mixed outline with a 3px offset.
- **Secondary:** Working Sheet with a Routing Rule border, dark text, and 16px horizontal padding; hover strengthens the border to Dispatch Ink.

### Chips

- **Style:** Square semantic washes with a one-pixel tonal border, 2px by 8px internal padding, bold uppercase label type, and a 24px minimum height.
- **State:** Coverage Green marks covered states, Safety Orange marks expiring or current attention, Claim Red marks failures or missing evidence, and Reference Blue Wash carries informational states.

### Cards / Containers

- **Corner Style:** Square.
- **Background:** Working Sheet over Household Paper.
- **Shadow Strategy:** Resting cards use the Card Baseline; interactive product and claim cards lift 4px and adopt the Raised Sheet on hover.
- **Border:** One-pixel Routing Rule by default; Dispatch Ink or semantic color strengthens a selected or urgent boundary.
- **Internal Padding:** 16px for product cards, increasing to 20–24px for focused working panels.

### Inputs / Fields

- **Style:** Square Working Sheet or Household Paper fields with one-pixel Routing Rule borders and 44–48px minimum height.
- **Focus:** Standard fields strengthen their border to Dispatch Ink; universal search adds the Search Focus Edge.
- **Error / Disabled:** Errors use Claim Red text with a plain-language message; disabled actions reduce opacity while preserving their shape and label.

### Navigation

The desktop rail is Dispatch Ink with muted white inactive links. Each item is at least 44px high; the active item becomes a square Working Sheet block with Dispatch Ink text. Mobile uses the same rail as a left overlay and provides explicit open and close controls.

### Product Docket Card

A 16:9 product image or restrained fallback anchors the card. Coverage and claim badges sit directly on the image; brand, product, model, coverage dates, serial context, files, notes, and the next claim action follow in a compact ledger below. Hover lifts the full record while the image scales subtly, making the whole docket feel actionable without hiding its links.

### Attention Link

An attention link is a full-width, label-first navigation row with a square count or icon marker, one concrete next item, and a directional affordance. Claim links use the Exception Wash on hover; expiring-coverage links use the Reference Blue Wash. They lead to dedicated affected-record pages, while inventory filtering stays inside the explicitly labeled Filter & Sort control.

## Do's and Don'ts

### Do:

- **Do** use Safety Orange only for an active exception, current step, keyboard focus, or decisive action.
- **Do** keep ordinary working surfaces square, separated by one-pixel Routing Rules.
- **Do** lead product records with a confirmed image or the implemented neutral fallback, then pair it with coverage and claim detail.
- **Do** keep keyboard targets at least 44px high and preserve the global 3px focus outline.
- **Do** collapse wide ledgers into a single readable column before reducing type or touch targets.
- **Do** pair every semantic color with explicit status language.

### Don't:

- **Don't** turn inventory and claim state into a generic grid of detached metric cards.
- **Don't** spread Safety Orange across passive decoration or large ambient backgrounds.
- **Don't** apply rounded dashboard cards, pill-shaped controls, or soft SaaS chrome to ordinary working surfaces.
- **Don't** literalize the Domino name with bounty-hunter costumes, wanted-poster typography, or noir props.
- **Don't** hide claim guidance, supporting documents, or the next action behind ambiguous icon-only controls.
- **Don't** rely on hover, motion, or color alone to reveal critical state.
