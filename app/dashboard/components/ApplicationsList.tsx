"use client";

import { motion } from "framer-motion";
import { Search, Plus, Check, Trash2, ChevronDown } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatDateOnly } from "@/lib/date-only";
import type {
  Application,
  ApplicationStatus,
  LocationType,
} from "@/types/applications";
import { LOCATION_LABELS, STATUS_LABELS, STATUS_COLORS } from "@/types/applications";
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
  locationFilter: LocationType | "all";
  onLocationFilterChange: (l: LocationType | "all") => void;
  selectMode: boolean;
  selectedIds: Set<number>;
  allSelected: boolean;
  onToggleSelectMode: () => void;
  onSelectAll: () => void;
  onClearSelected: () => void;
  onToggleSelected: (appId: number, shiftKey?: boolean) => void;
  onDeleteSelected: () => void;
}

const STATUS_FILTER_ITEMS: ApplicationStatus[] = [
  "draft",
  "applied",
  "interviewing",
  "offer",
  "rejected",
  "withdrawn",
  "ghosted",
];

const LOCATION_FILTER_ITEMS: LocationType[] = ["remote", "hybrid", "on_site"];

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
  allSelected,
  onToggleSelectMode,
  onSelectAll,
  onClearSelected,
  onToggleSelected,
  onDeleteSelected,
}: ApplicationsListProps) {
  const selectedCount = selectedIds.size;
  const bulkSelectLabel = selectedCount > 0 ? "Unselect All" : "Select All";
  const bulkSelectAction = selectedCount > 0 ? onClearSelected : onSelectAll;
  const bulkSelectDisabled =
    applications.length === 0 || (selectedCount === 0 && allSelected);
  const selectedStatusLabel =
    statusFilter === "all" ? "All" : STATUS_LABELS[statusFilter];
  const selectedLocationLabel =
    locationFilter === "all" ? "All" : LOCATION_LABELS[locationFilter];

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
        <label className={styles.filterSelectLabel}>
          <span>Status:</span>
          <span className={styles.filterSelectValue}>{selectedStatusLabel}</span>
          <select
            aria-label="Filter by status"
            className={styles.filterSelect}
            value={statusFilter}
            onChange={(e) =>
              onStatusFilterChange(e.target.value as ApplicationStatus | "all")
            }
          >
            <option value="all">All</option>
            {STATUS_FILTER_ITEMS.map((status) => (
              <option key={status} value={status}>
                {STATUS_LABELS[status]}
              </option>
            ))}
          </select>
          <ChevronDown size={14} className={styles.filterSelectIcon} />
        </label>

        <label className={styles.filterSelectLabel}>
          <span>Location:</span>
          <span className={styles.filterSelectValue}>
            {selectedLocationLabel}
          </span>
          <select
            aria-label="Filter by location"
            className={styles.filterSelect}
            value={locationFilter}
            onChange={(e) =>
              onLocationFilterChange(e.target.value as LocationType | "all")
            }
          >
            <option value="all">All</option>
            {LOCATION_FILTER_ITEMS.map((location) => (
              <option key={location} value={location}>
                {LOCATION_LABELS[location]}
              </option>
            ))}
          </select>
          <ChevronDown size={14} className={styles.filterSelectIcon} />
        </label>
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
                onClick={bulkSelectAction}
                disabled={bulkSelectDisabled}
              >
                {bulkSelectLabel}
              </button>
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
                  onClick={(event) => onToggleSelected(app.id, event.shiftKey)}
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
                        {formatDateOnly(app.date_applied, {
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
                        {formatDateOnly(app.date_applied, {
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
