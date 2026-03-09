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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Link2, PenLine, Loader2 } from "lucide-react";
import type {
  Application,
  ApplicationStatus,
  LocationType,
} from "@/types/applications";
import { STATUS_LABELS, LOCATION_LABELS } from "@/types/applications";
import styles from "../dashboard.module.css";

interface NewApplicationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (app: Application) => void;
}

type Mode = "automatic" | "manual";

const EMPTY_FORM = {
  job_url: "",
  company_name: "",
  job_title: "",
  salary_per_hour: "",
  location_type: "" as LocationType | "",
  location: "",
  date_applied: new Date().toISOString().slice(0, 10),
  contact_person: "",
  status: "applied" as ApplicationStatus,
  notes: "",
};

export default function NewApplicationModal({
  open,
  onOpenChange,
  onCreated,
}: NewApplicationModalProps) {
  const [mode, setMode] = useState<Mode>("automatic");
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setForm({ ...EMPTY_FORM });
    setMode("automatic");
    setError(null);
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  function updateField<K extends keyof typeof form>(
    key: K,
    value: (typeof form)[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit() {
    setError(null);

    if (mode === "automatic") {
      if (!form.job_url.trim()) {
        setError("Please enter a job listing URL.");
        return;
      }
    } else {
      if (!form.company_name.trim() || !form.job_title.trim()) {
        setError("Company name and job title are required.");
        return;
      }
    }

    setSubmitting(true);

    const body =
      mode === "automatic"
        ? { mode: "automatic" as const, job_url: form.job_url.trim() }
        : {
            mode: "manual" as const,
            company_name: form.company_name.trim(),
            job_title: form.job_title.trim(),
            salary_per_hour: form.salary_per_hour
              ? Number(form.salary_per_hour)
              : null,
            location_type: form.location_type || null,
            location: form.location.trim() || null,
            date_applied:
              form.date_applied || new Date().toISOString().slice(0, 10),
            contact_person: form.contact_person.trim() || null,
            status: form.status,
            notes: form.notes.trim() || null,
          };

    const res = await fetch("/api/applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });

    const data = await res.json().catch(() => ({}));
    setSubmitting(false);

    if (!res.ok) {
      setError(data?.error ?? "Failed to create application");
      return;
    }

    if (data) {
      onCreated(data as Application);
      handleOpenChange(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className={styles.modalContent}>
        <DialogHeader className={styles.modalHeader}>
          <DialogTitle className={styles.modalTitle}>
            Add New Application
          </DialogTitle>
          <DialogDescription className={styles.modalDesc}>
            Paste a job listing URL to auto-fill, or enter the details manually.
          </DialogDescription>
        </DialogHeader>

        <div className={styles.modeToggle}>
          <button
            type="button"
            className={`${styles.modeBtn} ${mode === "automatic" ? styles.modeBtnActive : ""}`}
            onClick={() => setMode("automatic")}
          >
            <Link2 size={15} />
            Automatic
          </button>
          <button
            type="button"
            className={`${styles.modeBtn} ${mode === "manual" ? styles.modeBtnActive : ""}`}
            onClick={() => setMode("manual")}
          >
            <PenLine size={15} />
            Manual
          </button>
        </div>

        <div className={styles.modalBody}>
          {mode === "automatic" ? (
            <div className={styles.autoSection}>
              <Label htmlFor="job-url" className={styles.formLabel}>
                Job Listing URL
              </Label>
              <Input
                id="job-url"
                placeholder="https://careers.example.com/jobs/123456"
                value={form.job_url}
                onChange={(e) => updateField("job_url", e.target.value)}
                className={styles.formInput}
              />
              <p className={styles.autoHint}>
                We&apos;ll scrape the listing and fill in the details for you.
              </p>
            </div>
          ) : (
            <div className={styles.manualGrid}>
              <div className={styles.formField}>
                <Label htmlFor="company" className={styles.formLabel}>
                  Company Name <span className={styles.required}>*</span>
                </Label>
                <Input
                  id="company"
                  placeholder="e.g. Google"
                  value={form.company_name}
                  onChange={(e) => updateField("company_name", e.target.value)}
                  className={styles.formInput}
                />
              </div>

              <div className={styles.formField}>
                <Label htmlFor="title" className={styles.formLabel}>
                  Job Title <span className={styles.required}>*</span>
                </Label>
                <Input
                  id="title"
                  placeholder="e.g. Software Engineer"
                  value={form.job_title}
                  onChange={(e) => updateField("job_title", e.target.value)}
                  className={styles.formInput}
                />
              </div>

              <div className={styles.formField}>
                <Label htmlFor="salary" className={styles.formLabel}>
                  Salary / Hour
                </Label>
                <Input
                  id="salary"
                  type="number"
                  placeholder="e.g. 45"
                  value={form.salary_per_hour}
                  onChange={(e) =>
                    updateField("salary_per_hour", e.target.value)
                  }
                  className={styles.formInput}
                />
              </div>

              <div className={styles.formField}>
                <Label htmlFor="status" className={styles.formLabel}>
                  Status
                </Label>
                <select
                  id="status"
                  value={form.status}
                  onChange={(e) =>
                    updateField("status", e.target.value as ApplicationStatus)
                  }
                  className={styles.formSelect}
                >
                  {Object.entries(STATUS_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              <div className={styles.formField}>
                <Label htmlFor="location-type" className={styles.formLabel}>
                  Location Type
                </Label>
                <select
                  id="location-type"
                  value={form.location_type}
                  onChange={(e) =>
                    updateField(
                      "location_type",
                      (e.target.value as LocationType) || "",
                    )
                  }
                  className={styles.formSelect}
                >
                  <option value="">Select...</option>
                  {Object.entries(LOCATION_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              <div className={styles.formField}>
                <Label htmlFor="location" className={styles.formLabel}>
                  Location
                </Label>
                <Input
                  id="location"
                  placeholder="e.g. New York, NY"
                  value={form.location}
                  onChange={(e) => updateField("location", e.target.value)}
                  className={styles.formInput}
                />
              </div>

              <div className={styles.formField}>
                <Label htmlFor="date-applied" className={styles.formLabel}>
                  Date Applied
                </Label>
                <Input
                  id="date-applied"
                  type="date"
                  value={form.date_applied}
                  onChange={(e) => updateField("date_applied", e.target.value)}
                  className={styles.formInput}
                />
              </div>

              <div className={styles.formField}>
                <Label htmlFor="contact" className={styles.formLabel}>
                  Contact Person
                </Label>
                <Input
                  id="contact"
                  placeholder="e.g. John Doe"
                  value={form.contact_person}
                  onChange={(e) =>
                    updateField("contact_person", e.target.value)
                  }
                  className={styles.formInput}
                />
              </div>

              <div className={styles.formFieldFull}>
                <Label htmlFor="notes" className={styles.formLabel}>
                  Notes
                </Label>
                <Textarea
                  id="notes"
                  placeholder="Any extra details..."
                  rows={3}
                  value={form.notes}
                  onChange={(e) => updateField("notes", e.target.value)}
                  className={styles.formInput}
                />
              </div>
            </div>
          )}

          {error && <p className={styles.formError}>{error}</p>}
        </div>

        <DialogFooter className={styles.modalFooter}>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting}
            className={styles.submitBtn}
          >
            {submitting && <Loader2 size={16} className={styles.spinner} />}
            {mode === "automatic" ? "Import" : "Add Application"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
