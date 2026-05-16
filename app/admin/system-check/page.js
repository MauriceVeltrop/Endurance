"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "../../../components/AppHeader";
import { supabase } from "../../../lib/supabase";

const allowedRoles = ["admin", "moderator"];

const tableChecks = [
  ["profiles", "Profiles"],
  ["sports", "Sports"],
  ["user_sports", "Preferred sports"],
  ["training_sessions", "Training sessions"],
  ["session_participants", "Participants"],
  ["session_availability", "Flexible availability"],
  ["training_invites", "Training invites"],
  ["training_visibility_members", "Selected visibility"],
  ["training_partners", "Team Up"],
  ["routes", "Routes"],
  ["workouts", "Workouts"],
];

const flowChecks = [
  "Login",
  "Edit profile",
  "Preferred sports saved",
  "Search user on Team page",
  "Send Team Up request",
  "Accept Team Up request",
  "Create fixed training",
  "Creator auto-joins own training",
  "Create selected training with invite",
  "Invite appears in Inbox",
  "Accept & open invite",
  "Create flexible training",
  "Participant adds availability",
  "Organizer sets final start time",
  "Calendar export works",
];

export default function SystemCheckPage() {
  const router = useRouter();

  const [profile, setProfile] = useState(null);
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tableResults, setTableResults] = useState([]);
  const [integrityResults, setIntegrityResults] = useState([]);
  const [notice, setNotice] = useState("");

  const tableSummary = useMemo(() => {
    const ok = tableResults.filter((item) => item.ok).length;
    return { ok, total: tableResults.length };
  }, [tableResults]);

  const integritySummary = useMemo(() => {
    const ok = integrityResults.filter((item) => item.status === "ok").length;
    return { ok, total: integrityResults.length };
  }, [integrityResults]);

  useEffect(() => {
    runChecks();
  }, []);

  async function runChecks() {
    setLoading(true);
    setNotice("");

    try {
      const { data: userData } = await supabase.auth.getUser();
      const authUser = userData?.user;

      if (!authUser?.id) {
        router.replace("/login");
        return;
      }

      const { data: profileRow, error: profileError } = await supabase
        .from("profiles")
        .select("id,name,email,avatar_url,role,onboarding_completed,blocked")
        .eq("id", authUser.id)
        .maybeSingle();

      if (profileError) throw profileError;

      setProfile(profileRow);

      const isAllowed = allowedRoles.includes(profileRow?.role);
      setAuthorized(isAllowed);

      if (!isAllowed) {
        setNotice("Only admins and moderators can open the system check.");
        return;
      }

      await Promise.all([runTableChecks(), runIntegrityChecks()]);
    } catch (error) {
      console.error("System check error", error);
      setNotice(error?.message || "Could not run system check.");
    } finally {
      setLoading(false);
    }
  }

  async function runTableChecks() {
    const results = await Promise.all(
      tableChecks.map(async ([table, label]) => {
        try {
          const { count, error } = await supabase
            .from(table)
            .select("*", { count: "exact", head: true });

          return {
            table,
            label,
            ok: !error,
            count: count ?? 0,
            error: error?.message || "",
          };
        } catch (error) {
          return {
            table,
            label,
            ok: false,
            count: 0,
            error: error?.message || "Unknown error",
          };
        }
      })
    );

    setTableResults(results);
  }

  async function runIntegrityChecks() {
    try {
      const { data, error } = await supabase.rpc("endurance_mvp_integrity_check");

      if (error) {
        setIntegrityResults([
          {
            check_key: "rpc_missing",
            label: "Database integrity function",
            status: "warning",
            details: "Run supabase/database-integrity-check.sql first.",
          },
        ]);
        return;
      }

      setIntegrityResults(data || []);
    } catch (error) {
      setIntegrityResults([
        {
          check_key: "rpc_error",
          label: "Database integrity function",
          status: "warning",
          details: error?.message || "Could not run integrity check.",
        },
      ]);
    }
  }

  return (
    <main style={styles.page}>
      <section style={styles.shell}>
        <AppHeader profile={profile} compact />

        <header style={styles.header}>
          <div style={styles.kicker}>Admin</div>
          <h1 style={styles.title}>MVP system check</h1>
          <p style={styles.subtitle}>
            Validate Supabase access, RLS, indexes and MVP beta flow before inviting testers.
          </p>
        </header>

        {notice ? <section style={styles.notice}>{notice}</section> : null}

        {!authorized && !loading ? (
          <section style={styles.card}>
            <h2 style={styles.cardTitle}>No access</h2>
            <p style={styles.muted}>This page is only for admins and moderators.</p>
          </section>
        ) : null}

        {authorized ? (
          <>
            <section style={styles.summaryGrid}>
              <div style={styles.summary}>
                <div style={styles.kicker}>Table access</div>
                <strong style={styles.bigNumber}>{tableSummary.ok}/{tableSummary.total}</strong>
                <p style={styles.muted}>core tables reachable</p>
              </div>

              <div style={styles.summary}>
                <div style={styles.kicker}>Integrity</div>
                <strong style={styles.bigNumber}>{integritySummary.ok}/{integritySummary.total}</strong>
                <p style={styles.muted}>constraints/indexes/RLS checks OK</p>
              </div>
            </section>

            <button type="button" onClick={runChecks} style={styles.primaryButton}>
              Re-run checks
            </button>

            <section style={styles.section}>
              <h2 style={styles.sectionTitle}>Database integrity</h2>

              <div style={styles.grid}>
                {integrityResults.map((item) => (
                  <article
                    key={item.check_key}
                    style={item.status === "ok" ? styles.checkCardOk : styles.checkCardWarning}
                  >
                    <span style={item.status === "ok" ? styles.okPill : styles.warnPill}>
                      {item.status}
                    </span>
                    <h3 style={styles.cardTitle}>{item.label}</h3>
                    <p style={styles.muted}>{item.details}</p>
                  </article>
                ))}
              </div>
            </section>

            <section style={styles.section}>
              <h2 style={styles.sectionTitle}>Table access</h2>

              <div style={styles.grid}>
                {tableResults.map((item) => (
                  <article key={item.table} style={item.ok ? styles.checkCardOk : styles.checkCardWarning}>
                    <span style={item.ok ? styles.okPill : styles.warnPill}>
                      {item.ok ? "ok" : "warning"}
                    </span>
                    <h3 style={styles.cardTitle}>{item.label}</h3>
                    <p style={styles.muted}>{item.ok ? `${item.count} rows` : item.error}</p>
                  </article>
                ))}
              </div>
            </section>

            <section style={styles.card}>
              <div style={styles.kicker}>Manual beta flow</div>
              <h2 style={styles.sectionTitle}>Run this after every deploy</h2>

              <div style={styles.flowList}>
                {flowChecks.map((item, index) => (
                  <div key={item} style={styles.flowItem}>
                    <span style={styles.stepNumber}>{index + 1}</span>
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </section>
          </>
        ) : null}
      </section>
    </main>
  );
}

const glass = "linear-gradient(145deg, rgba(255,255,255,0.105), rgba(255,255,255,0.045))";

const styles = {
  page: {
    minHeight: "100vh",
    background:
      "radial-gradient(circle at top right, rgba(228,239,22,0.12), transparent 30%), linear-gradient(180deg, #07100b 0%, #050505 65%, #020202 100%)",
    color: "white",
    padding: "18px 16px 44px",
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },
  shell: { width: "100%", maxWidth: 1040, margin: "0 auto", display: "grid", gap: 18 },
  header: { display: "grid", gap: 10 },
  kicker: { color: "#e4ef16", fontSize: 13, fontWeight: 950, letterSpacing: "0.14em", textTransform: "uppercase" },
  title: { margin: 0, fontSize: "clamp(42px, 12vw, 72px)", lineHeight: 0.92, letterSpacing: "-0.07em" },
  subtitle: { margin: 0, color: "rgba(255,255,255,0.68)", lineHeight: 1.5 },
  notice: { borderRadius: 20, padding: 14, background: "rgba(228,239,22,0.10)", border: "1px solid rgba(228,239,22,0.18)", color: "#e4ef16", fontWeight: 850 },
  summaryGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 },
  summary: { borderRadius: 28, padding: 18, background: "linear-gradient(145deg, rgba(228,239,22,0.13), rgba(255,255,255,0.045))", border: "1px solid rgba(228,239,22,0.24)" },
  bigNumber: { display: "block", marginTop: 6, fontSize: 44, letterSpacing: "-0.07em" },
  section: { display: "grid", gap: 12 },
  sectionTitle: { margin: 0, fontSize: 28, letterSpacing: "-0.05em" },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 12 },
  card: { borderRadius: 28, padding: 18, background: glass, border: "1px solid rgba(255,255,255,0.13)", display: "grid", gap: 12 },
  checkCardOk: { borderRadius: 28, padding: 18, background: "linear-gradient(145deg, rgba(228,239,22,0.10), rgba(255,255,255,0.045))", border: "1px solid rgba(228,239,22,0.20)", display: "grid", gap: 10 },
  checkCardWarning: { borderRadius: 28, padding: 18, background: glass, border: "1px solid rgba(255,90,90,0.18)", display: "grid", gap: 10 },
  okPill: { width: "fit-content", borderRadius: 999, padding: "6px 9px", background: "rgba(228,239,22,0.14)", color: "#e4ef16", fontSize: 12, fontWeight: 950 },
  warnPill: { width: "fit-content", borderRadius: 999, padding: "6px 9px", background: "rgba(255,90,90,0.12)", color: "#ffb4b4", fontSize: 12, fontWeight: 950 },
  cardTitle: { margin: 0, fontSize: 22, letterSpacing: "-0.045em" },
  muted: { margin: 0, color: "rgba(255,255,255,0.68)", lineHeight: 1.45 },
  primaryButton: { width: "fit-content", minHeight: 44, borderRadius: 999, border: 0, background: "#e4ef16", color: "#101406", padding: "0 16px", fontWeight: 950, cursor: "pointer" },
  flowList: { display: "grid", gap: 8 },
  flowItem: { minHeight: 44, display: "grid", gridTemplateColumns: "32px minmax(0,1fr)", gap: 10, alignItems: "center", padding: 10, borderRadius: 18, background: "rgba(255,255,255,0.055)" },
  stepNumber: { width: 32, height: 32, borderRadius: 999, display: "grid", placeItems: "center", background: "rgba(228,239,22,0.12)", color: "#e4ef16", fontWeight: 950 },
};
