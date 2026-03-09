"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Briefcase, User } from "lucide-react";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { Group, Panel, Separator } from "react-resizable-panels";

import Grainient from "@/components/Grainient/Grainient";
import ApplicationsList from "./components/ApplicationsList";
import ApplicationDetails from "./components/ApplicationDetails";
import EmailsTimeline from "./components/EmailsTimeline";
import NewApplicationModal from "./components/NewApplicationModal";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type {
  Application,
  ApplicationEmail,
  ApplicationFieldEvent,
  TimelineEvent,
  ApplicationStatus,
} from "@/types/applications";
import { STATUS_LABELS, LOCATION_LABELS } from "@/types/applications";

import styles from "./dashboard.module.css";

export default function DashboardPage() {
  const router = useRouter();
  const supabase = createClient();

  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [applications, setApplications] = useState<Application[]>([]);
  const [selectedApp, setSelectedApp] = useState<Application | null>(null);
  const [emails, setEmails] = useState<ApplicationEmail[]>([]);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ApplicationStatus | "all">(
    "all",
  );
  const [locationFilter, setLocationFilter] = useState<string>("all");
  const [showNewModal, setShowNewModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user: u } }) => setUser(u));
  }, [supabase.auth]);

  useEffect(() => {
    if (!user) return;

    async function fetchApplications() {
      setLoading(true);
      const res = await fetch("/api/applications", { credentials: "include" });
      const data = await res.json().catch(() => []);

      if (res.ok && Array.isArray(data)) {
        setApplications(data);
        setSelectedApp((prev) => {
          if (data.length > 0 && !prev) return data[0];
          if (prev && !data.some((a: Application) => a.id === prev?.id))
            return data[0] ?? null;
          return prev;
        });
      }
      setLoading(false);
    }

    fetchApplications();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  function fieldEventToTimelineEvent(
    e: ApplicationFieldEvent,
    appId: number,
  ): TimelineEvent {
    const source =
      e.source_type === "manual"
        ? "manual_update"
        : e.source_type === "email"
          ? "email_update"
          : "scraped";

    const fieldLabel: Record<string, string> = {
      salary_per_hour: "Salary / hour",
      salary_yearly: "Salary (yearly)",
      location_type: "Location type",
      location: "Location",
      contact_person: "Contact person",
      status: "Status",
      date_applied: "Date applied",
      notes: "Notes",
    };

    let valueStr = "";
    if (e.value_number != null) valueStr = String(e.value_number);
    else if (e.value_text) valueStr = e.value_text;
    else if (e.value_date) valueStr = e.value_date;
    else if (e.value_status) valueStr = STATUS_LABELS[e.value_status];
    else if (e.value_location_type)
      valueStr = LOCATION_LABELS[e.value_location_type];

    const label = fieldLabel[e.field_name] ?? e.field_name;
    const description =
      source === "manual_update"
        ? `Manual: ${label} set to ${valueStr || "—"}`
        : source === "email_update"
          ? `Email: ${label} → ${valueStr || "—"}`
          : `Scrape: ${label} → ${valueStr || "—"}`;

    return {
      id: String(e.id),
      application_id: String(appId),
      event_type: source,
      description,
      detail: valueStr || null,
      confidence: null,
      link_url: null,
      link_label: null,
      created_at: e.event_time ?? e.created_at,
    };
  }

  useEffect(() => {
    if (!selectedApp) {
      setEmails([]);
      setTimeline([]);
      return;
    }

    async function fetchRelatedData() {
      const [emailsRes, eventsRes] = await Promise.all([
        supabase
          .from("application_emails")
          .select("*")
          .eq("application_id", selectedApp!.id)
          .order("received_date", { ascending: false }),
        fetch(`/api/applications/${selectedApp!.id}/events`, {
          credentials: "include",
        }),
      ]);

      if (!emailsRes.error && emailsRes.data) setEmails(emailsRes.data);

      const eventsData = await eventsRes.json().catch(() => []);
      if (Array.isArray(eventsData)) {
        const mapped = (eventsData as ApplicationFieldEvent[]).map((e) =>
          fieldEventToTimelineEvent(e, selectedApp!.application_id),
        );
        setTimeline(mapped);
      } else {
        setTimeline([]);
      }
    }

    fetchRelatedData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedApp]);

  async function refetchEvents() {
    if (!selectedApp) return;
    const res = await fetch(`/api/applications/${selectedApp.id}/events`, {
      credentials: "include",
    });
    const eventsData = await res.json().catch(() => []);
    if (Array.isArray(eventsData)) {
      const mapped = (eventsData as ApplicationFieldEvent[]).map((e) =>
        fieldEventToTimelineEvent(e, selectedApp.application_id),
      );
      setTimeline(mapped);
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const displayName =
    user?.user_metadata?.full_name ??
    user?.user_metadata?.name ??
    user?.email?.split("@")[0] ??
    "User";
  const avatarUrl =
    user?.user_metadata?.avatar_url ?? user?.user_metadata?.picture;

  const filteredApps = applications.filter((app) => {
    const matchesSearch =
      searchQuery === "" ||
      (app.company_name ?? "")
        .toLowerCase()
        .includes(searchQuery.toLowerCase()) ||
      (app.job_title ?? "").toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || app.status === statusFilter;
    const matchesLocation =
      locationFilter === "all" || app.location_type === locationFilter;
    return matchesSearch && matchesStatus && matchesLocation;
  });

  function handleApplicationCreated(app: Application) {
    setApplications((prev) => [app, ...prev]);
    setSelectedApp(app);
  }

  function handleApplicationUpdated(updated: Application) {
    const next = { ...updated };
    setApplications((prev) => prev.map((a) => (a.id === next.id ? next : a)));
    setSelectedApp((prev) => (prev?.id === next.id ? next : prev));
  }

  async function handleDeleteApplication(app: Application) {
    const res = await fetch(`/api/applications/${app.id}`, {
      method: "DELETE",
    });
    if (!res.ok) return;
    setApplications((prev) => prev.filter((a) => a.id !== app.id));
    setSelectedApp((prev) => (prev?.id === app.id ? null : prev));
  }

  return (
    <div className="relative flex min-h-screen w-full flex-col">
      <motion.div
        className="fixed inset-0 -z-10"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
      >
        <Grainient
          color1="#FF9FFC"
          color2="#5227FF"
          color3="#B19EEF"
          timeSpeed={0.7}
          colorBalance={0}
          warpStrength={1}
          warpFrequency={5}
          warpSpeed={2}
          warpAmplitude={50}
          blendAngle={0}
          blendSoftness={0.05}
          rotationAmount={500}
          noiseScale={2}
          grainAmount={0.1}
          grainScale={2}
          grainAnimated={false}
          contrast={1.5}
          gamma={1}
          saturation={1}
          centerX={0}
          centerY={0}
          zoom={0.9}
        />
      </motion.div>

      <div className={styles.page}>
        <motion.div
          initial={{ y: 50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{
            duration: 1,
            delay: 0.25,
            ease: "easeInOut",
            type: "spring",
          }}
          className={`${styles.popup} ${showNewModal || showDeleteModal ? styles.popupBehindModal : ""}`}
        >
          <header className={styles.header}>
            <div className={styles.brandArea}>
              <div className={styles.brand}>
                <Briefcase className={styles.brandIcon} size={22} aria-hidden />
                <span className={styles.appName}>JobSync</span>
              </div>
              <span className={styles.headerSep}>|</span>
              <span className={styles.headerSubtitle}>Dashboard</span>
            </div>

            <div className={styles.userArea}>
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt=""
                  className={styles.userAvatar}
                  width={32}
                  height={32}
                />
              ) : (
                <span
                  className={styles.userAvatar}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <User size={16} color="#6b7280" aria-hidden />
                </span>
              )}
              <span className={styles.userName}>{displayName}</span>
              <button
                type="button"
                className={styles.logoutBtn}
                onClick={handleLogout}
              >
                Log out
              </button>
            </div>
          </header>

          <div className={styles.content}>
            <Group orientation="horizontal">
              <Panel
                id="applications"
                defaultSize="22%"
                minSize="16%"
                maxSize="35%"
              >
                <ApplicationsList
                  applications={filteredApps}
                  selectedApp={selectedApp}
                  onSelectApp={setSelectedApp}
                  onNewClick={() => setShowNewModal(true)}
                  searchQuery={searchQuery}
                  onSearchChange={setSearchQuery}
                  statusFilter={statusFilter}
                  onStatusFilterChange={setStatusFilter}
                  locationFilter={locationFilter}
                  onLocationFilterChange={setLocationFilter}
                />
              </Panel>

              <Separator className={styles.resizeHandle} />

              <Panel id="details" defaultSize="48%" minSize="30%">
                <ApplicationDetails
                  application={selectedApp}
                  emails={emails}
                  onApplicationUpdated={handleApplicationUpdated}
                  onEventsChange={refetchEvents}
                  onDeleteClick={() => setShowDeleteModal(true)}
                />
              </Panel>

              <Separator className={styles.resizeHandle} />

              <Panel id="sidebar" defaultSize="30%" minSize="20%" maxSize="40%">
                <EmailsTimeline emails={emails} timeline={timeline} />
              </Panel>
            </Group>
          </div>
        </motion.div>
      </div>

      <NewApplicationModal
        open={showNewModal}
        onOpenChange={setShowNewModal}
        onCreated={handleApplicationCreated}
      />

      <Dialog open={showDeleteModal} onOpenChange={setShowDeleteModal}>
        <DialogContent className={styles.modalContent}>
          <DialogHeader className={styles.modalHeader}>
            <DialogTitle className={styles.modalTitle}>
              Delete Application
            </DialogTitle>
            <DialogDescription className={styles.modalDesc}>
              Are you sure you want to delete{" "}
              <strong>
                {selectedApp?.company_name ?? "this application"}
                {selectedApp?.job_title ? ` — ${selectedApp.job_title}` : ""}
              </strong>
              ? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className={styles.modalFooter}>
            <Button
              variant="outline"
              className={styles.fieldCancelBtn}
              onClick={() => setShowDeleteModal(false)}
            >
              Cancel
            </Button>
            <Button
              className={styles.deleteConfirmDeleteBtn}
              onClick={() => {
                setShowDeleteModal(false);
                if (selectedApp) handleDeleteApplication(selectedApp);
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
