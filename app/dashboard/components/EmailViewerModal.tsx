"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Clock,
  ChevronDown,
  Paperclip,
} from "lucide-react";
import type { ApplicationEmail, FullEmail } from "@/types/applications";
import styles from "../dashboard.module.css";

// Simple session cache for email bodies to prevent flickering on re-opens
const emailBodyCache: Record<string, FullEmail> = {};

interface EmailViewerModalProps {
  email: ApplicationEmail | null;
  onClose: () => void;
  onToggleLink: (email: ApplicationEmail) => void;
}

function formatFullDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getInitials(sender: string): string {
  if (!sender) return "?";
  const parts = sender.replace(/<.*>/, "").trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return sender[0].toUpperCase();
}

function getDisplayName(sender: string): string {
  const match = sender.match(/^(.+?)\s*<.*>$/);
  return match ? match[1].trim() : sender;
}

function getEmailAddress(sender: string): string {
  const match = sender.match(/<(.+?)>/);
  return match ? match[1] : sender;
}

function isHtml(str: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(str);
}

function EmailSkeleton() {
  return (
    <div className={styles.emailSkeleton}>
      <div className={styles.skeletonLine} style={{ width: "80%" }} />
      <div className={styles.skeletonLine} style={{ width: "95%" }} />
      <div className={styles.skeletonLine} style={{ width: "60%" }} />
      <div className={styles.skeletonLine} style={{ width: "85%", marginTop: "1rem" }} />
      <div className={styles.skeletonLine} style={{ width: "90%" }} />
      <div className={styles.skeletonLine} style={{ width: "75%" }} />
    </div>
  );
}

export default function EmailViewerModal({
  email,
  onClose,
  onToggleLink,
}: EmailViewerModalProps) {
  const [fullEmail, setFullEmail] = useState<FullEmail | null>(
    email ? emailBodyCache[email.id] || null : null
  );
  const [loading, setLoading] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    if (!email) return;

    if (emailBodyCache[email.id]) {
      setFullEmail(emailBodyCache[email.id]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setShowDetails(false);
    fetch(`/api/emails/${email.id}`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) {
          emailBodyCache[email.id] = data;
          setFullEmail(data);
        }
      })
      .catch(() => setFullEmail(null))
      .finally(() => setLoading(false));
  }, [email]);

  if (!email) return null;

  const body = fullEmail?.body ?? null;
  const hasBody = !!body;
  const bodyIsHtml = hasBody && isHtml(body);
  const displayName = getDisplayName(email.sender);
  const emailAddress = getEmailAddress(email.sender);

  return (
    <motion.div
      key="email-viewer-overlay"
      className={styles.emailViewerOverlay}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      onClick={onClose}
    >
      <motion.div
        className={styles.emailViewerModal}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{
          duration: 0.2,
          ease: "easeInOut"
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.emailViewerToolbar}>
          <button
            type="button"
            className={`${styles.emailLinkToggle} ${email.linked ? styles.emailLinkToggleActive : ""}`}
            onClick={() => onToggleLink(email)}
            title={email.linked ? "Unlink this email" : "Link this email"}
          >
            <span className={styles.emailLinkToggleTrack}>
              <span className={styles.emailLinkToggleThumb} />
            </span>
          </button>
          <span className={styles.emailViewerToggleLabel}>
            {email.linked ? "Linked" : "Unlinked"}
          </span>

          <div className={styles.emailViewerToolbarSpacer} />

          <button
            type="button"
            className={styles.emailViewerCloseBtn}
            onClick={onClose}
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <div className={styles.emailViewerContent}>
          <h1 className={styles.emailViewerSubject}>
            {email.subject || "(no subject)"}
          </h1>

          <div className={styles.emailViewerHeader}>
            <div className={styles.emailViewerAvatar}>
              {getInitials(email.sender)}
            </div>
            <div className={styles.emailViewerMeta}>
              <div className={styles.emailViewerSenderRow}>
                <span className={styles.emailViewerSenderName}>
                  {displayName}
                </span>
                <span className={styles.emailViewerSenderEmail}>
                  &lt;{emailAddress}&gt;
                </span>
              </div>
              <div className={styles.emailViewerToRow}>
                <span className={styles.emailViewerToLabel}>to me</span>
                <button
                  type="button"
                  className={styles.emailViewerDetailsToggle}
                  onClick={() => setShowDetails((v) => !v)}
                >
                  <ChevronDown
                    size={14}
                    style={{
                      transform: showDetails ? "rotate(180deg)" : "none",
                      transition: "transform 0.2s",
                    }}
                  />
                </button>
              </div>

              <AnimatePresence>
                {showDetails && (
                  <motion.div
                    className={styles.emailViewerDetails}
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    style={{ overflow: "hidden" }}
                  >
                    <div className={styles.emailViewerDetailRow}>
                      <span className={styles.emailViewerDetailLabel}>from:</span>
                      <span>{email.sender}</span>
                    </div>
                    <div className={styles.emailViewerDetailRow}>
                      <span className={styles.emailViewerDetailLabel}>date:</span>
                      <span>{formatFullDate(email.received_date)}</span>
                    </div>
                    <div className={styles.emailViewerDetailRow}>
                      <span className={styles.emailViewerDetailLabel}>subject:</span>
                      <span>{email.subject}</span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <span className={styles.emailViewerDate}>
              <Clock size={12} />
              {formatFullDate(email.received_date)}
            </span>
          </div>

          <div className={styles.emailViewerDivider} />

          {loading ? (
            <EmailSkeleton />
          ) : hasBody ? (
            bodyIsHtml ? (
              <div
                className={styles.emailViewerBody}
                dangerouslySetInnerHTML={{ __html: body }}
              />
            ) : (
              <pre className={styles.emailViewerBodyText}>{body}</pre>
            )
          ) : (
            <div className={styles.emailViewerEmptyBody}>
              <Paperclip size={32} strokeWidth={1.5} />
              <p>No email body content available</p>
              <span>
                The full content of this email hasn&apos;t been stored yet.
              </span>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
