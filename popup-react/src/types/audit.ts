/** Single finding from the in-page WCAG auditor (`content.js`). */
export type AuditIssueType = "error" | "warning";

export interface AuditIssue {
  id?: string;
  wcag: string;
  type: AuditIssueType;
  title: string;
  description: string;
  /** Target description from the auditor (stored as `selector` in `content.js`). */
  selector: string;
  fix: string;
  /** Optional UI-only alias; prefer `selector` when missing. */
  element?: string;
}

/** Payload stored as `chrome.storage.local.auditResult` and returned from `RUN_AUDIT`. */
export interface AuditResult {
  url: string;
  title: string;
  scannedAt: string;
  score: number;
  errors: number;
  warnings: number;
  passes: number;
  issues: AuditIssue[];
}

/** Popup filter tabs; `"pass"` shows aggregate pass message, not rows from `issues`. */
export type AuditResultFilter = "all" | "error" | "warning" | "pass";

export interface RunAuditResponse {
  result?: AuditResult;
  error?: string;
}
