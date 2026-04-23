"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { Briefcase, User } from "lucide-react";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { Group, Panel, Separator } from "react-resizable-panels";

import Grainient from "@/components/Grainient/Grainient";
import ApplicationsList from "./components/ApplicationsList";
import ApplicationDetails from "./components/ApplicationDetails";
import EmailsTimeline from "./components/EmailsTimeline";
import EmailViewerModal from "./components/EmailViewerModal";
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
  LocationType,
} from "@/types/applications";
import { STATUS_LABELS, LOCATION_LABELS } from "@/types/applications";

import styles from "./dashboard.module.css";

export default function DashboardPage() {
  const router = useRouter();
  const [supabase] = useState(() => createClient());

  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [applications, setApplications] = useState<Application[]>([]);
  const [selectedApp, setSelectedApp] = useState<Application | null>(null);
  const [emails, setEmails] = useState<ApplicationEmail[]>([]);
  const [rawEvents, setRawEvents] = useState<ApplicationFieldEvent[]>([]);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const applicationsRef = useRef(applications);
  applicationsRef.current = applications;
  const emailsRef = useRef(emails);
  emailsRef.current = emails;
  const rawEventsRef = useRef(rawEvents);
  rawEventsRef.current = rawEvents;
  const selectedAppRef = useRef(selectedApp);
  selectedAppRef.current = selectedApp;

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ApplicationStatus | "all">(
    "all",
  );
  const [locationFilter, setLocationFilter] = useState<LocationType | "all">(
    "all",
  );
  const [showNewModal, setShowNewModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [viewingEmail, setViewingEmail] = useState<ApplicationEmail | null>(
    null,
  );
  const [emailsToDelete, setEmailsToDelete] = useState<ApplicationEmail[]>([]);
  const [showDeleteEmailsModal, setShowDeleteEmailsModal] = useState(false);
  const [appsSelectMode, setAppsSelectMode] = useState(false);
  const [selectedApplicationIds, setSelectedApplicationIds] = useState<
    Set<number>
  >(() => new Set());
  const [applicationsToDelete, setApplicationsToDelete] = useState<
    Application[]
  >([]);
  const [showBulkDeleteApplicationsModal, setShowBulkDeleteApplicationsModal] =
    useState(false);
  const [bulkDeletingApplications, setBulkDeletingApplications] =
    useState(false);
  const authUserIdRef = useRef<string | null>(null);
  const authReadyRef = useRef(false);
  const applicationsRequestIdRef = useRef(0);

  function beginApplicationsRequest(): number {
    applicationsRequestIdRef.current += 1;
    return applicationsRequestIdRef.current;
  }

  useEffect(() => {
    let isMounted = true;

    function resetDashboardState() {
      beginApplicationsRequest();
      applicationsRef.current = [];
      emailsRef.current = [];
      rawEventsRef.current = [];
      selectedAppRef.current = null;
      beginRelatedDataRequest();
      setLoading(true);
      setApplications([]);
      setSelectedApp(null);
      setEmails([]);
      setRawEvents([]);
      setTimeline([]);
      setViewingEmail(null);
      setShowNewModal(false);
      setShowDeleteModal(false);
      setEmailsToDelete([]);
      setShowDeleteEmailsModal(false);
      setAppsSelectMode(false);
      setSelectedApplicationIds(new Set());
      setApplicationsToDelete([]);
      setShowBulkDeleteApplicationsModal(false);
      setBulkDeletingApplications(false);
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUser = session?.user ?? null;
      const nextUserId = nextUser?.id ?? null;

      if (!authReadyRef.current) {
        authUserIdRef.current = nextUserId;
        setUser(nextUser);
        return;
      }

      const prevUserId = authUserIdRef.current;

      authUserIdRef.current = nextUserId;
      setUser(nextUser);

      if (prevUserId === nextUserId) return;

      resetDashboardState();

      if (!nextUserId) {
        router.replace("/login");
        return;
      }
    });

    supabase.auth.getUser().then(({ data: { user: u } }) => {
      if (!isMounted) return;
      authUserIdRef.current = u?.id ?? null;
      authReadyRef.current = true;
      setUser(u);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [router, supabase.auth]);

  async function refetchApplications() {
    if (!user) return;

    const requestId = beginApplicationsRequest();
    const userId = user.id;
    setLoading(true);
    const res = await fetch("/api/applications", { credentials: "include" });
    const data = await res.json().catch(() => []);

    if (
      requestId !== applicationsRequestIdRef.current ||
      authUserIdRef.current !== userId
    ) {
      return;
    }

    if (res.ok && Array.isArray(data)) {
      applicationsRef.current = data;
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

  useEffect(() => {
    refetchApplications();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const FIELD_LABELS: Record<string, string> = {
    salary_per_hour: "Salary / hour",
    salary_yearly: "Salary (yearly)",
    location_type: "Location type",
    location: "Location",
    contact_person: "Contact person",
    status: "Status",
    date_applied: "Date applied",
    notes: "Notes",
  };

  function fieldEventToTimelineEvent(
    e: ApplicationFieldEvent,
    appId: number,
    emailMeta?: { subject: string; sender: string },
  ): TimelineEvent {
    const source =
      e.source_type === "manual"
        ? "manual_update"
        : e.source_type === "email"
          ? "email_update"
          : "scraped";

    let valueStr = "";
    if (e.value_number != null) valueStr = String(e.value_number);
    else if (e.value_text) valueStr = e.value_text;
    else if (e.value_date) valueStr = e.value_date;
    else if (e.value_status) valueStr = STATUS_LABELS[e.value_status];
    else if (e.value_location_type)
      valueStr = LOCATION_LABELS[e.value_location_type];

    const label = FIELD_LABELS[e.field_name] ?? e.field_name;
    const val = valueStr || "N/A";
    const description = `${label} set to ${val}`;

    return {
      id: String(e.id),
      application_id: String(appId),
      event_type: source,
      description,
      field_label: label,
      value_label: val,
      email_id: e.email_id,
      email_subject: emailMeta?.subject ?? null,
      email_sender: emailMeta?.sender ?? null,
      detail: null,
      confidence: null,
      link_url: null,
      link_label: null,
      created_at: e.event_time ?? e.created_at,
    };
  }

  function buildTimeline(
    emailsList: ApplicationEmail[],
    eventsList: ApplicationFieldEvent[],
    appId: number,
  ): TimelineEvent[] {
    const emailById = new Map<number, ApplicationEmail>();
    for (const em of emailsList) {
      emailById.set(Number(em.id), em);
    }

    const emailIdsWithEvents = new Set<number>();
    const mapped = eventsList.map((e) => {
      const emailMeta = e.email_id ? emailById.get(e.email_id) : undefined;
      if (e.email_id && emailMeta) emailIdsWithEvents.add(e.email_id);
      return fieldEventToTimelineEvent(
        e,
        appId,
        emailMeta
          ? { subject: emailMeta.subject, sender: emailMeta.sender }
          : undefined,
      );
    });

    const standaloneEmails: TimelineEvent[] = emailsList
      .filter((em) => !emailIdsWithEvents.has(Number(em.id)))
      .map((email) => ({
        id: `email-${email.id}`,
        application_id: String(email.application_id),
        event_type: "email_update" as const,
        description: `Email received: ${email.subject}`,
        field_label: null,
        value_label: email.subject || null,
        detail: `From ${email.sender}`,
        confidence: email.confidence,
        link_url: null,
        link_label: null,
        created_at: email.received_date,
        email_id: Number(email.id),
        email_subject: email.subject,
        email_sender: email.sender,
      }));

    return [...mapped, ...standaloneEmails].sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
  }

  function recalculateAppLocally(
    app: Application,
    events: ApplicationFieldEvent[],
    emailsList: ApplicationEmail[],
  ): Application {
    const inactiveEmailIds = new Set(
      emailsList.filter((e) => !e.linked).map((e) => Number(e.id)),
    );

    const result: Record<string, unknown> = {};
    const seen = new Set<string>();

    for (const ev of events) {
      const f = ev.field_name;
      if (seen.has(f)) continue;
      if (ev.email_id != null && inactiveEmailIds.has(ev.email_id)) continue;
      seen.add(f);

      switch (f) {
        case "status":
          result.status = ev.value_status ?? null;
          break;
        case "salary_per_hour":
          result.salary_per_hour = ev.value_number ?? null;
          break;
        case "location_type":
          result.location_type = ev.value_location_type ?? null;
          break;
        case "location":
          result.location = ev.value_text ?? null;
          break;
        case "contact_person":
          result.contact_person = ev.value_text ?? null;
          break;
        case "date_applied":
          result.date_applied = ev.value_date ?? null;
          break;
        case "notes":
          result.notes = ev.value_text ?? null;
          break;
      }
    }

    return {
      ...app,
      status: (result.status as ApplicationStatus) ?? "applied",
      salary_per_hour: (result.salary_per_hour as number | null) ?? null,
      location_type:
        (result.location_type as Application["location_type"]) ?? null,
      location: (result.location as string | null) ?? null,
      contact_person: (result.contact_person as string | null) ?? null,
      date_applied: (result.date_applied as string) ?? app.date_applied,
      notes: (result.notes as string | null) ?? null,
      updated_at: new Date().toISOString(),
    };
  }

  const relatedDataRequestIdRef = useRef(0);

  function beginRelatedDataRequest(): number {
    relatedDataRequestIdRef.current += 1;
    return relatedDataRequestIdRef.current;
  }

  async function loadRelatedData(app: Application) {
    const requestId = beginRelatedDataRequest();

    try {
      const [emailsApiRes, eventsRes] = await Promise.all([
        fetch(`/api/emails?application_id=${app.application_id}`, {
          credentials: "include",
        }),
        fetch(`/api/applications/${app.id}/events`, {
          credentials: "include",
        }),
      ]);

      const [emailsData, eventsData] = await Promise.all([
        emailsApiRes.json().catch(() => []),
        eventsRes.json().catch(() => []),
      ]);

      if (requestId !== relatedDataRequestIdRef.current) return;

      const mappedEmails: ApplicationEmail[] = Array.isArray(emailsData)
        ? emailsData
        : [];
      emailsRef.current = mappedEmails;
      setEmails(mappedEmails);

      if (Array.isArray(eventsData)) {
        const events = eventsData as ApplicationFieldEvent[];
        rawEventsRef.current = events;
        setRawEvents(events);

        const inactiveIds = new Set(
          mappedEmails.filter((e) => !e.linked).map((e) => Number(e.id)),
        );
        const filteredEvents = events.filter(
          (ev) => ev.email_id == null || !inactiveIds.has(ev.email_id),
        );
        const linkedEmails = mappedEmails.filter((e) => e.linked);
        setTimeline(
          buildTimeline(linkedEmails, filteredEvents, app.application_id),
        );
        return;
      }

      rawEventsRef.current = [];
      setRawEvents([]);
      setTimeline([]);
    } catch (err) {
      if (requestId !== relatedDataRequestIdRef.current) return;
      console.error("Failed to load related data:", err);
      emailsRef.current = [];
      rawEventsRef.current = [];
      setEmails([]);
      setRawEvents([]);
      setTimeline([]);
    }
  }

  useEffect(() => {
    if (!selectedApp) {
      beginRelatedDataRequest();
      emailsRef.current = [];
      rawEventsRef.current = [];
      setEmails([]);
      setRawEvents([]);
      setTimeline([]);
      return;
    }

    loadRelatedData(selectedApp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedApp?.id]);

  async function refetchEvents() {
    if (!selectedApp) return;
    const res = await fetch(`/api/applications/${selectedApp.id}/events`, {
      credentials: "include",
    });
    const eventsData = await res.json().catch(() => []);
    if (Array.isArray(eventsData)) {
      const events = eventsData as ApplicationFieldEvent[];
      setRawEvents(events);
      rawEventsRef.current = events;
      const currentEmails = emailsRef.current;
      const inactiveIds = new Set(
        currentEmails.filter((e) => !e.linked).map((e) => Number(e.id)),
      );
      const filteredEvents = events.filter(
        (ev) => ev.email_id == null || !inactiveIds.has(ev.email_id),
      );
      const linkedEmails = currentEmails.filter((e) => e.linked);
      setTimeline(
        buildTimeline(linkedEmails, filteredEvents, selectedApp.application_id),
      );
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.assign("/login");
  }

  function handleRefreshPage() {
    window.location.reload();
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

  const toggleCooldownRef = useRef<Set<number>>(new Set());

  function rebuildTimelineFromEmails(nextEmails: ApplicationEmail[]) {
    const events = rawEventsRef.current;
    const app = selectedAppRef.current;
    if (!app) return;

    const inactiveEmailIds = new Set(
      nextEmails.filter((e) => !e.linked).map((e) => Number(e.id)),
    );
    const filteredEvents = events.filter(
      (ev) => ev.email_id == null || !inactiveEmailIds.has(ev.email_id),
    );
    const linkedEmails = nextEmails.filter((e) => e.linked);
    setTimeline(
      buildTimeline(linkedEmails, filteredEvents, app.application_id),
    );
  }

  function handleToggleEmailLink(email: ApplicationEmail) {
    const linkId = email.link_id;

    if (toggleCooldownRef.current.has(linkId)) return;
    toggleCooldownRef.current.add(linkId);
    setTimeout(() => toggleCooldownRef.current.delete(linkId), 600);

    const newActive = !email.linked;

    setEmails((prev) => {
      const next = prev.map((e) =>
        e.link_id === linkId ? { ...e, linked: newActive } : e,
      );
      emailsRef.current = next;
      return next;
    });

    setViewingEmail((prev) =>
      prev?.link_id === linkId ? { ...prev, linked: newActive } : prev,
    );

    const app = selectedAppRef.current;
    const events = rawEventsRef.current;
    if (app) {
      const recalculated = recalculateAppLocally(
        app,
        events,
        emailsRef.current,
      );
      setApplications((prev) =>
        prev.map((a) => (a.id === recalculated.id ? recalculated : a)),
      );
      setSelectedApp(recalculated);
      selectedAppRef.current = recalculated;
    }

    rebuildTimelineFromEmails(emailsRef.current);

    fetch("/api/emails", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ link_id: linkId, is_active: newActive }),
    }).then((res) => {
      if (!res.ok) {
        console.error("Failed to toggle email link, reverting");
        setEmails((prev) => {
          const reverted = prev.map((e) =>
            e.link_id === linkId ? { ...e, linked: !newActive } : e,
          );
          emailsRef.current = reverted;
          return reverted;
        });
        setViewingEmail((prev) =>
          prev?.link_id === linkId ? { ...prev, linked: !newActive } : prev,
        );
        const latestApp = selectedAppRef.current;
        const latestEvents = rawEventsRef.current;
        if (latestApp) {
          const revertedApp = recalculateAppLocally(
            latestApp,
            latestEvents,
            emailsRef.current,
          );
          setApplications((prev) =>
            prev.map((a) => (a.id === revertedApp.id ? revertedApp : a)),
          );
          setSelectedApp(revertedApp);
          selectedAppRef.current = revertedApp;
        }
        rebuildTimelineFromEmails(emailsRef.current);
      }
    });
  }

  async function handleDeleteApplication(app: Application) {
    setSelectedApplicationIds((prev) => {
      if (!prev.has(app.id)) return prev;
      const next = new Set(prev);
      next.delete(app.id);
      return next;
    });

    const deletingSelectedApp = selectedAppRef.current?.id === app.id;

    const nextApps = applicationsRef.current.filter((a) => a.id !== app.id);
    applicationsRef.current = nextApps;
    setApplications(nextApps);

    if (deletingSelectedApp) {
      beginRelatedDataRequest();
      emailsRef.current = [];
      rawEventsRef.current = [];
      setEmails([]);
      setRawEvents([]);
      setTimeline([]);
      setViewingEmail(null);

      const nextSelected = nextApps[0] ?? null;
      selectedAppRef.current = nextSelected;
      setSelectedApp(nextSelected);
    } else {
      setSelectedApp((prev) => (prev?.id === app.id ? null : prev));
    }

    const res = await fetch(`/api/applications/${app.id}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (res.ok) return;

    const body = await res.json().catch(() => ({}));
    const msg = body?.error ?? res.statusText;
    console.error("Failed to delete application:", msg);
    alert(`Delete failed: ${msg}`);
    await refetchApplications();
  }

  function handleToggleApplicationsSelectMode() {
    if (bulkDeletingApplications) return;
    setAppsSelectMode((prev) => !prev);
    setSelectedApplicationIds(new Set());
  }

  function handleToggleApplicationSelected(appId: number) {
    if (bulkDeletingApplications) return;
    setSelectedApplicationIds((prev) => {
      const next = new Set(prev);
      if (next.has(appId)) next.delete(appId);
      else next.add(appId);
      return next;
    });
  }

  function handleRequestBulkDeleteApplications() {
    if (bulkDeletingApplications) return;
    if (selectedApplicationIds.size === 0) return;

    const selected = applicationsRef.current.filter((a) =>
      selectedApplicationIds.has(a.id),
    );
    if (selected.length === 0) return;

    setApplicationsToDelete(selected);
    setShowBulkDeleteApplicationsModal(true);
  }

  async function handleConfirmBulkDeleteApplications() {
    if (bulkDeletingApplications) return;
    if (applicationsToDelete.length === 0) return;
    const toDelete = applicationsToDelete;

    setShowBulkDeleteApplicationsModal(false);
    setApplicationsToDelete([]);
    setAppsSelectMode(false);
    setSelectedApplicationIds(new Set());
    setBulkDeletingApplications(true);

    try {
      const ids = toDelete.map((a) => a.id);
      const idSet = new Set(ids);

      const nextApps = applicationsRef.current.filter((a) => !idSet.has(a.id));
      applicationsRef.current = nextApps;
      setApplications(nextApps);

      if (selectedAppRef.current && idSet.has(selectedAppRef.current.id)) {
        beginRelatedDataRequest();
        emailsRef.current = [];
        rawEventsRef.current = [];
        setEmails([]);
        setRawEvents([]);
        setTimeline([]);
        setViewingEmail(null);

        const nextSelected = nextApps[0] ?? null;
        selectedAppRef.current = nextSelected;
        setSelectedApp(nextSelected);
      }

      const results = await Promise.allSettled(
        ids.map(async (id) => {
          const res = await fetch(`/api/applications/${id}`, {
            method: "DELETE",
            credentials: "include",
          });
          if (res.ok) return;

          const body = await res.json().catch(() => ({}));
          const msg = body?.error ?? res.statusText;
          throw new Error(msg);
        }),
      );

      const failures = results
        .filter((r) => r.status === "rejected")
        .map((r) => (r as PromiseRejectedResult).reason);

      if (failures.length > 0) {
        console.error("Bulk delete failed:", failures);
        alert(
          `Some deletions failed (${failures.length}/${ids.length}). Refreshing applications...`,
        );
        await refetchApplications();
      }
    } finally {
      setBulkDeletingApplications(false);
    }
  }

  function handleRequestDeleteEmails(toDelete: ApplicationEmail[]) {
    setEmailsToDelete(toDelete);
    setShowDeleteEmailsModal(true);
  }

  function handleConfirmDeleteEmails() {
    if (emailsToDelete.length === 0) return;
    const toDelete = emailsToDelete;
    setShowDeleteEmailsModal(false);
    setEmailsToDelete([]);

    // Prevent any in-flight related-data fetch from overwriting optimistic UI updates.
    beginRelatedDataRequest();

    const linkIds = toDelete.map((e) => e.link_id);
    const linkIdSet = new Set(linkIds);
    const emailIdSet = new Set(
      toDelete.map((e) => Number(e.id)).filter((n) => Number.isInteger(n)),
    );

    const nextEmails = emailsRef.current.filter(
      (e) => !linkIdSet.has(e.link_id),
    );
    emailsRef.current = nextEmails;
    setEmails(nextEmails);

    if (emailIdSet.size > 0) {
      const nextEvents = rawEventsRef.current.filter(
        (ev) => ev.email_id == null || !emailIdSet.has(ev.email_id),
      );
      rawEventsRef.current = nextEvents;
      setRawEvents(nextEvents);
    }

    setViewingEmail((prev) =>
      prev && linkIdSet.has(prev.link_id) ? null : prev,
    );

    const currentApp = selectedAppRef.current;
    const deleteTargetAppId = currentApp?.id ?? null;
    if (currentApp) {
      const recalculated = recalculateAppLocally(
        currentApp,
        rawEventsRef.current,
        nextEmails,
      );
      setApplications((prev) =>
        prev.map((a) => (a.id === recalculated.id ? recalculated : a)),
      );
      setSelectedApp(recalculated);
      selectedAppRef.current = recalculated;
      rebuildTimelineFromEmails(nextEmails);
    } else {
      setTimeline([]);
    }

    fetch("/api/emails", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ link_ids: linkIds }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          const msg = errBody?.error ?? res.statusText;
          throw new Error(msg);
        }
        return res.json().catch(() => null);
      })
      .then((result) => {
        if (!result?.application) return;
        const updated = result.application as Application;
        setApplications((prev) =>
          prev.map((a) => (a.id === updated.id ? updated : a)),
        );
        setSelectedApp((prev) => (prev?.id === updated.id ? updated : prev));
        if (selectedAppRef.current?.id === updated.id) {
          selectedAppRef.current = updated;
        }
      })
      .then(() => {
        const app = selectedAppRef.current;
        if (!app || deleteTargetAppId == null || app.id !== deleteTargetAppId)
          return;
        return loadRelatedData(app);
      })
      .catch((err) => {
        console.error("Failed to delete emails:", err);
        const app = selectedAppRef.current;
        if (!app || deleteTargetAppId == null || app.id !== deleteTargetAppId)
          return;
        loadRelatedData(app);
      });
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
          className={`${styles.popup} ${showNewModal || showDeleteModal || showDeleteEmailsModal || showBulkDeleteApplicationsModal ? styles.popupBehindModal : ""}`}
        >
          <header className={styles.header}>
            <div className={styles.brandArea}>
              <button
                type="button"
                className={styles.brand}
                onClick={handleRefreshPage}
                aria-label="Refresh dashboard"
                title="Refresh dashboard"
              >
                <Briefcase className={styles.brandIcon} size={22} aria-hidden />
                <span className={styles.appName}>Pipply</span>
              </button>
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
                  selectMode={appsSelectMode}
                  selectedIds={selectedApplicationIds}
                  onToggleSelectMode={handleToggleApplicationsSelectMode}
                  onToggleSelected={handleToggleApplicationSelected}
                  onDeleteSelected={handleRequestBulkDeleteApplications}
                />
              </Panel>

              <Separator className={styles.resizeHandle} />

              <Panel id="details" defaultSize="48%" minSize="30%">
                <ApplicationDetails
                  key={selectedApp?.id ?? "empty-application"}
                  application={selectedApp}
                  emails={emails}
                  onApplicationUpdated={handleApplicationUpdated}
                  onEventsChange={refetchEvents}
                  onDeleteClick={() => setShowDeleteModal(true)}
                  onToggleEmailLink={handleToggleEmailLink}
                  onEmailClick={setViewingEmail}
                  onDeleteEmails={handleRequestDeleteEmails}
                />
              </Panel>

              <Separator className={styles.resizeHandle} />

              <Panel id="sidebar" defaultSize="30%" minSize="20%" maxSize="40%">
                <EmailsTimeline timeline={timeline} />
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
                {selectedApp?.job_title ? ` - ${selectedApp.job_title}` : ""}
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

      <Dialog
        open={showBulkDeleteApplicationsModal}
        onOpenChange={setShowBulkDeleteApplicationsModal}
      >
        <DialogContent className={styles.modalContent}>
          <DialogHeader className={styles.modalHeader}>
            <DialogTitle className={styles.modalTitle}>
              Delete{" "}
              {applicationsToDelete.length === 1
                ? "Application"
                : `${applicationsToDelete.length} Applications`}
            </DialogTitle>
            <DialogDescription className={styles.modalDesc}>
              This will permanently delete{" "}
              {applicationsToDelete.length === 1 ? (
                <strong>
                  {applicationsToDelete[0]?.company_name ?? "this application"}
                  {applicationsToDelete[0]?.job_title
                    ? ` - ${applicationsToDelete[0].job_title}`
                    : ""}
                </strong>
              ) : (
                <strong>{applicationsToDelete.length} applications</strong>
              )}
              . This action <strong>cannot be undone</strong>.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className={styles.modalFooter}>
            <Button
              variant="outline"
              className={styles.fieldCancelBtn}
              onClick={() => setShowBulkDeleteApplicationsModal(false)}
              disabled={bulkDeletingApplications}
            >
              Cancel
            </Button>
            <Button
              className={styles.deleteConfirmDeleteBtn}
              onClick={handleConfirmBulkDeleteApplications}
              disabled={
                bulkDeletingApplications || applicationsToDelete.length === 0
              }
            >
              Delete permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showDeleteEmailsModal}
        onOpenChange={setShowDeleteEmailsModal}
      >
        <DialogContent className={styles.modalContent}>
          <DialogHeader className={styles.modalHeader}>
            <DialogTitle className={styles.modalTitle}>
              Delete{" "}
              {emailsToDelete.length === 1
                ? "Email"
                : `${emailsToDelete.length} Emails`}
            </DialogTitle>
            <DialogDescription className={styles.modalDesc}>
              This will permanently delete{" "}
              {emailsToDelete.length === 1 ? (
                <strong>{emailsToDelete[0]?.subject || "this email"}</strong>
              ) : (
                <strong>{emailsToDelete.length} emails</strong>
              )}{" "}
              and all their associated timeline events. This action{" "}
              <strong>cannot be undone</strong>.
              <br />
              <br />
              If you&apos;re not sure, you can unlink the{" "}
              {emailsToDelete.length === 1 ? "email" : "emails"} instead -
              unlinking removes their effect on the application without deleting
              any data.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className={styles.modalFooter}>
            <Button
              variant="outline"
              className={styles.fieldCancelBtn}
              onClick={() => setShowDeleteEmailsModal(false)}
            >
              Cancel
            </Button>
            <Button
              className={styles.deleteConfirmDeleteBtn}
              onClick={handleConfirmDeleteEmails}
            >
              Delete permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <EmailViewerModal
        email={viewingEmail}
        onClose={() => setViewingEmail(null)}
        onToggleLink={handleToggleEmailLink}
      />
    </div>
  );
}
