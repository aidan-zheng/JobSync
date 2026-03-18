"use client";

import { motion } from "framer-motion";
import { Search, Plus, ChevronDown, Check, Trash2 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Application, ApplicationStatus } from "@/types/applications";
import { STATUS_LABELS, STATUS_COLORS } from "@/types/applications";
import styles from "../dashboard.module.css";

interface ApplicationsListProps {
  applications: Application[];
  selectedApp: Application | null;
  onSelectApp: (app: Application) => void;
  onNewClick: () => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  statusFilter: ApplicationStatus | "all";
  onStatusFilterChange: (s: ApplicationStatus | "all") => void;
  locationFilter: string;
  onLocationFilterChange: (l: string) => void;
  selectMode: boolean;
  selectedIds: Set<number>;
  onToggleSelectMode: () => void;
  onToggleSelected: (appId: number) => void;
  onDeleteSelected: () => void;
}

const COMPANY_COLORS = [
  "#404040",
  "#525252",
  "#737373",
  "#a3a3a3",
  "#262626",
  "#575757",
  "#858585",
  "#171717",
];

function getCompanyColor(company: string | null | undefined): string {
  if (company == null || company.length === 0) {
    return COMPANY_COLORS[0];
  }
  let hash = 0;
  for (let i = 0; i < company.length; i++) {
    hash = company.charCodeAt(i) + ((hash << 5) - hash);
  }
  return COMPANY_COLORS[Math.abs(hash) % COMPANY_COLORS.length];
}

export default function ApplicationsList({
  applications,
  selectedApp,
  onSelectApp,
  onNewClick,
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  locationFilter,
  onLocationFilterChange,
  selectMode,
  selectedIds,
  onToggleSelectMode,
  onToggleSelected,
  onDeleteSelected,
}: ApplicationsListProps) {
  const selectedCount = selectedIds.size;

  return (
    <div className={styles.applicationsPanel}>
      <div className={styles.panelHeader}>
        <h2 className={styles.panelTitle}>Applications</h2>
        <button type="button" className={styles.newButton} onClick={onNewClick}>
          <Plus size={14} />
          New
        </button>
      </div>

      <div className={styles.searchWrapper}>
        <Search size={16} className={styles.searchIcon} />
        <input
          type="text"
          placeholder="Search applications..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className={styles.searchInput}
        />
      </div>

      <div className={styles.filtersRow}>
        <button
          type="button"
          className={styles.filterButton}
          onClick={() => {
            const statuses: (ApplicationStatus | "all")[] = [
              "all",
              "draft",
              "applied",
              "interviewing",
              "offer",
              "rejected",
              "withdrawn",
              "ghosted",
            ];
            const idx = statuses.indexOf(statusFilter);
            onStatusFilterChange(statuses[(idx + 1) % statuses.length]);
          }}
        >
          Status:{" "}
          {statusFilter === "all" ? "All" : STATUS_LABELS[statusFilter]}
          <ChevronDown size={14} />
        </button>
        <button
          type="button"
          className={styles.filterButton}
          onClick={() => {
            const locations = ["all", "remote", "hybrid", "on_site"];
            const idx = locations.indexOf(locationFilter);
            onLocationFilterChange(locations[(idx + 1) % locations.length]);
          }}
        >
          Location: {locationFilter === "all" ? "All" : locationFilter}
          <ChevronDown size={14} />
        </button>
      </div>

      <div className={styles.listSubheader}>
        <div className={styles.listSubheaderLeft}>
          <Search size={14} className={styles.subheaderIcon} />
          Applications
        </div>
        <div className={styles.listSubheaderActions}>
          {!selectMode ? (
            <button
              type="button"
              className={styles.emailSelectModeBtn}
              onClick={onToggleSelectMode}
            >
              Select
            </button>
          ) : (
            <>
              {selectedCount > 0 && (
                <button
                  type="button"
                  className={styles.emailDeleteBtn}
                  onClick={onDeleteSelected}
                >
                  <Trash2 size={13} />
                  Delete {selectedCount}
                </button>
              )}
              <button
                type="button"
                className={styles.emailSelectModeBtn}
                onClick={onToggleSelectMode}
              >
                Done
              </button>
            </>
          )}
        </div>
      </div>

      <ScrollArea className={styles.applicationsList}>
        <div className={styles.applicationsListInner}>
          {applications.map((app, index) => (
            <motion.div
              key={app.id}
              className={styles.appCardWrap}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: index * 0.04 }}
            >
              {selectMode ? (
                <button
                  type="button"
                  className={`${styles.appCard} ${selectedIds.has(app.id) || selectedApp?.id === app.id ? styles.appCardActive : ""}`}
                  aria-pressed={selectedIds.has(app.id)}
                  onClick={() => onToggleSelected(app.id)}
                >
                  <div className={styles.appCardMain}>
                    <span
                      className={`${styles.emailCheckbox} ${selectedIds.has(app.id) ? styles.emailCheckboxChecked : ""}`}
                    >
                      {selectedIds.has(app.id) && <Check size={12} />}
                    </span>
                    <div
                      className={styles.appLogo}
                      style={{ backgroundColor: getCompanyColor(app.company_name) }}
                    >
                      <span>
                        {(app.company_name ?? "?").charAt(0).toUpperCase()}
                      </span>
                    </div>

                    <div className={styles.appInfo}>
                      <span className={styles.appCompany}>
                        {app.company_name ?? "Unknown company"}
                      </span>
                      <span className={styles.appPosition}>
                        {app.job_title ?? "Unknown role"}
                      </span>
                      <div className={styles.appMeta}>
                        <span
                          className={styles.statusBadge}
                          style={{
                            color: STATUS_COLORS[app.status],
                            backgroundColor: `${STATUS_COLORS[app.status]}15`,
                          }}
                        >
                          {STATUS_LABELS[app.status]}
                        </span>
                        <span className={styles.appDate}>
                          {new Date(app.date_applied).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                          })}
                        </span>
                      </div>
                    </div>
                  </div>
                </button>
              ) : (
              <button
                type="button"
                className={`${styles.appCard} ${selectedApp?.id === app.id ? styles.appCardActive : ""}`}
                onClick={() => onSelectApp(app)}
              >
                <div className={styles.appCardMain}>
                  <div
                    className={styles.appLogo}
                    style={{ backgroundColor: getCompanyColor(app.company_name) }}
                  >
                    <span>
                      {(app.company_name ?? "?").charAt(0).toUpperCase()}
                    </span>
                  </div>

                  <div className={styles.appInfo}>
                    <span className={styles.appCompany}>
                      {app.company_name ?? "Unknown company"}
                    </span>
                    <span className={styles.appPosition}>
                      {app.job_title ?? "Unknown role"}
                    </span>
                    <div className={styles.appMeta}>
                      <span
                        className={styles.statusBadge}
                        style={{
                          color: STATUS_COLORS[app.status],
                          backgroundColor: `${STATUS_COLORS[app.status]}15`,
                        }}
                      >
                        {STATUS_LABELS[app.status]}
                      </span>
                      <span className={styles.appDate}>
                        {new Date(app.date_applied).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    </div>
                  </div>
                </div>
              </button>
              )}
            </motion.div>
          ))}

          {applications.length === 0 && (
            <div className={styles.emptyState}>
              <p>No applications yet</p>
              <p className={styles.emptyHint}>
                Click &quot;+ New&quot; to add your first application
              </p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
