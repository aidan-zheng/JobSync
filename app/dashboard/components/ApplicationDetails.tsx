"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Check, Mail, Loader2, Trash2 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import type {
  Application,
  ApplicationEmail,
  ApplicationFieldName,
  ApplicationStatus,
  LocationType,
} from "@/types/applications";
import {
  STATUS_LABELS,
  STATUS_COLORS,
  LOCATION_LABELS,
} from "@/types/applications";
import styles from "../dashboard.module.css";

interface ApplicationDetailsProps {
  application: Application | null;
  emails: ApplicationEmail[];
  onApplicationUpdated: (app: Application) => void;
  onEventsChange: () => void;
  onDeleteClick: () => void;
}

export default function ApplicationDetails({
  application,
  emails,
  onApplicationUpdated,
  onEventsChange,
  onDeleteClick,
}: ApplicationDetailsProps) {
  const [editingField, setEditingField] = useState<ApplicationFieldName | null>(
    null,
  );
  const [editValue, setEditValue] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [optimisticApp, setOptimisticApp] = useState<Application | null>(null);

  useEffect(() => {
    setOptimisticApp(null);
    setEditingField(null);
    setEditValue("");
  }, [application?.id]);

  function cancelEdit() {
    setEditingField(null);
    setEditValue("");
  }

  if (!application) {
    return (
      <div className={styles.detailsPanel}>
        <div className={styles.detailsEmpty}>
          <p>Select an application to view details</p>
        </div>
      </div>
    );
  }

  const app = optimisticApp ?? application;

  async function handleSave(field_name: ApplicationFieldName) {
    if (!application || saving) return;
    setSaving(true);

    const rawValue =
      field_name === "salary_per_hour" || field_name === "salary_yearly"
        ? editValue === "" || editValue === "N/A"
          ? null
          : Number(editValue)
        : field_name === "date_applied"
          ? editValue || null
          : editValue === "N/A" || editValue === ""
            ? null
            : editValue;

    const merged: Application = { ...application };
    if (field_name === "salary_per_hour") merged.salary_per_hour = rawValue as number | null;
    else if (field_name === "salary_yearly") merged.salary_per_hour = rawValue as number | null;
    else if (field_name === "location_type") merged.location_type = rawValue as LocationType | null;
    else if (field_name === "location") merged.location = rawValue as string | null;
    else if (field_name === "contact_person") merged.contact_person = rawValue as string | null;
    else if (field_name === "status") merged.status = (rawValue as ApplicationStatus) ?? "applied";
    else if (field_name === "date_applied") merged.date_applied = (rawValue as string) ?? application.date_applied;
    else if (field_name === "notes") merged.notes = rawValue as string | null;

    fetch(`/api/applications/${application.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ field_name, value: rawValue }),
    })
      .then(async (res) => {
        if (res.ok) {
          onEventsChange();
          return;
        }
        const body = await res.json().catch(() => ({}));
        const msg = body?.details ?? body?.error ?? res.statusText;
        console.error("Save failed:", msg);
        alert(`Save failed: ${msg}`);
      })
      .catch((err) => {
        console.error("Save request failed:", err);
        alert("Save request failed. Check the console.");
      });

    setEditingField(null);
    setEditValue("");
    setOptimisticApp(merged);
    setSaving(false);
    onApplicationUpdated(merged);
  }

  const fields: {
    label: string;
    value: string;
    fieldName?: ApplicationFieldName;
    label2?: string;
    value2?: string;
    fieldName2?: ApplicationFieldName;
    isEmpty?: boolean;
    isStatus?: boolean;
  }[] = [
    {
      label: "Salary / Hour",
      value: app.salary_per_hour != null ? `$${app.salary_per_hour}` : "N/A",
      fieldName: "salary_per_hour",
    },
    {
      label: "Location Type",
      value: app.location_type ? LOCATION_LABELS[app.location_type] : "N/A",
      fieldName: "location_type",
      label2: "Location",
      value2: app.location || "N/A",
      fieldName2: "location",
    },
    {
      label: "Contact Person",
      value: app.contact_person || "N/A",
      fieldName: "contact_person",
      label2: "Date Applied",
      value2: app.date_applied
        ? new Date(app.date_applied).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })
        : "N/A",
      fieldName2: "date_applied",
    },
    {
      label: "Status",
      value: STATUS_LABELS[app.status],
      fieldName: "status",
      isStatus: true,
    },
    {
      label: "Notes",
      value: app.notes || "",
      isEmpty: !app.notes,
      fieldName: "notes",
    },
  ];

  const linkedEmails = emails.filter((e) => e.linked);

  function renderEditOrValue(
    fieldName: ApplicationFieldName,
    displayValue: string,
    isEmpty?: boolean,
  ) {
    const isEditing = editingField === fieldName;

    if (fieldName === "notes") {
      if (isEditing) {
        return (
          <div className={styles.fieldEditWrap}>
            <textarea
              className={styles.fieldInput}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              rows={3}
              autoFocus
            />
            <button
              type="button"
              className={styles.fieldCancelBtn}
              onClick={cancelEdit}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="button"
              className={styles.fieldSaveBtn}
              onClick={() => handleSave("notes")}
              disabled={saving}
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : "Save"}
            </button>
          </div>
        );
      }
      return (
        <span className={styles.fieldValue}>
          {isEmpty ? (
            <em className={styles.fieldEmpty}>No notes added.</em>
          ) : (
            displayValue
          )}
        </span>
      );
    }

    if (fieldName === "status") {
      if (isEditing) {
        return (
          <div className={styles.fieldEditWrap}>
            <select
              className={styles.fieldSelect}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              autoFocus
            >
              {(Object.entries(STATUS_LABELS) as [ApplicationStatus, string][]).map(
                ([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ),
              )}
            </select>
            <button
              type="button"
              className={styles.fieldCancelBtn}
              onClick={cancelEdit}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="button"
              className={styles.fieldSaveBtn}
              onClick={() => handleSave("status")}
              disabled={saving}
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : "Save"}
            </button>
          </div>
        );
      }
      return <span className={styles.fieldValue}>{displayValue}</span>;
    }

    if (fieldName === "location_type") {
      if (isEditing) {
        return (
          <div className={styles.fieldEditWrap}>
            <select
              className={styles.fieldSelect}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              autoFocus
            >
              <option value="">N/A</option>
              {(Object.entries(LOCATION_LABELS) as [LocationType, string][]).map(
                ([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ),
              )}
            </select>
            <button
              type="button"
              className={styles.fieldCancelBtn}
              onClick={cancelEdit}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="button"
              className={styles.fieldSaveBtn}
              onClick={() => handleSave("location_type")}
              disabled={saving}
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : "Save"}
            </button>
          </div>
        );
      }
      return <span className={styles.fieldValue}>{displayValue}</span>;
    }

    if (fieldName === "date_applied") {
      if (isEditing) {
        const raw =
          app.date_applied?.slice(0, 10) ||
          new Date().toISOString().slice(0, 10);
        return (
          <div className={styles.fieldEditWrap}>
            <input
              type="date"
              className={styles.fieldInput}
              value={editValue || raw}
              onChange={(e) => setEditValue(e.target.value)}
              autoFocus
            />
            <button
              type="button"
              className={styles.fieldCancelBtn}
              onClick={cancelEdit}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="button"
              className={styles.fieldSaveBtn}
              onClick={() => handleSave("date_applied")}
              disabled={saving}
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : "Save"}
            </button>
          </div>
        );
      }
      return <span className={styles.fieldValue}>{displayValue}</span>;
    }

    if (isEditing) {
      const isNum =
        fieldName === "salary_per_hour" || fieldName === "salary_yearly";
      return (
        <div className={styles.fieldEditWrap}>
          <input
            type={isNum ? "number" : "text"}
            className={styles.fieldInput}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            placeholder={isNum ? "e.g. 45" : ""}
            autoFocus
          />
          <button
            type="button"
            className={styles.fieldCancelBtn}
            onClick={cancelEdit}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            type="button"
            className={styles.fieldSaveBtn}
            onClick={() => handleSave(fieldName)}
            disabled={saving}
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : "Save"}
          </button>
        </div>
      );
    }

    return (
      <span className={styles.fieldValue}>
        {isEmpty ? (
          <em className={styles.fieldEmpty}>No notes added.</em>
        ) : (
          displayValue
        )}
      </span>
    );
  }

  function startEdit(
    fieldName: ApplicationFieldName,
    currentValue: string,
    raw?: string | number | null,
  ) {
    setEditingField(fieldName);
    if (fieldName === "salary_per_hour" || fieldName === "salary_yearly") {
      setEditValue(raw != null && raw !== "" ? String(raw) : "");
    } else if (fieldName === "date_applied" && app.date_applied) {
      setEditValue(app.date_applied.slice(0, 10));
    } else if (fieldName === "status") {
      setEditValue(app.status);
    } else if (fieldName === "location_type") {
      setEditValue(app.location_type ?? "");
    } else {
      setEditValue(currentValue === "N/A" ? "" : currentValue);
    }
  }

  return (
    <ScrollArea className={styles.detailsPanel}>
      <div className={styles.detailsPanelInner}>
        <div className={styles.detailsHeader}>
          <h2 className={styles.detailsTitle}>
            {app.company_name ?? "Unknown company"} &mdash;{" "}
            {app.job_title ?? "Unknown role"}
          </h2>
          <button
            type="button"
            className={styles.detailsDeleteBtn}
            aria-label="Delete application"
            onClick={onDeleteClick}
          >
            <Trash2 size={14} />
          </button>
        </div>

        <div className={styles.actionButtons}>
          <button
            type="button"
            className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
            style={{
              borderColor: STATUS_COLORS[app.status],
              backgroundColor: STATUS_COLORS[app.status],
              color: "white",
            }}
          >
            <Check size={16} />
            {STATUS_LABELS[app.status]}
          </button>
        </div>

        <div className={styles.detailsForm}>
          {fields.map((field, i) => (
            <motion.div
              key={i}
              className={styles.detailField}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: i * 0.03 }}
            >
              <div className={styles.fieldRow}>
                <div className={styles.fieldGroup}>
                  <span className={styles.fieldLabel}>{field.label}</span>
                  <div className={styles.fieldValueRow}>
                    {field.fieldName
                      ? renderEditOrValue(
                          field.fieldName,
                          field.value,
                          field.isEmpty,
                        )
                      : (
                        <span className={styles.fieldValue}>
                          {field.isEmpty ? (
                            <em className={styles.fieldEmpty}>
                              No notes added.
                            </em>
                          ) : (
                            field.value
                          )}
                        </span>
                      )}
                    {field.fieldName && editingField !== field.fieldName && (
                      <button
                        type="button"
                        className={styles.editBtn}
                        onClick={() =>
                          startEdit(
                            field.fieldName!,
                            field.value,
                            field.fieldName === "salary_per_hour"
                              ? app.salary_per_hour
                              : undefined,
                          )
                        }
                      >
                        Edit
                      </button>
                    )}
                  </div>
                </div>
                {field.label2 !== undefined && (
                  <div className={styles.fieldGroup}>
                    {field.label2 && (
                      <span className={styles.fieldLabel}>{field.label2}</span>
                    )}
                    <div className={styles.fieldValueRow}>
                      {field.fieldName2
                        ? renderEditOrValue(
                            field.fieldName2,
                            field.value2 ?? "",
                            false,
                          )
                        : (
                          <span className={styles.fieldValue}>
                            {field.value2}
                          </span>
                        )}
                      {field.fieldName2 && editingField !== field.fieldName2 && (
                        <button
                          type="button"
                          className={styles.editBtn}
                          onClick={() =>
                            startEdit(
                              field.fieldName2!,
                              field.value2 ?? "",
                              field.fieldName2 === "date_applied"
                                ? app.date_applied
                                : undefined,
                            )
                          }
                        >
                          Edit
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </div>

        <div className={styles.emailsForApp}>
          <h3 className={styles.sectionTitle}>Emails linked to this job</h3>
          {linkedEmails.map((email) => (
            <div key={email.id} className={styles.emailForAppRow}>
              <Mail size={16} className={styles.emailRowIcon} />
              <div className={styles.emailRowContent}>
                <span className={styles.emailRowSubject}>
                  {email.subject}
                </span>
                <span className={styles.emailRowId}>
                  Email ID: #{email.id.slice(0, 4)}
                </span>
              </div>
              <button type="button" className={styles.editBtn}>
                Edit
              </button>
            </div>
          ))}
          {linkedEmails.length === 0 && (
            <p className={styles.emptyHint}>No linked emails yet.</p>
          )}
        </div>
      </div>
    </ScrollArea>
  );
}
