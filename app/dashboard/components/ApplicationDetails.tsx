"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Mail, Loader2, Trash2 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  APPLICATION_TEXT_LIMITS,
  getLimitedTextValue,
} from "@/lib/application-field-limits";
import { formatDateOnly, getLocalDateInputValue } from "@/lib/date-only";
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

const SKELETON_HOLD_MS = 600;

function SkeletonBar() {
  return (
    <motion.span
      style={{
        display: "block",
        height: "1.1em",
        width: "60%",
        borderRadius: "999px",
        background: "#d4d4d4",
      }}
      animate={{ opacity: [0.4, 0.8, 0.4] }}
      transition={{ duration: 1, repeat: Infinity, ease: "easeInOut" }}
    />
  );
}

function CharacterHint({
  current,
  limit,
}: {
  current: number;
  limit: number;
}) {
  return (
    <span
      className={`${styles.characterHint} ${current >= limit ? styles.characterHintAtLimit : ""}`}
    >
      {current} / {limit} characters
    </span>
  );
}

function AnimatedValue({ value, className, children }: {
  value: string;
  className?: string;
  children?: React.ReactNode;
}) {
  const [showSkeleton, setShowSkeleton] = useState(false);
  const [committed, setCommitted] = useState({ value, children });
  const prevValueRef = useRef(value);
  const mountedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }

    if (value === prevValueRef.current) {
      setCommitted((c) => ({ ...c, children }));
      return;
    }

    prevValueRef.current = value;
    setShowSkeleton(true);

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setCommitted({ value, children });
      setShowSkeleton(false);
    }, SKELETON_HOLD_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <span className={className} style={{ display: "block", position: "relative", minHeight: "1.2em" }}>
      {showSkeleton ? (
        <SkeletonBar />
      ) : (
        <motion.span
          key={committed.value}
          style={{ display: "block" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
        >
          {committed.children ?? committed.value}
        </motion.span>
      )}
    </span>
  );
}

interface ApplicationDetailsProps {
  application: Application | null;
  emails: ApplicationEmail[];
  onApplicationUpdated: (app: Application) => void;
  onEventsChange: () => void;
  onDeleteClick: () => void;
  onToggleEmailLink: (email: ApplicationEmail) => void;
  onEmailClick: (email: ApplicationEmail) => void;
  onDeleteEmails: (emails: ApplicationEmail[]) => void;
}

export default function ApplicationDetails({
  application,
  emails,
  onApplicationUpdated,
  onEventsChange,
  onDeleteClick,
  onToggleEmailLink,
  onEmailClick,
  onDeleteEmails,
}: ApplicationDetailsProps) {
  const [editingField, setEditingField] = useState<ApplicationFieldName | null>(
    null,
  );
  const [editValue, setEditValue] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [optimisticApp, setOptimisticApp] = useState<Application | null>(null);
  const [selectedEmailIds, setSelectedEmailIds] = useState<Set<number>>(new Set());
  const [selectMode, setSelectMode] = useState(false);

  function cancelEdit() {
    setEditingField(null);
    setEditValue("");
  }

  function getEditLimit(fieldName: ApplicationFieldName) {
    switch (fieldName) {
      case "location":
        return APPLICATION_TEXT_LIMITS.location;
      case "contact_person":
        return APPLICATION_TEXT_LIMITS.contact_person;
      case "notes":
        return APPLICATION_TEXT_LIMITS.notes;
      default:
        return null;
    }
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

    let currentValue: string | number | null = null;
    if (field_name === "salary_per_hour") currentValue = application.salary_per_hour ?? null;
    else if (field_name === "salary_yearly") currentValue = application.salary_per_hour ?? null;
    else if (field_name === "location_type") currentValue = application.location_type ?? null;
    else if (field_name === "location") currentValue = application.location ?? null;
    else if (field_name === "contact_person") currentValue = application.contact_person ?? null;
    else if (field_name === "status") currentValue = application.status;
    else if (field_name === "date_applied") currentValue = application.date_applied ?? null;
    else if (field_name === "notes") currentValue = application.notes ?? null;

    const normalizedRaw = field_name === "date_applied" && rawValue != null
      ? String(rawValue).slice(0, 10) : rawValue;
    const normalizedCurrent = field_name === "date_applied" && currentValue != null
      ? String(currentValue).slice(0, 10) : currentValue;

    if (normalizedRaw === normalizedCurrent) {
      cancelEdit();
      return;
    }

    setSaving(true);

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
      value2: formatDateOnly(app.date_applied, {
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
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

  const sortedEmails = [...emails].sort((a, b) => (a.linked === b.linked ? 0 : a.linked ? -1 : 1));

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
              onChange={(e) =>
                setEditValue(getLimitedTextValue("notes", e.target.value))
              }
              rows={3}
              autoFocus
              maxLength={APPLICATION_TEXT_LIMITS.notes}
            />
            <CharacterHint
              current={editValue.length}
              limit={APPLICATION_TEXT_LIMITS.notes}
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
        <AnimatedValue value={displayValue || "__empty__"} className={styles.fieldValue}>
          {isEmpty ? (
            <em className={styles.fieldEmpty}>No notes added.</em>
          ) : (
            displayValue
          )}
        </AnimatedValue>
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
      return <AnimatedValue value={displayValue} className={styles.fieldValue} />;
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
      return <AnimatedValue value={displayValue} className={styles.fieldValue} />;
    }

    if (fieldName === "date_applied") {
      if (isEditing) {
        const raw =
          app.date_applied?.slice(0, 10) ||
          getLocalDateInputValue();
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
      return <AnimatedValue value={displayValue} className={styles.fieldValue} />;
    }

    if (isEditing) {
      const isNum =
        fieldName === "salary_per_hour" || fieldName === "salary_yearly";
      const limit = getEditLimit(fieldName);
      const limitedField =
        fieldName === "location"
          ? "location"
          : fieldName === "contact_person"
            ? "contact_person"
            : null;

      return (
        <div className={styles.fieldEditWrap}>
          <input
            type={isNum ? "number" : "text"}
            className={styles.fieldInput}
            value={editValue}
            onChange={(e) =>
              setEditValue(
                limitedField == null
                  ? e.target.value
                  : getLimitedTextValue(
                      limitedField,
                      e.target.value,
                    ),
              )
            }
            placeholder={isNum ? "e.g. 45" : ""}
            autoFocus
            maxLength={limit ?? undefined}
          />
          {limit != null && (
            <CharacterHint current={editValue.length} limit={limit} />
          )}
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
      <AnimatedValue value={displayValue || "__empty__"} className={styles.fieldValue}>
        {isEmpty ? (
          <em className={styles.fieldEmpty}>No notes added.</em>
        ) : (
          displayValue
        )}
      </AnimatedValue>
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
            {app.company_name ?? "Unknown company"} {" - "}
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
          <motion.button
            type="button"
            className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
            style={{
              borderColor: STATUS_COLORS[app.status],
              backgroundColor: STATUS_COLORS[app.status],
              color: "white",
            }}
            layout
          >
            <Check size={16} />
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={app.status}
                initial={{ y: 6, opacity: 0, filter: "blur(2px)" }}
                animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
                exit={{ y: -6, opacity: 0, filter: "blur(2px)", position: "absolute" as const }}
                transition={{ duration: 0.2 }}
              >
                {STATUS_LABELS[app.status]}
              </motion.span>
            </AnimatePresence>
          </motion.button>
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
          <div className={styles.emailsSectionHeader}>
            <h3 className={styles.sectionTitle}>Related emails</h3>
            {emails.length > 0 && (
              <div className={styles.emailsSectionActions}>
                {selectMode && selectedEmailIds.size > 0 && (
                  <button
                    type="button"
                    className={styles.emailDeleteBtn}
                    onClick={() => {
                      const toDelete = emails.filter((e) =>
                        selectedEmailIds.has(e.link_id),
                      );
                      if (toDelete.length > 0) onDeleteEmails(toDelete);
                    }}
                  >
                    <Trash2 size={13} />
                    Delete {selectedEmailIds.size}
                  </button>
                )}
                <button
                  type="button"
                  className={styles.emailSelectModeBtn}
                  onClick={() => {
                    setSelectMode((v) => !v);
                    setSelectedEmailIds(new Set());
                  }}
                >
                  {selectMode ? "Done" : "Select"}
                </button>
              </div>
            )}
          </div>
          {sortedEmails.map((email) => {
            const isSelected = selectedEmailIds.has(email.link_id);
            return (
              <div
                key={`${email.link_id}`}
                className={`${styles.emailForAppRow} ${!email.linked ? styles.emailForAppRowUnlinked : ""}`}
                onClick={() => {
                  if (selectMode) {
                    setSelectedEmailIds((prev) => {
                      const next = new Set(prev);
                      if (next.has(email.link_id)) next.delete(email.link_id);
                      else next.add(email.link_id);
                      return next;
                    });
                  } else {
                    onEmailClick(email);
                  }
                }}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    if (!selectMode) onEmailClick(email);
                  }
                }}
              >
                {selectMode && (
                  <span
                    className={`${styles.emailCheckbox} ${isSelected ? styles.emailCheckboxChecked : ""}`}
                  >
                    {isSelected && <Check size={12} />}
                  </span>
                )}
                <Mail size={16} className={styles.emailRowIcon} />
                <div className={styles.emailRowContent}>
                  <span className={styles.emailRowSubject}>
                    {email.subject}
                  </span>
                  <span className={styles.emailRowMeta}>
                    <span className={styles.emailRowSender}>
                      {email.sender}
                    </span>
                    {email.received_date && (
                      <span className={styles.emailRowTime}>
                        {(() => {
                          const d = new Date(email.received_date);
                          const now = new Date();
                          const diffMs = now.getTime() - d.getTime();
                          const diffDays = Math.floor(diffMs / 86400000);
                          if (diffDays === 0) return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
                          if (diffDays === 1) return "Yesterday";
                          if (diffDays < 7) return d.toLocaleDateString("en-US", { weekday: "short" });
                          return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
                        })()}
                      </span>
                    )}
                  </span>
                </div>
                {!selectMode && (
                  <button
                    type="button"
                    className={`${styles.emailLinkToggle} ${email.linked ? styles.emailLinkToggleActive : ""}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleEmailLink(email);
                    }}
                    title={email.linked ? "Unlink email" : "Link email"}
                  >
                    <span className={styles.emailLinkToggleTrack}>
                      <span className={styles.emailLinkToggleThumb} />
                    </span>
                  </button>
                )}
              </div>
            );
          })}
          {emails.length === 0 && (
            <p className={styles.emptyHint}>No related emails yet.</p>
          )}
        </div>
      </div>
    </ScrollArea>
  );
}
