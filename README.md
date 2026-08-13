# RSVP Reader

A speed-reading app built around **RSVP** (Rapid Serial Visual Presentation) with
**ORP** (Optimal Recognition Point) highlighting. Words are presented one frame at a
time, each anchored so that its recognition point sits at a fixed spot on screen —
the eye stops moving, and reading speed is limited only by recognition.

Reads pasted text, articles fetched from a URL, and `.txt` / `.epub` / `.pdf` files.

## Running it

```bash
npm install
npm run dev        # http://localhost:3000
```

```bash
npm run build      # production build
npm start          # serve the build
npm test           # unit tests for the reading engine
npm run typecheck  # tsc --noEmit
```

## Deploying

**Vercel via Git:** import this repository. Next.js is auto-detected, the defaults
are correct, and no environment variables are required.

**Vercel from a terminal:**

```bash
npx vercel        # preview
npx vercel --prod # production
```

`/api/extract` is the only server-side code and runs on the Node runtime (it needs
`jsdom`, which cannot run on the edge). Everything else is static or client-side, so
the rest of the app works from the CDN.

## How it works

### ORP — `src/lib/orp.ts`

For a word of length `N` the pivot letter is at 1-based position
`floor((N - 1) / 3) + 1`. Two refinements on top of the raw formula:

- **Leading punctuation is skipped** when locating the pivot, so `"hello` highlights
  the same letter as `hello` instead of landing on the quote mark.
- **The pivot index is capped** (default 4). Uncapped, a 20-letter word pushes the
  pivot so far right that the preceding text runs off the left edge of the display.

Rendering happens in `WordDisplay.tsx` as a three-column grid — `1fr | auto | 1fr` —
with the pivot as the middle column. Both outer columns are equal width and their
text grows *away* from the centre, so the pivot is pixel-identical between frames
without measuring any text. That is why a monospaced font is offered as a preference
but is not required for correct alignment.

Multi-word frames anchor on the longest word in the frame: it is the most expensive
one to recognise, and anchoring it keeps the frame visually balanced.

### Timing — `src/hooks/useRsvpPlayer.ts`

The loop runs on `requestAnimationFrame`, not `setInterval`. At 600 WPM a frame lasts
100 ms, and `setInterval` drifts by whole frames under load, which reads as a stutter.
Each frame instead stores an absolute deadline and advances on the first repaint past
it, so error does not accumulate. If the loop falls more than one frame behind — a
backgrounded tab — it resynchronises to the present rather than racing to catch up.

Playback pauses automatically when the tab is hidden.

### Pacing — `src/lib/pacing.ts`

Base duration is `60000 / WPM`, modulated by:

| Condition                         | Multiplier |
| --------------------------------- | ---------- |
| Comma, semicolon, colon           | ×1.5       |
| Full stop, question, exclamation  | ×2.0       |
| End of paragraph                  | ×2.5       |
| Words over 8 letters              | ×1.05 per extra letter, capped at ×1.6 |
| Tokens containing digits          | ×1.3       |

In a multi-word frame only the *final* word's punctuation applies — an interior comma
should not stop a frame the reader is taking in as one unit. Smart pacing can be
switched off for uniform timing.

### Content import

| Source | Where it runs | Library |
| ------ | ------------- | ------- |
| Paste  | Client        | — |
| URL    | Server (`/api/extract`) | `@mozilla/readability` + `jsdom` |
| EPUB   | Client        | `jszip` + `DOMParser` |
| PDF    | Client        | `pdfjs-dist` |
| TXT/MD | Client        | — |

URL extraction has to be server-side: the browser cannot fetch arbitrary origins
because of CORS, and `jsdom` is Node-only. The endpoint validates that the target is
a public `http(s)` address **before and after redirects**, caps the download at 5 MB,
and times out at 15 s — without those checks it would be an SSRF primitive against
the server's own network.

EPUB parsing walks the OPF spine with the browser's own `DOMParser` rather than
using a full EPUB rendering engine. Only text is ever needed, never a paginated
layout, so the heavier dependency would buy nothing.

PDF pages arrive from pdf.js as positioned glyph runs, not lines. `assemblePage`
rebuilds lines from baseline Y positions and infers paragraph breaks from gaps larger
than 1.5× the median line spacing, then rejoins words hyphenated across lines. A
scanned PDF with no text layer reports that it needs OCR rather than silently
producing an empty document.

### Storage

Settings go to `localStorage` through Zustand's `persist` middleware — small, and
readable synchronously on first paint. Documents go to **IndexedDB**: a single EPUB
easily exceeds the ~5 MB `localStorage` quota. Reading position is written back on a
1 s debounce, since playback fires a progress event every frame.

The IndexedDB wrapper in `src/lib/storage.ts` is deliberately dependency-free and
narrow, so the storage layer can be swapped for SQLite or AsyncStorage in a Capacitor
or React Native shell without touching anything else.

## Controls

| Key | Action | Touch |
| --- | ------ | ----- |
| `Space` / `K` | Play / pause | Tap |
| `←` / `→` | Skip 10 words | Swipe right / left |
| `↑` / `↓` | Speed ±25 WPM | Swipe up / down |
| `R` | Restart | — |
| `S` | Jump to sentence start | — |
| `T` | Toggle full-text view | — |
| `Esc` | Back to the library | — |

While playback runs the interface fades out (Zen mode) and returns on any input.

## Settings

Speed 100–1000 WPM in steps of 25 · 1–3 words per frame · text size 24–140 px ·
sans / serif / mono · dark, light, sepia and high-contrast themes · smart pacing ·
Bionic Reading in the full-text view · focus guides.

Themes are CSS custom properties switched by a `data-theme` attribute on `<html>`,
applied by an inline script before first paint so there is no flash of the wrong
theme on load.

## Accessibility

The RSVP surface is deliberately **not** a live region: at 600 WPM it would
interrupt a screen reader ten times a second. The full-text view carries the same
content as ordinary self-paced prose, and is the accessible path through any
document. All controls are labelled and keyboard-reachable, and the high-contrast
theme is available for low-vision use.

## Tests

53 unit tests cover the reading engine — ORP splitting (including punctuation and
pivot capping), tokenization and chunking, pause classification, pacing multipliers,
and Bionic Reading splits. The chunker is tested to cover every token exactly once at
every frame width, and Bionic paragraph splitting is checked to stay index-aligned
with the tokenizer, since the full-text view maps the RSVP cursor onto it.

```bash
npm test
```

## Layout

```
src/
  app/
    api/extract/route.ts    URL fetching + Readability, with SSRF guards
    layout.tsx              theme bootstrap, PWA metadata
    page.tsx
    globals.css             theme tokens, control styling
  components/
    HomeScreen.tsx          shell: import + library, or the reader
    InputPanel.tsx          paste / URL / drag-and-drop file import
    Library.tsx             recent documents with saved progress
    ReaderView.tsx          Zen mode, controls, shortcuts, gestures
    WordDisplay.tsx         the ORP three-column render
    Scrubber.tsx            position, percentage, time remaining
    SettingsPanel.tsx       preferences sheet
    BionicText.tsx          full-text view with bionic emphasis
  hooks/
    useRsvpPlayer.ts        rAF playback loop, seeking, skipping
    useSwipe.ts             touch gestures
  lib/
    orp.ts  tokenizer.ts  pacing.ts  bionic.ts  storage.ts
    parsers/  txt.ts  epub.ts  pdf.ts
  store/useReaderStore.ts   settings + library state
  types/index.ts
tests/                      orp, tokenizer, pacing, bionic
```

## Notes on the stack

Next.js 16 with the App Router, React 19, Tailwind CSS 4, Zustand 5, TypeScript.

The only server-side code is the URL extraction route. Everything else — parsing,
playback, storage — runs in the browser, so the app works offline once loaded and can
be wrapped by Capacitor or shipped as a PWA (a web manifest is included) with the
extraction endpoint as the sole piece needing a host.
