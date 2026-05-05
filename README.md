# AccessLens – WCAG 2.2 Accessibility Auditor

A Chrome extension for WCAG 2.2 accessibility audits. Also includes a standalone colour contrast checker tool.

---

## Project Structure

```
web_accessibility копія/
├── manifest.json              ← Chrome Extension Manifest v3
├── background.js              ← Service worker (message router)
├── content.js                 ← DOM audit engine (runs on page)
├── overlay.css                ← Injected overlay/tooltip styles
├── contrast-checker.html      ← Standalone colour contrast tool
├── popup-react/               ← React popup source (edit here)
│   ├── index.html
│   └── src/
│       ├── App.jsx
│       ├── main.jsx
│       └── popup.css
└── popup-dist/                ← Built popup bundle (loaded by Chrome)
```

---

## Popup Development (React)

Install dependencies and build the popup:

```bash
npm install
npm run build
```

- Edit popup code in `popup-react/src/`.
- Build output goes to `popup-dist/`.
- `manifest.json` points to `popup-dist/index.html`.

For local UI development only:

```bash
npm run dev
```

---

## Load in Chrome (Developer Mode)

1. Open Chrome and go to `chrome://extensions`
2. Enable **Developer mode** (toggle, top right)
3. Click **Load unpacked**
4. Select this project folder
5. The AccessLens icon will appear in your toolbar
6. Navigate to any page and click the icon → **Scan page**

---

## Release checklist

Before you ship or hand off a build, run through this short pass:

1. **Build the popup:** from the project folder, run `npm install` (if dependencies changed) and `npm run build` so `popup-dist/` matches `popup-react/src/`.
2. **Reload the extension:** open `chrome://extensions`, find AccessLens, click **Reload** (or remove and **Load unpacked** again on this folder).
3. **Smoke test on a normal page:** use a regular `https://` site (not `chrome://`, the Web Store, or other restricted pages).
   - Open the popup and run **Scan page**; confirm score, tabs, and issue list appear.
   - Click **Export JSON** and confirm the file downloads with sensible content.
   - Toggle **SR overlay ON**, move the mouse over a few elements, and confirm tooltip + spotlight appear; toggle off and confirm they disappear.

---

## What Gets Audited

| Rule        | WCAG     | What it checks |
|-------------|----------|----------------|
| Image alt   | 1.1.1    | `<img>` elements missing `alt` attribute |
| Form labels | 1.3.1    | Inputs without `<label>`, `aria-label`, or `aria-labelledby` |
| Headings    | 1.3.1    | Missing H1, multiple H1s, skipped heading levels |
| Contrast    | 1.4.3    | Text/background colour contrast ratio (AA: 4.5:1, large: 3:1) |
| Zoom        | 1.4.4    | Viewport `user-scalable=no` or `maximum-scale=1` |
| Autoplay    | 1.4.2    | `<video autoplay>` or `<audio autoplay>` without controls |
| Reflow      | 1.4.10   | Inline fixed-pixel widths >400px |
| Keyboard    | 2.1.1    | `onclick` on non-interactive elements |
| Keyboard    | 2.1.2    | Potential keyboard traps in dialogs |
| Skip nav    | 2.4.1    | Missing skip-to-main link |
| Page title  | 2.4.2    | Empty or absent `<title>` |
| Links       | 2.4.4    | Empty links, vague link text (click here, read more…) |
| Language    | 3.1.1    | Missing `lang` attribute on `<html>` |
| ARIA roles  | 4.1.1    | Invalid role values |
| ARIA KB     | 4.1.2    | Interactive ARIA roles without `tabindex` |
| Focus       | 2.4.7    | CSS `outline:none` on `:focus` |

---

## Scoring

`score = 100 − (errors × 8) − (warnings × 3)`, clamped to 0–100.

- **80–100** Good accessibility
- **50–79** Needs improvement
- **0–49**  Poor accessibility

---

## Contrast Checker

Open `contrast-checker.html` directly in any browser — no extension needed.

- Pick foreground and background colours via colour picker or hex input
- Live preview with large text, body text, badges, and links
- WCAG AA (4.5:1), AAA (7.0:1), AA Large (3:1), AAA Large (4.5:1) levels
- Suggested compliant foreground colours when failing AA

---

## Export

Click **Export JSON** in the popup to download a full audit report including all issue details, fix suggestions, and element selectors.
