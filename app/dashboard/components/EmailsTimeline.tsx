"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FileText, Mail, PenLine, Eye, ChevronDown } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { TimelineEvent } from "@/types/applications";
import styles from "../dashboard.module.css";

interface EmailsTimelineProps {
  applicationId: number | string;
  timeline: TimelineEvent[];
  isLoading?: boolean;
}

const EVENT_CONFIG: Record<
  string,
  { label: string; icon: typeof FileText; color: string; bg: string }
> = {
  scraped: {
    label: "Scrape",
    icon: FileText,
    color: "#6b7280",
    bg: "rgba(107, 114, 128, 0.1)",
  },
  email_update: {
    label: "Email",
    icon: Mail,
    color: "#525252",
    bg: "rgba(82, 82, 82, 0.1)",
  },
  manual_update: {
    label: "Manual",
    icon: PenLine,
    color: "#404040",
    bg: "rgba(64, 64, 64, 0.08)",
  },
  status_change: {
    label: "Status",
    icon: FileText,
    color: "#525252",
    bg: "rgba(82, 82, 82, 0.1)",
  },
};

const GROUP_WINDOW_MS = 60_000;

interface TimelineGroup {
  id: string;
  event_type: string;
  events: TimelineEvent[];
  created_at: string;
  email_subject?: string;
  email_sender?: string;
}

function groupTimelineEvents(events: TimelineEvent[]): TimelineGroup[] {
  if (events.length === 0) return [];

  const emailGroups = new Map<number, TimelineEvent[]>();
  const nonEmailEvents: TimelineEvent[] = [];

  for (const event of events) {
    if (event.email_id != null && event.email_subject) {
      const list = emailGroups.get(event.email_id) ?? [];
      list.push(event);
      emailGroups.set(event.email_id, list);
    } else {
      nonEmailEvents.push(event);
    }
  }

  const emailGroupEntries: TimelineGroup[] = [];
  for (const [, emailEvents] of emailGroups) {
    const first = emailEvents[0];
    emailGroupEntries.push({
      id: `email-group-${first.email_id}`,
      event_type: "email_update",
      events: emailEvents,
      created_at: first.created_at,
      email_subject: first.email_subject ?? undefined,
      email_sender: first.email_sender ?? undefined,
    });
  }

  const typeTimeGroups: TimelineGroup[] = [];
  if (nonEmailEvents.length > 0) {
    let current: TimelineGroup = {
      id: nonEmailEvents[0].id,
      event_type: nonEmailEvents[0].event_type,
      events: [nonEmailEvents[0]],
      created_at: nonEmailEvents[0].created_at,
    };

    for (let i = 1; i < nonEmailEvents.length; i++) {
      const event = nonEmailEvents[i];
      const prevTime = new Date(
        current.events[current.events.length - 1].created_at,
      ).getTime();
      const curTime = new Date(event.created_at).getTime();
      const sameType = event.event_type === current.event_type;
      const withinWindow = Math.abs(prevTime - curTime) <= GROUP_WINDOW_MS;

      if (sameType && withinWindow) {
        current.events.push(event);
      } else {
        typeTimeGroups.push(current);
        current = {
          id: event.id,
          event_type: event.event_type,
          events: [event],
          created_at: event.created_at,
        };
      }
    }
    typeTimeGroups.push(current);
  }

  return [...emailGroupEntries, ...typeTimeGroups].sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}

function formatTime(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const LONG_VALUE_THRESHOLD = 50;

function EventDescription({ event }: { event: TimelineEvent }) {
  if (event.field_label && event.value_label) {
    const isLong = event.value_label.length > LONG_VALUE_THRESHOLD;

    if (isLong) {
      return (
        <div className={styles.timelineDescBlock}>
          <span className={styles.timelineDesc}>
            <span className={styles.timelineHighlight}>
              {event.field_label}
            </span>
            {" set to:"}
          </span>
          <div className={styles.timelineValueBlock}>
            {event.value_label}
          </div>
        </div>
      );
    }

    return (
      <span className={styles.timelineDesc}>
        <span className={styles.timelineHighlight}>{event.field_label}</span>
        {" set to "}
        <span className={styles.timelineHighlight}>{event.value_label}</span>
      </span>
    );
  }
  return <span className={styles.timelineDesc}>{event.description}</span>;
}

function ChildDescription({ event }: { event: TimelineEvent }) {
  if (!event.field_label || !event.value_label) {
    return (
      <span className={styles.timelineGroupChildDesc}>
        {event.description}
      </span>
    );
  }

  const isLong = event.value_label.length > LONG_VALUE_THRESHOLD;

  if (isLong) {
    return (
      <div className={styles.timelineDescBlock}>
        <span className={styles.timelineGroupChildDesc}>
          <span className={styles.timelineHighlight}>
            {event.field_label}
          </span>
          {" →"}
        </span>
        <div className={styles.timelineValueBlock}>
          {event.value_label}
        </div>
      </div>
    );
  }

  return (
    <span className={styles.timelineGroupChildDesc}>
      <span className={styles.timelineHighlight}>{event.field_label}</span>
      {" → "}
      <span className={styles.timelineHighlight}>{event.value_label}</span>
    </span>
  );
}

function TypeBadge({ eventType }: { eventType: string }) {
  const config = EVENT_CONFIG[eventType] ?? EVENT_CONFIG.manual_update;
  return (
    <span
      className={styles.timelineTypeBadge}
      style={{ color: config.color, backgroundColor: config.bg }}
    >
      {config.label}
    </span>
  );
}

function SingleEvent({
  event,
  showLine,
}: {
  event: TimelineEvent;
  showLine: boolean;
}) {
  const config = EVENT_CONFIG[event.event_type] ?? EVENT_CONFIG.manual_update;
  const Icon = config.icon;
  const isStandaloneEmail =
    event.email_subject && !event.field_label;

  return (
    <div className={styles.timelineEntry}>
      <div className={styles.timelineTrack}>
        <div
          className={styles.timelineDot}
          style={{ backgroundColor: config.color }}
        >
          <Icon size={12} color="white" />
        </div>
        {showLine && <div className={styles.timelineLine} />}
      </div>
      <div className={styles.timelineContent}>
        <div className={styles.timelineTopRow}>
          <TypeBadge eventType={event.event_type} />
          <span className={styles.timelineTime}>
            {formatDate(event.created_at)} · {formatTime(event.created_at)}
          </span>
        </div>
        {isStandaloneEmail ? (
          <div className={styles.timelineEmailHeader}>
            <span className={styles.timelineEmailSubject}>
              {event.email_subject}
            </span>
            {event.email_sender && (
              <span className={styles.timelineEmailSender}>
                from {event.email_sender}
              </span>
            )}
            <span className={styles.timelineDetail}>
              No field changes from this email
            </span>
          </div>
        ) : (
          <>
            <EventDescription event={event} />
            {event.detail && (
              <span className={styles.timelineDetail}>{event.detail}</span>
            )}
          </>
        )}
        {event.confidence && (
          <span className={styles.timelineConfidence}>
            {event.confidence.charAt(0).toUpperCase() +
              event.confidence.slice(1)}{" "}
            confidence
          </span>
        )}
        {event.link_url && (
          <a
            href={event.link_url}
            className={styles.timelineLink}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Eye size={12} />
            {event.link_label || "View"}
          </a>
        )}
      </div>
    </div>
  );
}

function GroupedEntry({
  group,
  showLine,
}: {
  group: TimelineGroup;
  showLine: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const config = EVENT_CONFIG[group.event_type] ?? EVENT_CONFIG.manual_update;
  const Icon = config.icon;
  const isEmail = !!group.email_subject;
  const count = group.events.length;
  const label = config.label.toLowerCase();

  return (
    <div className={styles.timelineEntry}>
      <div className={styles.timelineTrack}>
        <div
          className={styles.timelineDot}
          style={{ backgroundColor: config.color }}
        >
          <Icon size={12} color="white" />
        </div>
        {(showLine || expanded) && <div className={styles.timelineLine} />}
      </div>
      <div className={styles.timelineContent}>
        <div className={styles.timelineTopRow}>
          <TypeBadge eventType={group.event_type} />
          <span className={styles.timelineTime}>
            {formatDate(group.created_at)} · {formatTime(group.created_at)}
          </span>
        </div>

        {isEmail && (
          <div className={styles.timelineEmailHeader}>
            <span className={styles.timelineEmailSubject}>
              {group.email_subject}
            </span>
            {group.email_sender && (
              <span className={styles.timelineEmailSender}>
                from {group.email_sender}
              </span>
            )}
          </div>
        )}

        <button
          type="button"
          className={styles.timelineGroupToggle}
          onClick={() => setExpanded((v) => !v)}
        >
          <span className={styles.timelineGroupLabel}>
            {isEmail
              ? `${count} field ${count === 1 ? "change" : "changes"}`
              : `${count} ${label} ${count === 1 ? "event" : "events"}`}
          </span>
          <motion.span
            animate={{ rotate: expanded ? 180 : 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            style={{ display: "flex", flexShrink: 0 }}
          >
            <ChevronDown size={14} className={styles.timelineGroupChevron} />
          </motion.span>
        </button>

        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div
              className={styles.timelineGroupChildren}
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: "easeInOut" }}
              style={{ overflow: "hidden" }}
            >
              {group.events.map((event, j) => (
                <motion.div
                  key={event.id}
                  className={styles.timelineGroupChild}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -8 }}
                  transition={{ duration: 0.15, delay: j * 0.04 }}
                >
                  <div
                    className={styles.timelineGroupChildDot}
                    style={{ backgroundColor: config.color }}
                  />
                  <div className={styles.timelineGroupChildContent}>
                    <ChildDescription event={event} />
                    {event.detail && (
                      <span className={styles.timelineGroupChildDetail}>
                        {event.detail}
                      </span>
                    )}
                  </div>
                </motion.div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export default function EmailsTimeline({
  applicationId,
  timeline,
  isLoading = false,
}: EmailsTimelineProps) {
  const groups = groupTimelineEvents(timeline);

  return (
    <ScrollArea className={styles.rightPanel}>
      <div className={styles.rightPanelInner}>
        <section className={styles.timelineSection}>
          <h3 className={styles.sectionTitle}>Timeline</h3>

            <div className={styles.timelineList}>
              <AnimatePresence mode="popLayout" initial={false}>
                {groups.map((group, i) => {
                  const showLine = i < groups.length - 1;

                  return (
                    <motion.div
                      key={`${applicationId}-${group.id}`}
                      layout
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{
                        duration: 0.2,
                        delay: i * 0.02,
                        ease: [0.25, 0.1, 0.25, 1],
                      }}
                    >
                      {group.events.length === 1 && !group.email_subject ? (
                        <SingleEvent
                          event={group.events[0]}
                          showLine={showLine}
                        />
                      ) : (
                        <GroupedEntry group={group} showLine={showLine} />
                      )}
                    </motion.div>
                  );
                })}
              </AnimatePresence>

              {timeline.length === 0 && !isLoading && (
                <motion.p
                  className={styles.emptyHint}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.2 }}
                >
                  No timeline events yet.
                </motion.p>
              )}

              {isLoading && (
                <div className={styles.timelineLoading}>
                  <motion.span
                    animate={{ opacity: [0.4, 1, 0.4] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                  >
                    Fetching updates...
                  </motion.span>
                </div>
              )}
            </div>
        </section>
      </div>
    </ScrollArea>
  );
}
