import { useEffect, useMemo, useState } from "react";

const initialResult = null;

function esc(str) {
  return (str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function withChromeApi(action) {
  try {
    if (!chrome?.runtime?.id) return null;
    return action(chrome);
  } catch (_) {
    return null;
  }
}

export default function App() {
  const [result, setResult] = useState(initialResult);
  const [currentFilter, setCurrentFilter] = useState("all");
  const [overlayActive, setOverlayActive] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [pageUrl, setPageUrl] = useState("—");
  const [openIssues, setOpenIssues] = useState({});

  useEffect(() => {
    withChromeApi((c) => c.storage.local.get("auditResult", (data) => {
      if (data?.auditResult) setResult(data.auditResult);
    }));

    withChromeApi((c) => c.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs?.[0]) return;
      try {
        const u = new URL(tabs[0].url);
        setPageUrl(u.hostname + u.pathname);
      } catch {
        setPageUrl(tabs[0].url || "—");
      }
    }));
  }, []);

  useEffect(() => {
    if (!isScanning) return undefined;
    let w = 0;
    setProgress(0);
    const timer = setInterval(() => {
      w = Math.min(w + Math.random() * 15 + 5, 85);
      setProgress(w);
    }, 150);
    return () => clearInterval(timer);
  }, [isScanning]);

  useEffect(() => {
    if (!isScanning) return undefined;
    return undefined;
  }, [isScanning]);

  function finishProgress() {
    setProgress(100);
    setTimeout(() => setProgress(0), 400);
  }

  function runScan() {
    setError("");
    setIsScanning(true);
    const started = withChromeApi((c) => c.runtime.sendMessage({ type: "RUN_AUDIT" }, (response) => {
      finishProgress();
      setIsScanning(false);

      if (c.runtime.lastError || !response || response.error) {
        setError(response?.error || "Could not run audit. Try refreshing the page.");
        return;
      }
      setResult(response.result);
      setOpenIssues({});
      setCurrentFilter("all");
    }));

    if (started === null) {
      finishProgress();
      setIsScanning(false);
      setError("Extension context invalidated. Reload extension and page.");
    }
  }

  function toggleOverlayMode() {
    const started = withChromeApi((c) => c.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (!tab || !tab.id) {
        setError("No active tab found.");
        return;
      }
      const nextState = !overlayActive;
      c.scripting.executeScript(
        { target: { tabId: tab.id }, files: ["content.js"] },
        () => {
          if (c.runtime.lastError) {
            setError("This page does not allow overlay injection.");
            return;
          }
          c.scripting.insertCSS(
            { target: { tabId: tab.id }, files: ["overlay.css"] },
            () => {
              if (c.runtime.lastError) {
                setError("Could not load overlay styles on this page.");
                return;
              }
              c.tabs.sendMessage(tab.id, { type: "TOGGLE_OVERLAY", active: nextState }, (response) => {
                if (c.runtime.lastError || !response?.ok) {
                  setError("Could not toggle SR overlay on this page.");
                  return;
                }
                setError("");
                setOverlayActive(nextState);
              });
            }
          );
        }
      );
    }));

    if (started === null) {
      setError("Extension context invalidated. Reload extension and page.");
    }
  }

  const filteredIssues = useMemo(() => {
    const issues = result?.issues || [];
    if (currentFilter === "all") return issues;
    if (currentFilter === "pass") return [];
    return issues.filter((i) => i.type === currentFilter);
  }, [result, currentFilter]);

  const counts = useMemo(() => {
    if (!result) return { all: 0, error: 0, warning: 0, pass: 0 };
    return {
      all: result.issues.length,
      error: result.errors,
      warning: result.warnings,
      pass: result.passes
    };
  }, [result]);

  const scoreClass = !result ? "" : result.score >= 80 ? "good" : result.score >= 50 ? "warn" : "fail";

  return (
    <div className="app-root">
      <div className="header">
        <div className="logo">
          <div className="logo-icon">
            <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="8" cy="4" r="2" fill="white" />
              <path d="M8 7L5 13M8 7L11 13M5 9H11" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
          <div>
            <div className="logo-name">AccessLens</div>
            <div className="logo-sub">WCAG 2.2 Auditor</div>
          </div>
        </div>
        <div className="header-actions">
          <button className={`overlay-btn ${overlayActive ? "on" : ""}`} onClick={toggleOverlayMode} aria-pressed={overlayActive}>
            {overlayActive ? "SR overlay ON" : "SR overlay OFF"}
          </button>
          <button className="scan-btn" onClick={runScan} disabled={isScanning}>
            {isScanning ? "Scanning..." : "Scan page"}
          </button>
        </div>
      </div>

      <div className="url-bar">
        <div className="url-dot" />
        <div className="url-text">{pageUrl}</div>
      </div>

      <div className="progress">
        <div className="progress-fill" style={{ width: `${progress}%` }} />
      </div>

      {error ? (
        <div className="empty">
          <div className="empty-icon">⚠️</div>
          <div className="empty-title">Scan failed</div>
          <div className="empty-desc">{error}</div>
        </div>
      ) : !result ? (
        <div className="empty">
          <div className="empty-icon">🔍</div>
          <div className="empty-title">No audit yet</div>
          <div className="empty-desc">Click <strong>Scan page</strong> to run a full WCAG 2.2 accessibility audit on the current page.</div>
        </div>
      ) : (
        <div id="results">
          <div className="score-row">
            <div className={`score-circle ${scoreClass}`}>
              <div className="score-num">{result.score}</div>
              <div className="score-sub">/ 100</div>
            </div>
            <div className="score-info">
              <div className="score-title">{result.score >= 80 ? "Good accessibility" : result.score >= 50 ? "Needs improvement" : "Poor accessibility"}</div>
              <div className="score-desc">
                {result.errors === 0 ? "No errors found — check warnings" : `${result.errors} error(s) blocking full compliance`}
              </div>
              <span className="wcag-badge">WCAG 2.2 AA</span>
            </div>
          </div>

          <div className="stats">
            <div className="stat"><div className="stat-num err">{result.errors}</div><div className="stat-lbl">Errors</div></div>
            <div className="stat"><div className="stat-num warn">{result.warnings}</div><div className="stat-lbl">Warnings</div></div>
            <div className="stat"><div className="stat-num pass">{result.passes}</div><div className="stat-lbl">Passing</div></div>
          </div>

          <div className="tabs">
            {["all", "error", "warning", "pass"].map((filter) => (
              <button
                key={filter}
                className={`tab ${currentFilter === filter ? "active" : ""}`}
                onClick={() => setCurrentFilter(filter)}
              >
                {capitalize(filter === "all" ? "all" : `${filter}s`)} ({counts[filter]})
              </button>
            ))}
          </div>

          <div className="issues-list">
            {currentFilter === "pass" ? (
              <div className="empty compact"><div className="empty-desc">{result.passes} checks passed. Great work!</div></div>
            ) : filteredIssues.length === 0 ? (
              <div className="empty compact"><div className="empty-desc">No {currentFilter}s found.</div></div>
            ) : (
              filteredIssues.map((iss, idx) => (
                <div
                  key={`${iss.id || iss.wcag}-${idx}`}
                  className={`issue ${openIssues[idx] ? "open" : ""}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => setOpenIssues((prev) => ({ ...prev, [idx]: !prev[idx] }))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setOpenIssues((prev) => ({ ...prev, [idx]: !prev[idx] }));
                    }
                  }}
                >
                  <div className="issue-top">
                    <span className={`badge ${iss.type}`}>{capitalize(iss.type)}</span>
                    <span className="issue-title">{iss.title}</span>
                    <span className="issue-wcag">{iss.wcag}</span>
                  </div>
                  <div className="issue-desc">{iss.description}</div>
                  <div className="issue-element" dangerouslySetInnerHTML={{ __html: esc(iss.element) }} />
                  <div className="issue-fix">Fix: {iss.fix}</div>
                </div>
              ))
            )}
          </div>

          <div className="footer">
            <div className="footer-left">Scanned just now · {result.issues.length + result.passes} checks</div>
            <button
              className="export-btn"
              onClick={() => {
                const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `accesslens-audit-${Date.now()}.json`;
                a.click();
                URL.revokeObjectURL(url);
              }}
            >
              Export JSON
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
