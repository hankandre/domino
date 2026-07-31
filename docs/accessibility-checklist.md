# Accessibility release checklist

Run this short manual pass after `bun run test:browser` succeeds. Use current
Chrome or Chromium plus at least one screen reader available on the release
operator's platform (VoiceOver, NVDA, or Orca). Record the browser, assistive
technology, date, and result in the release-candidate checklist.

## Keyboard and focus

- Sign in locally and with the Pocket ID link using only the keyboard.
- Traverse the desktop sidebar and mobile navigation drawer. Opening the drawer
  moves focus into it, Escape closes it, and closing returns focus to the menu
  button.
- Open Filter & sort, change a preset, clear search, and reach every inventory
  result in a predictable order. Focus is always visible.
- Create and edit a product, warranty, claim, note, image, and attachment.
  Fieldsets and legends announce related choices; invalid fields identify the
  problem; focus is not trapped.
- Approve a device, customize permissions, and choose claims. Preset state and
  manual selection are understandable without color.
- Open and close every `details` disclosure and destructive confirmation.

## Announcements and semantics

- Confirm each asynchronous action announces its pending label and then a
  success or recoverable error message. Check uploads, Paperless search/link,
  image discovery, notes, record edits, claim updates, device approval, and
  service-account revocation.
- Confirm each page has one main landmark, a unique first-level heading, and
  headings that do not skip levels within a section.
- Read product coverage, open-claim attention, claim instructions, required
  evidence, timelines, document state, and empty states with the screen reader.
- Verify long document names are spoken in full and wrap without hiding their
  open/remove controls.

## Reflow and preferences

- At 320 CSS pixels wide, exercise the inventory, product, claim, documents,
  settings, access, sign-in, and device-approval pages with no horizontal page
  scrolling.
- At a desktop viewport, zoom to 200% and repeat the same primary flows. Content
  reflows without overlap, clipping, or controls hidden off-screen.
- Enable the operating system's reduced-motion preference. Product cards,
  navigation, and hover affordances stop nonessential motion.
- Check light/default colors and forced-colors or high-contrast mode. Status,
  selection, validation, and focus remain distinguishable without relying on
  color alone.

## Files and touch targets

- Activate every visible link, button, input, select, summary, radio, checkbox,
  and file-picker label near its edge. Effective targets are at least 44 by 44
  CSS pixels and do not overlap adjacent actions.
- Attach a valid file, an oversized file, an unsupported file, and cancel the
  picker. The UI always returns to an operable state with a specific message.

Any failed item blocks release unless it is documented in the release-candidate
checklist with impact, workaround, owner, and follow-up milestone.
