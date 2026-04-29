"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Loader2, Mail, CheckCircle2, AlertCircle, Clock, Calendar, Settings, Zap } from "lucide-react";
import styles from "../dashboard.module.css";

interface ScanEmailsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onScanComplete: () => void;
}

type ScanPhase = "idle" | "scanning" | "review" | "processing" | "done" | "error";
type ModalTab = "manual" | "auto";

interface RelevantEmail {
  messageId: string;
  subject: string;
  sender: string;
  application_id: number;
  company_name: string;
  job_title: string;
  confidence: string;
  reason: string;
  body?: string;
}

interface Stage1Result {
  scanned: number;
  new_emails: number;
  skipped_duplicates: number;
  relevant: number;
  relevant_emails: RelevantEmail[];
}

interface Stage2Result {
  processed: number;
  updates: {
    application_id: number;
    email_subject: string;
    fields_updated: string[];
    confidence: string;
  }[];
}

interface ScanSettings {
  auto_scan_enabled: boolean;
  scan_window_start: string | null;
  last_scan_time: string | null;
  preferred_scan_hour: number;
}

function formatDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Format an ISO timestamp nicely for display. */
function formatDateTime(iso: string | null): string {
  if (!iso) return "Never";
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function ScanEmailsModal({
  open,
  onOpenChange,
  onScanComplete,
}: ScanEmailsModalProps) {
  const today = formatDate(new Date());
  const weekAgo = formatDate(new Date(Date.now() - 7 * 86400000));

  // Manual scan state
  const [startDate, setStartDate] = useState(weekAgo);
  const [endDate, setEndDate] = useState(today);
  const [phase, setPhase] = useState<ScanPhase>("idle");
  const [stage1, setStage1] = useState<Stage1Result | null>(null);
  const [stage2, setStage2] = useState<Stage2Result | null>(null);
  const [selectedMessageIds, setSelectedMessageIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [previewEmail, setPreviewEmail] = useState<RelevantEmail | null>(null);

  // Tab state
  const [activeTab, setActiveTab] = useState<ModalTab>("manual");

  // Auto-scan settings state
  const [settings, setSettings] = useState<ScanSettings>({
    auto_scan_enabled: false,
    scan_window_start: null,
    last_scan_time: null,
    preferred_scan_hour: 8,
  });
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [hasRefetched, setHasRefetched] = useState(false);

  // Load settings when the modal opens
  const loadSettings = useCallback(async () => {
    setSettingsLoading(true);
    setSettingsError(null);
    try {
      const res = await fetch("/api/user/scan-settings", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load settings");
      const data: ScanSettings = await res.json();
      setSettings(data);
    } catch (err) {
      setSettingsError(err instanceof Error ? err.message : "Could not load settings");
    } finally {
      setSettingsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) loadSettings();
  }, [open, loadSettings]);

  async function saveSettings() {
    setSettingsSaving(true);
    setSettingsError(null);
    setSettingsSaved(false);
    try {
      const res = await fetch("/api/user/scan-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          auto_scan_enabled: settings.auto_scan_enabled,
          scan_window_start: settings.scan_window_start,
          preferred_scan_hour: settings.preferred_scan_hour,
        }),
      });
      if (!res.ok) throw new Error("Failed to save settings");
      setSettingsSaved(true);
      setTimeout(() => setSettingsSaved(false), 2500);
    } catch (err) {
      setSettingsError(err instanceof Error ? err.message : "Could not save settings");
    } finally {
      setSettingsSaving(false);
    }
  }

  async function resetLastScan() {
    setSettingsSaving(true);
    setSettingsError(null);
    try {
      const res = await fetch("/api/user/scan-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          last_scan_time: null,
        }),
      });
      if (!res.ok) throw new Error("Failed to reset scan date");
      setSettings((s) => ({ ...s, last_scan_time: null }));
    } catch (err) {
      setSettingsError(err instanceof Error ? err.message : "Could not reset last scan");
    } finally {
      setSettingsSaving(false);
    }
  }

  // Manual scan handlers
  function reset() {
    setPhase("idle");
    setStage1(null);
    setStage2(null);
    setSelectedMessageIds(new Set());
    setError(null);
    setPreviewEmail(null);
    setStartDate(weekAgo);
    setEndDate(today);
    setHasRefetched(false);
  }

  function handleOpenChange(next: boolean) {
    if (!next) {
      if ((phase === "done" || phase === "processing") && !hasRefetched) {
        onScanComplete();
      }
      reset();
    }
    onOpenChange(next);
  }

  async function handleScan() {
    setPhase("scanning");
    setError(null);

    try {
      const res = await fetch("/api/scan-emails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ start_date: startDate, end_date: endDate }),
      });

      const data = await res.json();

      if (!res.ok) {
        setPhase("error");
        setError(data?.error ?? "Scan failed.");
        return;
      }

      const result = data as Stage1Result;
      setStage1(result);

      if (result.relevant_emails.length > 0) {
        setSelectedMessageIds(new Set(result.relevant_emails.map((e) => e.messageId)));
        setPhase("review");
      } else {
        setPhase("done");
      }
    } catch (err) {
      setPhase("error");
      setError(err instanceof Error ? err.message : "Network error");
    }
  }

  async function handleProcess() {
    if (!stage1) return;
    setPhase("processing");
    setError(null);

    const approvedEmails = stage1.relevant_emails
      .filter((e) => selectedMessageIds.has(e.messageId))
      .map((e) => ({
        messageId: e.messageId,
        application_id: e.application_id,
        company_name: e.company_name,
        job_title: e.job_title,
      }));

    if (approvedEmails.length === 0) {
      setPhase("done");
      return;
    }

    try {
      const res = await fetch("/api/scan-emails/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ emails: approvedEmails }),
      });

      const data = await res.json();

      if (!res.ok) {
        setPhase("error");
        setError(data?.error ?? "Processing failed.");
        return;
      }

      setStage2(data as Stage2Result);
      setPhase("done");
      onScanComplete();
      setHasRefetched(true);
    } catch (err) {
      setPhase("error");
      setError(err instanceof Error ? err.message : "Network error");
    }
  }

  function handleEmailSelection(messageId: string, checked: boolean) {
    setSelectedMessageIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(messageId);
      else next.delete(messageId);
      return next;
    });
  }

  const FIELD_LABELS: Record<string, string> = {
    status: "Status",
    salary_per_hour: "Salary / hour",
    location_type: "Location type",
    location: "Location",
    contact_person: "Contact person",
    notes: "Notes",
    date_applied: "Date applied",
  };

  // Build the list of hours for the dropdown (0-23 local hours mapped to UTC values)
  const hourOptions = Array.from({ length: 24 }, (_, h) => {
    const d = new Date();
    d.setHours(h, 0, 0, 0);
    const utcHour = d.getUTCHours();
    const localLabel = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    return {
      value: utcHour,
      label: localLabel,
    };
  });

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className={styles.modalContent}>
          <DialogHeader className={styles.modalHeader}>
            <DialogTitle className={styles.modalTitle}>
              <Mail size={18} style={{ display: "inline", marginRight: "0.4rem", verticalAlign: "text-bottom" }} />
              Scan Emails
            </DialogTitle>
            {activeTab === "manual" ? (
              <DialogDescription className={styles.modalDesc}>
                {phase === "idle" && "Scan Gmail inbox for job application updates. Select a date range to scan."}
                {phase === "scanning" && "Scanning for relevant emails..."}
                {phase === "review" && "Review emails before parsing their contents."}
                {phase === "processing" && "Fetching and parsing email contents..."}
                {phase === "done" && "Scan complete! Here's what was updated."}
                {phase === "error" && "Something went wrong during the scan."}
              </DialogDescription>
            ) : (
              <DialogDescription className={styles.modalDesc}>
                Configure automated daily inbox scanning. Only high-confidence matches are applied automatically.
              </DialogDescription>
            )}
          </DialogHeader>

          {/* Tab switcher */}
          <div className={styles.modeToggle}>
            <button
              className={`${styles.modeBtn} ${activeTab === "manual" ? styles.modeBtnActive : ""}`}
              onClick={() => setActiveTab("manual")}
            >
              <Zap size={13} />
              Manual Scan
            </button>
            <button
              className={`${styles.modeBtn} ${activeTab === "auto" ? styles.modeBtnActive : ""}`}
              onClick={() => setActiveTab("auto")}
            >
              <Settings size={13} />
              Auto-Scan
            </button>
          </div>

          <div className={styles.modalBody}>
            {/* MANUAL TAB */}
            {activeTab === "manual" && (
              <>
                {phase === "idle" && (
                  <div className={styles.scanDateFields}>
                    <div className={styles.formField}>
                      <Label htmlFor="scan-start" className={styles.formLabel}>
                        Start Date
                      </Label>
                      <Input
                        id="scan-start"
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className={styles.formInput}
                      />
                    </div>
                    <div className={styles.formField}>
                      <Label htmlFor="scan-end" className={styles.formLabel}>
                        End Date
                      </Label>
                      <Input
                        id="scan-end"
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className={styles.formInput}
                      />
                    </div>
                  </div>
                )}

                {(phase === "scanning" || phase === "processing") && (
                  <div className={styles.scanProgress}>
                    <Loader2 size={28} className={styles.spinner} />
                    <p className={styles.scanProgressText}>
                      {phase === "scanning"
                        ? "Fetching headers and running relevance analysis..."
                        : "Parsing email bodies and extracting field updates..."}
                    </p>
                    <p className={styles.scanProgressHint}>
                      This may take a minute depending on the number of emails and API limits.
                    </p>
                  </div>
                )}

                {phase === "review" && stage1 && (
                  <div className={styles.scanResults}>
                    <div className={styles.scanResultsSummary} style={{ marginBottom: "1rem" }}>
                      <span>
                        Scanned <strong>{stage1.scanned}</strong> emails, found <strong>{stage1.relevant}</strong> potentially relevant matching.
                      </span>
                    </div>

                    <div className={styles.scanUpdatesList} style={{ maxHeight: "300px", overflowY: "auto" }}>
                      {stage1.relevant_emails.map((email) => (
                        <div key={email.messageId} className={styles.scanUpdateItem} style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", paddingTop: "4px" }}>
                            <input
                              type="checkbox"
                              checked={selectedMessageIds.has(email.messageId)}
                              onChange={(e) => handleEmailSelection(email.messageId, e.target.checked)}
                              style={{ cursor: "pointer", width: "16px", height: "16px" }}
                            />
                          </div>
                          <div
                            style={{ flex: 1, cursor: "pointer", minWidth: 0 }}
                            onClick={() => setPreviewEmail(email)}
                            title="Click to preview email"
                          >
                            <div className={styles.scanUpdateSubject} style={{ color: "#000", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {email.subject}
                            </div>
                            <div className={styles.scanUpdateFields} style={{ fontSize: "0.85rem", color: "#444", marginTop: "4px" }}>
                              From: {email.sender} <br />
                              Matched: <strong>{email.company_name} - {email.job_title}</strong>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {phase === "done" && (
                  <div className={styles.scanResults}>
                    {stage1 && (
                      <div className={styles.scanResultsSummary}>
                        <CheckCircle2 size={20} className={styles.scanResultsIcon} />
                        <span>
                          Scanned <strong>{stage1.scanned}</strong> total email(s).
                          {stage1.skipped_duplicates > 0 && ` (${stage1.skipped_duplicates} already processed)`}
                        </span>
                      </div>
                    )}

                    {stage2 && stage2.updates.length > 0 && (
                      <div className={styles.scanUpdatesList} style={{ marginTop: "1rem" }}>
                        <h4 style={{ fontSize: "0.9rem", color: "#fff", marginBottom: "0.5rem" }}>Updates Applied:</h4>
                        {stage2.updates.map((u, i) => (
                          <div key={i} className={styles.scanUpdateItem}>
                            <span className={styles.scanUpdateSubject}>
                              {u.email_subject}
                            </span>
                            <span className={styles.scanUpdateFields}>
                              Updated: {u.fields_updated.length > 0 ? u.fields_updated.map((f) => FIELD_LABELS[f] ?? f).join(", ") : "Timeline only (No fields changed)"}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {(!stage2 || stage2.updates.length === 0) && (
                      <p className={styles.scanNoResults} style={{ marginTop: "1rem" }}>
                        No field updates extracted from the emails.
                      </p>
                    )}
                  </div>
                )}

                {phase === "error" && error && (
                  <div className={styles.scanError}>
                    <AlertCircle size={20} />
                    <p>{error}</p>
                  </div>
                )}
              </>
            )}

            {/* AUTO-SCAN TAB */}
            {activeTab === "auto" && (
              <div className={styles.autoScanSection}>
                {settingsLoading ? (
                  <div className={styles.scanProgress}>
                    <Loader2 size={22} className={styles.spinner} />
                    <p className={styles.scanProgressHint}>Loading settings…</p>
                  </div>
                ) : (
                  <>
                    {/* Enable toggle */}
                    <div className={styles.autoScanToggleRow}>
                      <div>
                        <div className={styles.autoScanToggleLabel}>Enable Daily Auto-Scan</div>
                        <div className={styles.autoScanToggleHint}>
                          Scans your inbox daily.
                        </div>
                      </div>
                      <button
                        id="auto-scan-toggle"
                        className={`${styles.autoScanToggle} ${settings.auto_scan_enabled ? styles.autoScanToggleOn : ""}`}
                        onClick={() =>
                          setSettings((s) => ({ ...s, auto_scan_enabled: !s.auto_scan_enabled }))
                        }
                        aria-pressed={settings.auto_scan_enabled}
                        aria-label="Toggle auto-scan"
                      >
                        <span className={styles.autoScanToggleThumb} />
                      </button>
                    </div>

                    <hr className={styles.autoScanDivider} />

                    {/* Scan time */}
                    <div className={styles.formField}>
                      <Label htmlFor="preferred-hour" className={styles.formLabel}>
                        <Clock size={12} style={{ display: "inline", marginRight: "0.3rem", verticalAlign: "text-bottom" }} />
                        Daily Scan Time
                      </Label>
                      <select
                        id="preferred-hour"
                        className={styles.formSelect}
                        value={settings.preferred_scan_hour}
                        onChange={(e) =>
                          setSettings((s) => ({ ...s, preferred_scan_hour: Number(e.target.value) }))
                        }
                        disabled={!settings.auto_scan_enabled}
                      >
                        {hourOptions.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Initial window start */}
                    <div className={styles.formField}>
                      <Label htmlFor="scan-starting-date" className={styles.formLabel}>
                        <Calendar size={12} style={{ display: "inline", marginRight: "0.3rem", verticalAlign: "text-bottom" }} />
                        Scan Starting Date
                      </Label>
                      <Input
                        id="scan-starting-date"
                        type="date"
                        value={settings.scan_window_start ?? ""}
                        onChange={(e) =>
                          setSettings((s) => ({ ...s, scan_window_start: e.target.value || null }))
                        }
                        className={styles.formInput}
                        disabled={!settings.auto_scan_enabled}
                        max={today}
                      />
                      <span className={styles.autoScanHint}>
                        Used for the first scan only. Future scans pick up from the previous scan.
                      </span>
                    </div>

                    {/* Last scan info */}
                    <div className={styles.autoScanStatusRow}>
                      <span className={styles.autoScanStatusLabel}>Last auto-scan:</span>
                      <span className={styles.autoScanStatusValue}>
                        {formatDateTime(settings.last_scan_time)}
                      </span>
                      {settings.last_scan_time && (
                        <button
                          type="button"
                          className={styles.autoScanResetBtn}
                          onClick={resetLastScan}
                          title="Clear last scan date"
                        >
                          Reset
                        </button>
                      )}
                    </div>

                    {settingsError && (
                      <div className={styles.scanError} style={{ marginTop: "0.5rem" }}>
                        <AlertCircle size={16} />
                        <p>{settingsError}</p>
                      </div>
                    )}

                  </>
                )}
              </div>
            )}
          </div>

          <DialogFooter className={styles.modalFooter}>
            {/* MANUAL tab footer */}
            {activeTab === "manual" && (
              <>
                {phase === "idle" && (
                  <>
                    <Button variant="outline" onClick={() => handleOpenChange(false)}>
                      Cancel
                    </Button>
                    <Button
                      onClick={handleScan}
                      disabled={!startDate || !endDate}
                      className={styles.submitBtn}
                    >
                      Find Updates
                    </Button>
                  </>
                )}

                {phase === "scanning" && (
                  <Button variant="outline" disabled>
                    Scanning...
                  </Button>
                )}

                {phase === "review" && (
                  <>
                    <Button variant="outline" onClick={() => handleOpenChange(false)}>
                      Cancel
                    </Button>
                    <Button
                      onClick={handleProcess}
                      className={styles.submitBtn}
                      disabled={selectedMessageIds.size === 0}
                    >
                      Process Selected ({selectedMessageIds.size})
                    </Button>
                  </>
                )}

                {phase === "processing" && (
                  <Button variant="outline" disabled>
                    Processing...
                  </Button>
                )}

                {(phase === "done" || phase === "error") && (
                  <>
                    {phase === "error" && (
                      <Button variant="outline" onClick={reset}>
                        Try Again
                      </Button>
                    )}
                    <Button onClick={() => handleOpenChange(false)} className={styles.submitBtn}>
                      {phase === "done" ? "Done" : "Close"}
                    </Button>
                  </>
                )}
              </>
            )}

            {/* AUTO-SCAN tab footer */}
            {activeTab === "auto" && !settingsLoading && (
              <>
                {settingsSaved && (
                  <div className={styles.autoScanSavedBadge} style={{ marginRight: "auto" }}>
                    <CheckCircle2 size={14} />
                    Settings saved
                  </div>
                )}
                <Button variant="outline" onClick={() => handleOpenChange(false)}>
                  Close
                </Button>
                <Button
                  onClick={saveSettings}
                  disabled={settingsSaving}
                  className={styles.submitBtn}
                >
                  {settingsSaving ? (
                    <>
                      <Loader2 size={14} className={styles.spinner} style={{ marginRight: "0.35rem" }} />
                      Saving…
                    </>
                  ) : (
                    "Save Settings"
                  )}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {previewEmail && (
        <Dialog open={true} onOpenChange={() => setPreviewEmail(null)}>
          <DialogContent className={styles.modalContent} style={{ maxWidth: "650px", width: "95vw" }}>
            <DialogHeader className={styles.modalHeader}>
              <DialogTitle className={styles.modalTitle} style={{ wordBreak: "break-word", color: "#000" }}>
                {previewEmail.subject}
              </DialogTitle>
              <DialogDescription className={styles.modalDesc} style={{ color: "#444" }}>
                From: {previewEmail.sender}
              </DialogDescription>
            </DialogHeader>
            <div className={styles.modalBody} style={{
              maxHeight: "60vh",
              overflowY: "auto",
              whiteSpace: "pre-wrap",
              color: "#222",
              backgroundColor: "#f9fafb",
              padding: "1rem",
              borderRadius: "6px",
              fontSize: "0.9rem",
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
              lineHeight: 1.5,
              border: "1px solid #e5e7eb"
            }}>
              {previewEmail.body || "No email body available."}
            </div>
            <DialogFooter className={styles.modalFooter}>
              <Button variant="outline" onClick={() => setPreviewEmail(null)} style={{ color: "#000" }}>
                Close Preview
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
