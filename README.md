# AccessLens – WCAG 2.2 Accessibility Auditor

A Chrome extension (Manifest V3) that runs WCAG-oriented checks in the page and shows results in a React popup. A standalone colour contrast checker page is also included.

---

## Project structure

```
web_accessibility копія/
├── manifest.json              ← Extension manifest (popup → popup-dist)
├── package.json               ← npm scripts and dependencies (root; Vite project)
├── vite.config.js             ← Vite config (root: `popup-react`, out: `popup-dist`)
├── background.js              ← Service worker (routes RUN_AUDIT, storage)
├── content.js                 ← Audit engine + overlay messaging (injected on pages)
├── overlay.css                ← Overlay / spotlight styles (content script + popup injection)
├── contrast-checker.html      ← Standalone colour contrast tool (open in any browser)
├── popup-react/               ← Popup UI source (edit here)
│   ├── index.html
│   ├── tsconfig.json
│   └── src/
│       ├── App.tsx            ← Popup UI (TypeScript + React)
│       ├── main.jsx           ← React entry
│       ├── popup.css
│       ├── vite-env.d.ts      ← Vite client types
│       └── types/
│           └── audit.ts       ← Shared types for audit results / issues
└── popup-dist/                ← Production build output (do not edit; reload extension after build)
```

---

## Popup development (React + TypeScript)

From the **repository root** (where `package.json` and `vite.config.js` live):

```bash
npm install
npm run build
```

- Edit the popup under `popup-react/src/` (`App.tsx`, styles, `types/audit.ts`).
- Build output is written to `popup-dist/`; `manifest.json` loads `popup-dist/index.html`.

Optional typecheck (no emit):

```bash
npx tsc -p popup-react --noEmit
```

Local UI preview (browser only; Chrome APIs are not available here):

```bash
npm run dev
```

Preview the production bundle:

```bash
npm run preview
```

---

## Load in Chrome (developer mode)

1. Open Chrome and go to `chrome://extensions`
2. Turn on **Developer mode** (top right)
3. Click **Load unpacked**
4. Select this project folder (the one that contains `manifest.json`)
5. Use the AccessLens toolbar icon on a normal webpage
6. Open the popup → **Scan page** (or restore the last result from extension storage)

---

## Release checklist

1. **Build the popup:** `npm install` if dependencies changed, then `npm run build` so `popup-dist/` matches `popup-react/src/`.
2. **Reload the extension:** on `chrome://extensions`, use **Reload** for AccessLens (or load unpacked again).
3. **Smoke test on a normal page:** use a regular `https://` site (not `chrome://`, the Web Store, or other restricted URLs).
   - Run **Scan page**; confirm score, stats, filter tabs, and issue list.
   - **Export JSON** downloads a report (issues include `selector` targets from the auditor).
   - **SR overlay ON/OFF:** tooltips/spotlight on hover/focus where injection is allowed; toggle off clears overlay behaviour.

---

## What gets audited

These checks map to the routines in `content.js` (see `runAudit()`). They are heuristics: they help find common problems but do not guarantee WCAG conformance.

| Area | WCAG (typical) | What it checks |
|------|----------------|----------------|
| Text contrast | 1.4.3 | Sampled visible text nodes vs effective background (AA ratios) |
| Non-text contrast | 1.4.11 | UI borders/focus rings vs background |
| Images | 1.1.1 | Missing or suspicious `alt` on `<img>` |
| Headings | 1.3.1 | Missing H1, multiple H1s, skipped levels, empty headings |
| Landmarks | 1.3.6 | Missing main/nav/header/footer-style regions, duplicate `<main>`, unlabelled duplicate navs |
| Page language | 3.1.1 | Missing or suspicious `lang` on `<html>` |
| Focus visibility | 2.4.7 | `:focus` styles that remove outline without replacement |
| Form controls | 1.3.1 | Inputs without label / `aria-label` / `aria-labelledby` |
| Links | 2.4.4 | Empty links; generic text (“click here”, “read more”, …) |
| Zoom | 1.4.4 | Viewport meta blocking zoom (`user-scalable=no`, `maximum-scale` 0/1) |
| ARIA roles | 4.1.1 | Invalid `[role]` values |
| Keyboard | 2.1.1 / 2.4.3 | Interactive-looking elements not keyboard-focusable; positive `tabindex` |
| Buttons | 4.1.2 | Unnamed `<button>` / button inputs; `div`/`span` with `onclick` but no button semantics |
| Tables | 1.3.1 | Tables without `<th>`; `<th>` without `scope` |
| Clickable UI | 4.1.2 | `onclick` without semantics; `cursor:pointer` on non-controls |
| Skip link | 2.4.1 | Heuristic: skip / `#main`-style link not found |

The extension can also append a **focus lost** finding when focus disappears after interaction (storage merge in `content.js`), separate from a full scan.

---

## Scoring

`score = 100 − (errors × 8) − (warnings × 3)`, clamped to 0–100.

- **80–100** — Good accessibility  
- **50–79** — Needs improvement  
- **0–49** — Poor accessibility  

---

## Contrast checker

Open `contrast-checker.html` in any browser (no extension required).

- Foreground / background via picker or hex  
- Preview for body, large text, badges, links  
- WCAG AA / AAA and large-text thresholds  
- Suggested foreground colours when AA fails  

---

## Export

**Export JSON** in the popup downloads the full `AuditResult` payload: URL, title, scan time, score, counts, and all issues (each with `id`, `wcag`, `type`, `title`, `description`, `selector`, `fix`).
