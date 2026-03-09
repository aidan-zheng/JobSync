"use client";

import { FileText, Mail, PenLine, Eye } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ApplicationEmail, TimelineEvent } from "@/types/applications";
import styles from "../dashboard.module.css";

interface EmailsTimelineProps {
  emails: ApplicationEmail[];
  timeline: TimelineEvent[];
}

const CONFIDENCE_COLORS: Record<string, string> = {
  high: "#1a1a1a",
  medium: "#525252",
  low: "#737373",
};

const EVENT_ICONS: Record<string, typeof FileText> = {
  scraped: FileText,
  email_update: Mail,
  manual_update: PenLine,
  status_change: FileText,
};

export default function EmailsTimeline({
  emails,
  timeline,
}: EmailsTimelineProps) {
  return (
    <ScrollArea className={styles.rightPanel}>
      <div className={styles.rightPanelInner}>
        <section className={styles.timelineSection}>
          <h3 className={styles.sectionTitle}>Timeline</h3>

          <div className={styles.timelineList}>
            {timeline.map((event, i) => {
              const Icon = EVENT_ICONS[event.event_type] || FileText;
              const dotColor =
                event.event_type === "scraped"
                  ? "#6b7280"
                  : event.event_type === "email_update"
                    ? "#525252"
                    : "#737373";

              return (
                <div key={event.id} className={styles.timelineEntry}>
                  <div className={styles.timelineTrack}>
                    <div
                      className={styles.timelineDot}
                      style={{ backgroundColor: dotColor }}
                    >
                      <Icon size={12} color="white" />
                    </div>
                    {i < timeline.length - 1 && (
                      <div className={styles.timelineLine} />
                    )}
                  </div>
                  <div className={styles.timelineContent}>
                    <span className={styles.timelineDesc}>
                      {event.description}
                    </span>
                    {event.detail && (
                      <span className={styles.timelineDetail}>
                        {event.detail}
                      </span>
                    )}
                    <div className={styles.timelineMeta}>
                      {event.confidence && (
                        <span
                          className={styles.confidenceBadge}
                          style={{
                            color: CONFIDENCE_COLORS[event.confidence],
                          }}
                        >
                          Confidence:{" "}
                          {event.confidence.charAt(0).toUpperCase() +
                            event.confidence.slice(1)}
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
                    <span className={styles.timelineDate}>
                      {new Date(event.created_at).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                  </div>
                </div>
              );
            })}

            {timeline.length === 0 && (
              <p className={styles.emptyHint}>No timeline events yet.</p>
            )}
          </div>
        </section>
      </div>
    </ScrollArea>
  );
}
