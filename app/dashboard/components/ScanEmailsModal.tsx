"use client";

import { useState } from "react";
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
import { Loader2, Mail, CheckCircle2, AlertCircle } from "lucide-react";
import styles from "../dashboard.module.css";

interface ScanEmailsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onScanComplete: () => void;
}

type ScanPhase = "idle" | "scanning" | "review" | "processing" | "done" | "error";

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

function formatDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function ScanEmailsModal({
  open,
  onOpenChange,
  onScanComplete,
}: ScanEmailsModalProps) {
  const today = formatDate(new Date());
  const weekAgo = formatDate(new Date(Date.now() - 7 * 86400000));

  const [startDate, setStartDate] = useState(weekAgo);
  const [endDate, setEndDate] = useState(today);
  const [phase, setPhase] = useState<ScanPhase>("idle");
  const [stage1, setStage1] = useState<Stage1Result | null>(null);
  const [stage2, setStage2] = useState<Stage2Result | null>(null);
  const [selectedMessageIds, setSelectedMessageIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [previewEmail, setPreviewEmail] = useState<RelevantEmail | null>(null);

  function reset() {
    setPhase("idle");
    setStage1(null);
    setStage2(null);
    setSelectedMessageIds(new Set());
    setError(null);
    setPreviewEmail(null);
    setStartDate(weekAgo);
    setEndDate(today);
  }

  function handleOpenChange(next: boolean) {
    if (!next) {
      if (phase === "done") onScanComplete();
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
        setPhase("done"); // No relevant emails, go straight to done
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

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className={styles.modalContent}>
        <DialogHeader className={styles.modalHeader}>
          <DialogTitle className={styles.modalTitle}>
            <Mail size={18} style={{ display: "inline", marginRight: "0.4rem", verticalAlign: "text-bottom" }} />
            Scan Emails
          </DialogTitle>
          <DialogDescription className={styles.modalDesc}>
            {phase === "idle" && "Scan your Gmail inbox for job application updates. Select a date range to search."}
            {phase === "scanning" && "Scanning headers to find potentially relevant emails..."}
            {phase === "review" && "Review potentially relevant emails before parsing their contents."}
            {phase === "processing" && "Fetching and parsing full email contents with capable AI..."}
            {phase === "done" && "Scan complete! Here's what was updated."}
            {phase === "error" && "Something went wrong during the scan."}
          </DialogDescription>
        </DialogHeader>

        <div className={styles.modalBody}>
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
        </div>

        <DialogFooter className={styles.modalFooter}>
          {phase === "idle" && (
            <>
              <Button
                variant="outline"
                onClick={() => handleOpenChange(false)}
              >
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
              <Button
                variant="outline"
                onClick={() => handleOpenChange(false)}
              >
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
              <Button
                onClick={() => handleOpenChange(false)}
                className={styles.submitBtn}
              >
                {phase === "done" ? "Done" : "Close"}
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
