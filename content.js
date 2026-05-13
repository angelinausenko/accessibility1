/**
 * AccessLens v2 — Content Script
 * ─────────────────────────────────────────────────────────────────────────────
 * FR-1.1  Text contrast (4.5:1 normal, 3:1 large)
 * FR-1.2  Non-text contrast for icons/borders (3:1)
 * FR-2.1  Alt text validation (missing, empty, suspicious)
 * FR-2.2  Heading hierarchy
 * FR-2.3  Semantic landmarks
 * FR-4.1  Document language
 * Focus   Loss detection, wrong-element return, spotlight overlay
 * Tooltip ARIA role/name/state on hover
 * Overlay Dim + highlight active element
 */

(() => {
  // ── Guard: don't double-inject ─────────────────────────────────────────────
  if (window.__accesslensLoaded) return;
  window.__accesslensLoaded = true;

  // ═══════════════════════════════════════════════════════════════════════════
  // COLOUR UTILITIES
  // ═══════════════════════════════════════════════════════════════════════════

  const _colorCache = new Map();

  function parseColor(str) {
    if (_colorCache.has(str)) return _colorCache.get(str);
    const c = document.createElement('canvas');
    c.width = c.height = 1;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, 1, 1);
    ctx.fillStyle = str;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    const result = { r, g, b };
    _colorCache.set(str, result);
    return result;
  }

  function luminance({ r, g, b }) {
    return [r, g, b].reduce((acc, v, i) => {
      const s = v / 255;
      const lin = s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      return acc + lin * [0.2126, 0.7152, 0.0722][i];
    }, 0);
  }

  function contrastRatio(c1, c2) {
    const L1 = luminance(c1), L2 = luminance(c2);
    return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
  }

  function effectiveBg(el) {
    let node = el;
    while (node && node !== document.documentElement) {
      const bg = getComputedStyle(node).backgroundColor;
      if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') return bg;
      node = node.parentElement;
    }
    return 'rgb(255,255,255)';
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // AUDIT ENGINE
  // ═══════════════════════════════════════════════════════════════════════════

  const issues = [];
  let passCount = 0;

  function withStorageLocal(action) {
    try {
      if (!chrome?.runtime?.id || !chrome?.storage?.local) return null;
      return action(chrome.storage.local);
    } catch (_) {
      // Happens when extension reload invalidates old content-script context.
      return null;
    }
  }

  function fail(id, wcag, type, title, description, selector, fix) {
    issues.push({ id, wcag, type, title, description, selector, fix });
  }
  function pass() { passCount++; }

  // ── FR-1.1 Text contrast ───────────────────────────────────────────────────
  function auditTextContrast() {
    const candidates = Array.from(document.querySelectorAll(
      'p, span, a, button, label, h1, h2, h3, h4, h5, h6, li, td, th, div, em, strong, small, caption'
    )).filter(el => {
      const text = el.textContent.trim();
      return text.length > 2 && el.children.length === 0 && isVisible(el);
    }).slice(0, 80);

    let textFails = 0, textPasses = 0;
    const failSamples = [];

    candidates.forEach(el => {
      const style = getComputedStyle(el);
      try {
        const fg = parseColor(style.color);
        const bg = parseColor(effectiveBg(el));
        const ratio = contrastRatio(fg, bg);
        const fontSize = parseFloat(style.fontSize);
        const isBold = parseInt(style.fontWeight) >= 700;
        const isLarge = fontSize >= 18 || (isBold && fontSize >= 14);
        const required = isLarge ? 3.0 : 4.5;
        const level = isLarge ? 'large' : 'normal';

        if (ratio < required) {
          textFails++;
          if (failSamples.length < 3) {
            failSamples.push(`${el.tagName.toLowerCase()} (${ratio.toFixed(2)}:1, need ${required}:1 for ${level} text)`);
          }
        } else {
          textPasses++;
        }
      } catch (_) {}
    });

    if (textFails > 0) {
      fail('text-contrast', '1.4.3', 'error',
        'Insufficient text contrast',
        `${textFails} text element(s) fail WCAG AA contrast. Required: 4.5:1 normal, 3:1 large text.\n\nSamples: ${failSamples.join('; ')}`,
        `Low-contrast text — ${textFails} element(s)`,
        'Increase text/background colour contrast. AA minimum: 4.5:1 for body text, 3:1 for large text (≥18px or bold ≥14px).'
      );
    }
    if (textPasses > 0) pass();
  }

  // ── FR-1.2 Non-text contrast ───────────────────────────────────────────────
  function auditNonTextContrast() {
    // Input borders
    const inputs = Array.from(document.querySelectorAll('input, select, textarea')).filter(isVisible).slice(0, 30);
    let borderFails = 0;
    inputs.forEach(el => {
      try {
        const style = getComputedStyle(el);
        const borderColor = style.borderColor || style.borderTopColor;
        const bg = parseColor(effectiveBg(el.parentElement || el));
        const border = parseColor(borderColor);
        const ratio = contrastRatio(border, bg);
        if (ratio < 3.0) borderFails++;
      } catch (_) {}
    });

    // SVG icons (check fill vs background)
    const svgs = Array.from(document.querySelectorAll('svg')).filter(isVisible).slice(0, 20);
    let iconFails = 0;
    svgs.forEach(svg => {
      try {
        const style = getComputedStyle(svg);
        const fill = style.fill || style.color;
        if (!fill || fill === 'none') return;
        const bg = parseColor(effectiveBg(svg.parentElement || svg));
        const fg = parseColor(fill);
        const ratio = contrastRatio(fg, bg);
        if (ratio < 3.0) iconFails++;
      } catch (_) {}
    });

    if (borderFails > 0) {
      fail('non-text-border', '1.4.11', 'error',
        'Input borders fail non-text contrast',
        `${borderFails} input border(s) have contrast below 3:1 against their background. Users with low vision may not see the field boundaries.`,
        `input/select/textarea border — ${borderFails} element(s)`,
        'Ensure all input borders have ≥3:1 contrast against surrounding background.'
      );
    } else { pass(); }

    if (iconFails > 0) {
      fail('non-text-icon', '1.4.11', 'warning',
        'SVG icons may fail non-text contrast',
        `${iconFails} SVG icon(s) have fill contrast below 3:1. Graphical elements must meet 3:1 contrast to be perceivable.`,
        `svg fill — ${iconFails} element(s)`,
        'Increase icon fill colour contrast to at least 3:1 against its background.'
      );
    } else { pass(); }
  }

  // ── FR-2.1 Alt text validation ─────────────────────────────────────────────
  function auditAltText() {
    const images = Array.from(document.querySelectorAll('img'));
    const suspiciousPatterns = /\.(png|jpg|jpeg|gif|webp|svg|bmp)$/i;
    const tooShort = /^(img|image|photo|picture|graphic|icon|logo|banner|\.|\-)$/i;

    let missing = 0, suspicious = 0, decorativeOk = 0, descriptiveOk = 0;
    const missingSamples = [];
    const suspSamples = [];

    images.forEach(img => {
      if (!isVisible(img) && img.getAttribute('role') === 'presentation') { decorativeOk++; return; }
      const alt = img.getAttribute('alt');
      const role = img.getAttribute('role');
      const src = img.getAttribute('src') || '';
      const filename = src.split('/').pop();

      if (alt === null) {
        missing++;
        if (missingSamples.length < 3) missingSamples.push(filename || img.src.slice(0, 50));
      } else if (alt === '' || role === 'presentation' || role === 'none') {
        decorativeOk++;
      } else if (suspiciousPatterns.test(alt) || tooShort.test(alt.trim())) {
        suspicious++;
        if (suspSamples.length < 3) suspSamples.push(`alt="${alt}"`);
      } else {
        descriptiveOk++;
      }
    });

    if (missing > 0) {
      fail('alt-missing', '1.1.1', 'error',
        'Images missing alt attribute',
        `${missing} image(s) have no alt attribute. Screen readers will read the file path.\n\nMissing: ${missingSamples.join(', ')}`,
        `img:not([alt]) — ${missing} element(s)`,
        'Add alt="" for decorative images. Add a meaningful description for informative images.'
      );
    } else { pass(); }

    if (suspicious > 0) {
      fail('alt-suspicious', '1.1.1', 'warning',
        'Potentially unhelpful alt text',
        `${suspicious} image(s) have alt text that looks like a filename or placeholder.\n\nFound: ${suspSamples.join(', ')}`,
        `img with filename/generic alt — ${suspicious} element(s)`,
        'Replace filename-style or single-word alt text with a human-readable description of the image content.'
      );
    } else if (descriptiveOk > 0) { pass(); }
  }

  // ── FR-2.2 Heading hierarchy ───────────────────────────────────────────────
  function auditHeadings() {
    const headings = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6')).filter(isVisible);

    if (headings.length === 0) {
      fail('no-headings', '1.3.1', 'warning',
        'No heading structure',
        'Page has no heading elements (h1–h6). Headings create a navigable document outline for screen reader users.',
        'No h1–h6 found',
        'Add a logical heading hierarchy. Start with one <h1> for the page title, then use h2, h3 etc. for sections.'
      );
      return;
    }

    const h1s = headings.filter(h => h.tagName === 'H1');
    if (h1s.length === 0) {
      fail('heading-no-h1', '1.3.1', 'error',
        'No H1 heading',
        'Every page should have exactly one <h1> that describes its main purpose.',
        'Missing <h1>',
        'Add a single <h1> at the top of the page content.'
      );
    } else if (h1s.length > 1) {
      fail('heading-multi-h1', '1.3.1', 'warning',
        `Multiple H1 headings (${h1s.length})`,
        `Found ${h1s.length} <h1> elements. Typically only one is appropriate per page, as it designates the main topic.`,
        `${h1s.length} × <h1>`,
        'Demote additional h1 elements to h2.'
      );
    } else { pass(); }

    // Check for skipped levels
    const skips = [];
    let prev = 0;
    headings.forEach(h => {
      const level = parseInt(h.tagName[1]);
      if (prev > 0 && level > prev + 1) {
        skips.push(`h${prev} → h${level} ("${h.textContent.trim().slice(0, 40)}")`);
      }
      prev = level;
    });

    if (skips.length > 0) {
      fail('heading-skip', '1.3.1', 'warning',
        'Heading levels skipped',
        `${skips.length} heading level gap(s) detected. Jumping from h2 to h4, for example, confuses the document outline.\n\nGaps: ${skips.join('; ')}`,
        'Heading level gaps',
        'Ensure headings increment by one level at a time (h1 → h2 → h3...).'
      );
    } else { pass(); }

    // Empty headings
    const emptyHeadings = headings.filter(h => !h.textContent.trim());
    if (emptyHeadings.length > 0) {
      fail('heading-empty', '1.3.1', 'error',
        'Empty heading elements',
        `${emptyHeadings.length} heading element(s) are present but contain no text. Screen readers announce them confusingly.`,
        `Empty h1–h6 — ${emptyHeadings.length} element(s)`,
        'Remove empty headings or add meaningful content.'
      );
    } else { pass(); }
  }

  // ── FR-2.3 Semantic landmarks ──────────────────────────────────────────────
  function auditLandmarks() {
    const required = [
      { selector: 'main, [role="main"]',           name: '<main>',       wcag: '1.3.6' },
      { selector: 'nav, [role="navigation"]',       name: '<nav>',        wcag: '1.3.6' },
      { selector: 'header, [role="banner"]',        name: '<header>',     wcag: '1.3.6' },
      { selector: 'footer, [role="contentinfo"]',   name: '<footer>',     wcag: '1.3.6' },
    ];

    const missing = required.filter(r => !document.querySelector(r.selector));
    const present = required.filter(r =>  document.querySelector(r.selector));

    if (missing.length > 0) {
      fail('landmarks-missing', '1.3.6', 'warning',
        `Missing landmark regions (${missing.map(m => m.name).join(', ')})`,
        `${missing.length} expected landmark(s) not found: ${missing.map(m => m.name).join(', ')}. Landmarks let screen reader users jump directly to page sections.`,
        missing.map(m => m.selector).join(', '),
        `Add the missing semantic HTML elements: ${missing.map(m => m.name).join(', ')}.`
      );
    }
    if (present.length > 0) pass();

    // Check for duplicate <main>
    const mains = document.querySelectorAll('main, [role="main"]');
    if (mains.length > 1) {
      fail('landmarks-multi-main', '1.3.6', 'error',
        `Multiple <main> elements (${mains.length})`,
        'Only one <main> landmark is allowed per page. Having multiple confuses the page structure.',
        `${mains.length} × main`,
        'Remove duplicate <main> elements. Only one content landmark is allowed.'
      );
    } else { pass(); }

    // Multiple navs should be labelled
    const navs = Array.from(document.querySelectorAll('nav, [role="navigation"]'));
    const unlabelledNavs = navs.filter(n => !n.getAttribute('aria-label') && !n.getAttribute('aria-labelledby'));
    if (navs.length > 1 && unlabelledNavs.length > 0) {
      fail('landmarks-nav-label', '1.3.6', 'warning',
        'Multiple <nav> without labels',
        `Found ${navs.length} navigation landmarks but ${unlabelledNavs.length} have no aria-label. Users cannot distinguish between them.`,
        `nav without aria-label — ${unlabelledNavs.length} element(s)`,
        'Add aria-label="Primary navigation", aria-label="Breadcrumb" etc. to each <nav>.'
      );
    } else { pass(); }
  }

  // ── FR-4.1 Document language ───────────────────────────────────────────────
  function auditLanguage() {
    const lang = document.documentElement.getAttribute('lang');
    if (!lang || !lang.trim()) {
      fail('lang-missing', '3.1.1', 'error',
        'Missing lang attribute on <html>',
        'Screen readers need the lang attribute to select the correct pronunciation engine and language rules.',
        '<html lang="..."> missing',
        'Add a valid BCP 47 language tag, e.g. lang="en", lang="pl", lang="de".'
      );
    } else {
      // Basic BCP 47 format check
      const validBCP47 = /^[a-zA-Z]{2,8}(-[a-zA-Z0-9]{2,8})*$/.test(lang.trim());
      if (!validBCP47) {
        fail('lang-invalid', '3.1.1', 'warning',
          `Potentially invalid lang value: "${lang}"`,
          `The lang attribute value "${lang}" may not be a valid BCP 47 language tag.`,
          `<html lang="${lang}">`,
          'Use a valid BCP 47 tag like "en", "en-US", "pl", "de", "fr-CA".'
        );
      } else { pass(); }
    }
  }

  // ── Additional rules ───────────────────────────────────────────────────────
  function auditFocusOutline() {
    let removed = false;
    try {
      for (const sheet of document.styleSheets) {
        try {
          for (const rule of sheet.cssRules || []) {
            if (rule.selectorText && rule.selectorText.includes(':focus')) {
              const o = rule.style && rule.style.outline;
              if (o === 'none' || o === '0') removed = true;
            }
          }
        } catch (_) {}
      }
    } catch (_) {}
    if (removed) {
      fail('focus-outline', '2.4.7', 'error',
        'Focus indicator removed via CSS',
        'A stylesheet sets outline: none on :focus, making keyboard focus invisible for sighted keyboard users.',
        ':focus { outline: none }',
        'Use :focus-visible to suppress outlines only for pointer users, while preserving them for keyboard users.'
      );
    } else { pass(); }
  }

  function auditFormLabels() {
    const inputs = Array.from(document.querySelectorAll(
      'input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=reset]):not([type=image]), select, textarea'
    )).filter(isVisible);
    let unlabeled = 0;
    inputs.forEach(el => {
      const id = el.getAttribute('id');
      const hasLabel = id && document.querySelector(`label[for="${CSS.escape(id)}"]`);
      const hasWrapping = el.closest('label');
      const hasAria = el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.getAttribute('title');
      if (!hasLabel && !hasWrapping && !hasAria) unlabeled++;
      else pass();
    });
    if (unlabeled > 0) {
      fail('form-labels', '1.3.1', 'error',
        'Form inputs missing labels',
        `${unlabeled} input(s) have no accessible label. Screen readers cannot identify the field's purpose.`,
        `Unlabeled input/select/textarea — ${unlabeled} element(s)`,
        'Add <label for="id">, wrap in <label>, or add aria-label/aria-labelledby.'
      );
    }
  }

  function auditLinks() {
    const links = Array.from(document.querySelectorAll('a[href]')).filter(isVisible);
    const vague = new Set(['click here','read more','here','more','learn more','details','link','go','continue','next','this']);
    let empty = 0, ambiguous = 0;
    links.forEach(a => {
      const text = (a.textContent || '').trim().toLowerCase();
      const ariaLabel = a.getAttribute('aria-label') || '';
      if (!text && !ariaLabel && !a.querySelector('img[alt]') && !a.getAttribute('title')) empty++;
      else if (!ariaLabel && vague.has(text)) ambiguous++;
      else pass();
    });
    if (empty > 0) fail('link-empty', '2.4.4', 'error', 'Empty link text', `${empty} link(s) have no accessible name.`, `<a> with no text — ${empty}`, 'Add descriptive text or aria-label.');
    if (ambiguous > 0) fail('link-vague', '2.4.4', 'warning', 'Vague link text', `${ambiguous} link(s) use generic text like "click here".`, `Generic link text — ${ambiguous}`, 'Use descriptive link text or aria-label with context.');
    if (empty === 0 && ambiguous === 0) pass();
  }

  function auditViewportZoom() {
    const meta = document.querySelector('meta[name="viewport"]');
    if (meta) {
      const content = meta.getAttribute('content') || '';
      if (content.includes('user-scalable=no') || /maximum-scale=[01]/.test(content)) {
        fail('viewport-zoom', '1.4.4', 'error',
          'Zoom prevented by viewport meta',
          'user-scalable=no or maximum-scale=1 prevents users with low vision from zooming.',
          'meta[name="viewport"]',
          'Remove user-scalable=no and maximum-scale restrictions.'
        );
      } else pass();
    } else pass();
  }

  function auditARIA() {
    const validRoles = new Set(['alert','alertdialog','application','article','banner','button','cell','checkbox','columnheader','combobox','complementary','contentinfo','definition','dialog','document','feed','figure','form','grid','gridcell','group','heading','img','link','list','listbox','listitem','log','main','marquee','math','menu','menubar','menuitem','menuitemcheckbox','menuitemradio','navigation','none','note','option','presentation','progressbar','radio','radiogroup','region','row','rowgroup','rowheader','scrollbar','search','searchbox','separator','slider','spinbutton','status','switch','tab','table','tablist','tabpanel','term','textbox','timer','toolbar','tooltip','tree','treegrid','treeitem']);
    const els = Array.from(document.querySelectorAll('[role]')).filter(isVisible);
    let invalid = 0;
    els.forEach(el => {
      const role = el.getAttribute('role');
      if (role && !validRoles.has(role)) invalid++;
      else pass();
    });
    if (invalid > 0) fail('aria-invalid', '4.1.1', 'error', 'Invalid ARIA roles', `${invalid} element(s) use unrecognised role values.`, `[role] invalid — ${invalid}`, 'Use only valid WAI-ARIA roles.');
  }

  function auditKeyboardNavigation() {
    const candidates = Array.from(document.querySelectorAll('a, button, input, textarea, select, [tabindex], [onclick]'))
      .filter(isVisible)
      .slice(0, 250);

    let notFocusable = 0;
    let positiveTabindex = 0;
    candidates.forEach(el => {
      const tabindexAttr = el.getAttribute('tabindex');
      const tabindex = tabindexAttr === null ? null : parseInt(tabindexAttr, 10);
      if (Number.isFinite(tabindex) && tabindex > 0) positiveTabindex++;

      if (!isKeyboardFocusable(el)) notFocusable++;
      else pass();
    });

    if (notFocusable > 0) {
      fail('keyboard-not-focusable', '2.1.1', 'error',
        'Interactive elements not keyboard-focusable',
        `${notFocusable} interactive element(s) cannot be reached with keyboard navigation.`,
        'a, button, input, textarea, select, [tabindex], [onclick]',
        'Use native interactive elements or add tabindex="0" and keyboard handlers (Enter/Space) where appropriate.'
      );
    }

    if (positiveTabindex > 0) {
      fail('keyboard-positive-tabindex', '2.4.3', 'warning',
        'Positive tabindex values detected',
        `${positiveTabindex} element(s) use tabindex greater than 0, which can create confusing focus order.`,
        '[tabindex]:not([tabindex="-1"]):not([tabindex="0"])',
        'Avoid positive tabindex. Keep DOM order logical and use tabindex="0" only when needed.'
      );
    } else if (notFocusable === 0 && candidates.length > 0) {
      pass();
    }
  }

  function auditButtonAccessibility() {
    const buttons = Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"], input[type="reset"]'))
      .filter(isVisible)
      .slice(0, 150);
    let namelessButtons = 0;
    buttons.forEach(el => {
      if (!hasAccessibleName(el)) namelessButtons++;
      else pass();
    });

    const clickableDivSpan = Array.from(document.querySelectorAll('div[onclick], span[onclick]'))
      .filter(isVisible)
      .slice(0, 150);
    let nonSemanticButtons = 0;
    clickableDivSpan.forEach(el => {
      if ((el.getAttribute('role') || '').toLowerCase() !== 'button') nonSemanticButtons++;
      else pass();
    });

    if (namelessButtons > 0) {
      fail('button-no-name', '4.1.2', 'error',
        'Buttons without accessible name',
        `${namelessButtons} button element(s) have no accessible name for assistive technologies.`,
        'button, input[type="button"], input[type="submit"], input[type="reset"]',
        'Provide visible text, aria-label, or aria-labelledby for every button.'
      );
    }

    if (nonSemanticButtons > 0) {
      fail('button-nonsemantic-click', '4.1.2', 'warning',
        'Clickable div/span missing button semantics',
        `${nonSemanticButtons} clickable div/span element(s) do not expose role="button".`,
        'div[onclick], span[onclick]',
        'Use <button> where possible, or add role="button", tabindex="0", and keyboard support.'
      );
    } else if (namelessButtons === 0 && (buttons.length > 0 || clickableDivSpan.length > 0)) {
      pass();
    }
  }

  function auditTables() {
    const tables = Array.from(document.querySelectorAll('table')).filter(isVisible).slice(0, 60);
    let noHeaders = 0;
    let missingScope = 0;
    tables.forEach(table => {
      const ths = Array.from(table.querySelectorAll('th'));
      if (ths.length === 0) {
        noHeaders++;
        return;
      }
      pass();
      ths.forEach(th => {
        const scope = (th.getAttribute('scope') || '').trim().toLowerCase();
        if (!scope) missingScope++;
        else pass();
      });
    });

    if (noHeaders > 0) {
      fail('table-no-headers', '1.3.1', 'error',
        'Table missing header cells',
        `${noHeaders} table(s) have no <th> headers, making row/column relationships unclear.`,
        'table:not(:has(th))',
        'Add <th> elements for header cells and associate data cells correctly.'
      );
    }

    if (missingScope > 0) {
      fail('table-th-scope-missing', '1.3.1', 'warning',
        'Table headers missing scope',
        `${missingScope} <th> element(s) are missing the scope attribute.`,
        'th:not([scope])',
        'Add scope="col" or scope="row" to header cells.'
      );
    } else if (tables.length > 0 && noHeaders === 0) {
      pass();
    }
  }

  function auditClickableSemantics() {
    const rolelessOnclick = Array.from(document.querySelectorAll('[onclick]'))
      .filter(el => isVisible(el) && !isSemanticallyInteractive(el) && !hasSemanticRole(el))
      .slice(0, 180);
    const pointerOnly = Array.from(document.querySelectorAll('div, span, p, li, section, article'))
      .filter(el => {
        if (!isVisible(el) || isSemanticallyInteractive(el) || hasSemanticRole(el)) return false;
        return getComputedStyle(el).cursor === 'pointer';
      })
      .slice(0, 180);

    if (rolelessOnclick.length > 0) {
      fail('clickable-no-semantics', '4.1.2', 'error',
        'Clickable elements without semantic role',
        `${rolelessOnclick.length} element(s) use onclick without semantic role or native interactive semantics.`,
        '[onclick] without role/semantic control',
        'Use semantic controls (<button>/<a>) or add appropriate role and keyboard interaction.'
      );
    }
    if (pointerOnly.length > 0) {
      fail('pointer-no-semantics', '4.1.2', 'warning',
        'Pointer-style elements may be non-interactive',
        `${pointerOnly.length} element(s) use cursor:pointer but are not semantic interactive controls.`,
        'Elements with cursor:pointer but no interactive semantics',
        'Reserve cursor:pointer for true controls and provide proper semantic roles if interactive.'
      );
    } else if (rolelessOnclick.length === 0) {
      pass();
    }
  }

  function auditSkipLink() {
    const links = Array.from(document.querySelectorAll('a[href^="#"]'));
    const skipLink = links.find(a => {
      const href = (a.getAttribute('href') || '').trim().toLowerCase();
      const text = (a.textContent || '').trim().toLowerCase();
      return href.startsWith('#') && (text.includes('skip') || href === '#main' || href === '#content' || href === '#main-content');
    });

    if (!skipLink) {
      fail('skip-link-missing', '2.4.1', 'warning',
        'No skip-to-content link found',
        'No in-page skip link was detected (for example href="#main"). Keyboard users benefit from a shortcut to main content.',
        'a[href^="#main"], a[href^="#content"], links containing "skip"',
        'Add a visible-on-focus "Skip to main content" link targeting the main content region.'
      );
      return;
    }
    pass();
  }

  // ── Helper: is element visible? ────────────────────────────────────────────
  function isVisible(el) {
    if (!el) return false;
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 || rect.height > 0;
  }

  function isDisabled(el) {
    return el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true';
  }

  function isKeyboardFocusable(el) {
    if (!el || isDisabled(el)) return false;
    const tag = el.tagName;
    const tabindexAttr = el.getAttribute('tabindex');
    if (tabindexAttr !== null) {
      const tabindex = parseInt(tabindexAttr, 10);
      if (Number.isFinite(tabindex)) return tabindex >= 0;
    }
    if (tag === 'A') return Boolean(el.getAttribute('href'));
    if (['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'].includes(tag)) return true;
    if (el.hasAttribute('contenteditable')) return true;
    return false;
  }

  function hasAccessibleName(el) {
    if (!el) return false;
    const ariaLabel = (el.getAttribute('aria-label') || '').trim();
    if (ariaLabel) return true;
    const labelledBy = (el.getAttribute('aria-labelledby') || '').trim();
    if (labelledBy) {
      const hasRefText = labelledBy.split(/\s+/).some(id => {
        const ref = document.getElementById(id);
        return Boolean(ref && (ref.textContent || '').trim());
      });
      if (hasRefText) return true;
    }
    const ownText = (el.textContent || '').trim();
    if (ownText) return true;
    const value = (el.getAttribute('value') || '').trim();
    return Boolean(value);
  }

  function hasSemanticRole(el) {
    return Boolean((el.getAttribute('role') || '').trim());
  }

  function isSemanticallyInteractive(el) {
    const tag = el.tagName;
    if (tag === 'A' && el.hasAttribute('href')) return true;
    return ['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'SUMMARY', 'DETAILS'].includes(tag);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RUN ALL AUDITS
  // ═══════════════════════════════════════════════════════════════════════════

  function runAudit() {
    issues.length = 0;
    passCount = 0;
    _colorCache.clear();

    auditTextContrast();
    auditNonTextContrast();
    auditAltText();
    auditHeadings();
    auditLandmarks();
    auditLanguage();
    auditFocusOutline();
    auditFormLabels();
    auditLinks();
    auditViewportZoom();
    auditARIA();
    auditKeyboardNavigation();
    auditButtonAccessibility();
    auditTables();
    auditClickableSemantics();
    auditSkipLink();

    const errors   = issues.filter(i => i.type === 'error').length;
    const warnings = issues.filter(i => i.type === 'warning').length;
    const score    = Math.max(0, Math.round(100 - errors * 8 - warnings * 3));

    const result = {
      url: location.href,
      title: document.title,
      scannedAt: new Date().toISOString(),
      score, errors, warnings, passes: passCount, issues,
    };
    withStorageLocal((storage) => storage.set({ auditResult: result }));
    return result;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FOCUS MONITOR
  // ═══════════════════════════════════════════════════════════════════════════

  let lastInteractedEl = null;
  let focusAlertTimer  = null;

  // Track what the user clicked / activated
  document.addEventListener('mousedown', e => { lastInteractedEl = e.target; }, true);
  document.addEventListener('keydown',   e => {
    if (e.key === 'Enter' || e.key === ' ') lastInteractedEl = document.activeElement;
  }, true);

  // Detect focus loss (focus lands on body/null after interaction)
  document.addEventListener('focusin', e => {
    const el = e.target;
    if (el === document.body || el === document.documentElement) return;
    // If a dialog just closed and focus went to body, catch next focusin
  }, true);

  document.addEventListener('focusout', e => {
    // Slight delay: see where focus lands
    setTimeout(() => {
      const active = document.activeElement;
      const lostToBody = !active || active === document.body || active === document.documentElement;
      if (lostToBody && lastInteractedEl) {
        showFocusAlert('Focus lost — expected return to trigger element');
        withStorageLocal((storage) => storage.get('auditResult', data => {
          const existing = data?.auditResult;
          if (!existing || !Array.isArray(existing.issues)) return;
          const already = existing.issues.find(i => i.id === 'focus-lost');
          if (!already) {
            existing.issues.unshift({
              id: 'focus-lost', wcag: '2.4.3', type: 'error',
              title: 'Focus lost after interaction',
              description: 'Focus moved to <body> after an interaction. Users who rely on keyboard navigation lose their place.',
              selector: lastInteractedEl.tagName.toLowerCase() + (lastInteractedEl.className ? '.' + [...lastInteractedEl.classList].join('.') : ''),
              fix: 'When closing a modal or removing an element, programmatically return focus to the trigger element: triggerEl.focus().'
            });
            existing.errors = Number(existing.errors || 0) + 1;
            existing.score = Math.max(0, Number(existing.score || 100) - 8);
            withStorageLocal((innerStorage) => innerStorage.set({ auditResult: existing }));
          }
        }));
      }
    }, 150);
  }, true);

  function showFocusAlert(msg) {
    let alert = document.getElementById('accesslens-focus-alert');
    if (!alert) {
      alert = document.createElement('div');
      alert.id = 'accesslens-focus-alert';
      alert.setAttribute('role', 'alert');
      alert.setAttribute('aria-live', 'assertive');
      document.body.appendChild(alert);
    }
    alert.textContent = '⚠ ' + msg;
    alert.classList.add('show');
    clearTimeout(focusAlertTimer);
    focusAlertTimer = setTimeout(() => alert.classList.remove('show'), 3500);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ARIA TOOLTIP (hover overlay showing role / name / state)
  // ═══════════════════════════════════════════════════════════════════════════

  let tooltipActive = false;
  let tooltipTimeout = null;
  let tooltip = null;

  function ensureTooltip() {
    if (document.getElementById('accesslens-tooltip')) return;
    tooltip = document.createElement('div');
    tooltip.id = 'accesslens-tooltip';
    tooltip.setAttribute('aria-hidden', 'true');
    document.body.appendChild(tooltip);
  }

  function getARIAInfo(el) {
    const role = el.getAttribute('role')
      || inferImplicitRole(el)
      || null;

    // Accessible name: aria-labelledby > aria-label > label > title > alt > text
    let name = '';
    const labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy) {
      name = labelledBy.split(/\s+/).map(id => {
        const ref = document.getElementById(id);
        return ref ? ref.textContent.trim() : '';
      }).join(' ').trim();
    }
    if (!name) name = el.getAttribute('aria-label') || '';
    if (!name && el.id) {
      const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (label) name = label.textContent.trim();
    }
    if (!name) name = el.getAttribute('title') || '';
    if (!name && el.tagName === 'IMG') name = el.getAttribute('alt') || '';
    if (!name) name = (el.textContent || '').trim().slice(0, 60) || '';

    // States
    const states = {};
    const boolAttrs = ['aria-checked','aria-selected','aria-expanded','aria-pressed','aria-disabled','aria-hidden','aria-required','aria-invalid','aria-busy','aria-live'];
    boolAttrs.forEach(attr => {
      const val = el.getAttribute(attr);
      if (val !== null) states[attr.replace('aria-', '')] = val;
    });
    // Native states
    if (el.tagName === 'INPUT') {
      if (el.type === 'checkbox' || el.type === 'radio') states['checked'] = String(el.checked);
      if (el.disabled) states['disabled'] = 'true';
      if (el.required) states['required'] = 'true';
    }
    if (el.tagName === 'DETAILS') states['expanded'] = String(el.open);

    return { role, name, states };
  }

  function inferImplicitRole(el) {
    const map = {
      A: 'link', BUTTON: 'button', H1:'heading', H2:'heading', H3:'heading',
      H4:'heading', H5:'heading', H6:'heading', MAIN:'main', NAV:'navigation',
      HEADER:'banner', FOOTER:'contentinfo', ASIDE:'complementary', SECTION:'region',
      ARTICLE:'article', FORM:'form', UL:'list', OL:'list', LI:'listitem',
      TABLE:'table', TR:'row', TD:'cell', TH:'columnheader',
      INPUT:'textbox', SELECT:'combobox', TEXTAREA:'textbox',
      IMG:'img', DIALOG:'dialog', SUMMARY:'button', DETAILS:'group',
    };
    if (el.tagName === 'INPUT') {
      const typeRoles = {checkbox:'checkbox', radio:'radio', range:'slider', submit:'button', button:'button', search:'searchbox'};
      return typeRoles[el.type] || 'textbox';
    }
    return map[el.tagName] || null;
  }

  function positionTooltip(x, y) {
    if (!tooltip) return;
    const tw = tooltip.offsetWidth, th = tooltip.offsetHeight;
    const vw = window.innerWidth, vh = window.innerHeight;
    let left = x + 14, top = y + 14;
    if (left + tw > vw - 10) left = x - tw - 14;
    if (top + th > vh - 10) top = y - th - 14;
    tooltip.style.left = Math.max(8, left) + 'px';
    tooltip.style.top  = Math.max(8, top)  + 'px';
  }

  function showTooltip(el, x, y) {
    ensureTooltip();
    tooltip = document.getElementById('accesslens-tooltip');
    const { role, name, states } = getARIAInfo(el);
    const stateKeys = Object.keys(states);

    let html = '';
    html += `<div class="tt-row"><span class="tt-key">role</span><span class="tt-val">${role || '<span class="tt-none">none</span>'}</span></div>`;
    html += `<div class="tt-row"><span class="tt-key">name</span><span class="tt-val">${name ? escHTML(name.slice(0, 50)) : '<span class="tt-none">none</span>'}</span></div>`;
    html += `<div class="tt-row"><span class="tt-key">tag</span><span class="tt-val">${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}</span></div>`;

    if (stateKeys.length > 0) {
      html += '<hr class="tt-divider">';
      stateKeys.forEach(k => {
        const v = states[k];
        const isTrue = v === 'true';
        const isFalse = v === 'false';
        const cls = isTrue ? 'on' : isFalse ? 'off' : '';
        html += `<div class="tt-row"><span class="tt-key">${k}</span><span class="tt-state ${cls}">${v}</span></div>`;
      });
    }

    tooltip.innerHTML = html;
    tooltip.style.left = '-9999px';
    tooltip.style.top  = '-9999px';
    tooltip.classList.add('visible');
    requestAnimationFrame(() => positionTooltip(x, y));
  }

  function hideTooltip() {
    if (tooltip) tooltip.classList.remove('visible');
  }

  // Only show tooltip when overlay mode is active
  let overlayMode = false;

  document.addEventListener('mousemove', e => {
    if (!overlayMode) return;
    clearTimeout(tooltipTimeout);
    tooltipTimeout = setTimeout(() => {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (el && el.id !== 'accesslens-tooltip' && !el.id.startsWith('accesslens-')) {
        showTooltip(el, e.clientX, e.clientY);
        updateSpotlight(el);
      }
    }, 80);
  });

  document.addEventListener('mouseleave', () => { if (overlayMode) hideTooltip(); });

  // ═══════════════════════════════════════════════════════════════════════════
  // DIM OVERLAY + SPOTLIGHT
  // ═══════════════════════════════════════════════════════════════════════════

  let dimmer    = null;
  let spotlight = null;

  function ensureOverlayElements() {
    if (!document.getElementById('accesslens-dimmer')) {
      dimmer = document.createElement('div');
      dimmer.id = 'accesslens-dimmer';
      document.body.appendChild(dimmer);
    } else {
      dimmer = document.getElementById('accesslens-dimmer');
    }
    if (!document.getElementById('accesslens-spotlight')) {
      spotlight = document.createElement('div');
      spotlight.id = 'accesslens-spotlight';
      document.body.appendChild(spotlight);
    } else {
      spotlight = document.getElementById('accesslens-spotlight');
    }
  }

  function updateSpotlight(el) {
    if (!spotlight) return;
    const rect = el.getBoundingClientRect();
    const pad = 4;
    spotlight.style.left   = (rect.left   - pad) + 'px';
    spotlight.style.top    = (rect.top    - pad) + 'px';
    spotlight.style.width  = (rect.width  + pad * 2) + 'px';
    spotlight.style.height = (rect.height + pad * 2) + 'px';
  }

  function activateOverlay() {
    ensureOverlayElements();
    overlayMode = true;
    dimmer.classList.add('active');
    spotlight.classList.add('active');

    // Also spotlight keyboard focus
    document.addEventListener('focusin', onFocusInOverlay);
  }

  function deactivateOverlay() {
    overlayMode = false;
    if (dimmer) dimmer.classList.remove('active');
    if (spotlight) spotlight.classList.remove('active');
    hideTooltip();
    document.removeEventListener('focusin', onFocusInOverlay);
  }

  function onFocusInOverlay(e) {
    updateSpotlight(e.target);
    showTooltip(e.target,
      e.target.getBoundingClientRect().left,
      e.target.getBoundingClientRect().bottom + 8
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MESSAGE LISTENER (from popup / background)
  // ═══════════════════════════════════════════════════════════════════════════

  try {
    if (chrome?.runtime?.onMessage) {
      chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
        if (msg.type === 'RUN_AUDIT') {
          const result = runAudit();
          sendResponse({ result });
        }
        if (msg.type === 'TOGGLE_OVERLAY') {
          if (msg.active) activateOverlay();
          else deactivateOverlay();
          sendResponse({ ok: true });
        }
        return true;
      });
    }
  } catch (_) {
    // Ignore invalidated extension context in stale page scripts.
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────
  function escHTML(str) {
    return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

})();