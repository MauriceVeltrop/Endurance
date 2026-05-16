"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "../../../components/AppHeader";
import { supabase } from "../../../lib/supabase";

const allowedRoles = ["admin", "moderator"];

const tableChecks = [
  {
    key: "profiles",
    label: "Profiles",
    table: "profiles",
    description: "Needed for login, profile, Team Up and organizers.",
  },
  {
    key: "sports",
    label: "Sports",
    table: "sports",
    description: "Needed for preferred sports and create training.",
  },
  {
    key: "user_sports",
    label: "Preferred sports",
    table: "user_sports",
    description: "Needed for sport filtering and onboarding.",
  },
  {
    key: "training_sessions",
    label: "Training sessions",
    table: "training_sessions",
    description: "Main object of Endurance.",
  },
  {
    key: "session_participants",
    label: "Participants",
    table: "session_participants",
    description: "Needed for join/leave and creator auto-join.",
  },
  {
    key: "session_availability",
    label: "Flexible availability",
    table: "session_availability",
    description: "Needed for flexible planning.",
  },
  {
    key: "training_invites",
    label: "Training invites",
    table: "training_invites",
    description: "Needed for selected invites and Inbox.",
  },
  {
    key: "training_visibility_members",
    label: "Selected visibility",
    table: "training_visibility_members",
    description: "Needed for selected trainings after invite accept.",
  },
  {
    key: "training_partners",
    label: "Team Up",
    table: "training_partners",
    description: "Needed for Team page and trusted invitations.",
  },
  {
    key: "routes",
    label: "Routes",
    table: "routes",
    description: "Future Routes Pro foundation.",
  },
  {
    key: "workouts",
    label: "Workouts",
    table: "workouts",
    description: "Future Workouts Pro foundation.",
  },
];

const flowChecks = [
  "Login works",
  "Edit Profile opens edit mode and saves back to profile",
  "Preferred sports are saved",
  "Search user on Team page",
  "Send Team Up request",
  "Accept Team Up request in Inbox or Team",
  "Create fixed training",
  "Creator auto-joins own training",
  "Create selected training with invite",
  "Invite appears in recipient Inbox",
  "Accept & open invite",
  "Create flexible training",
  "Participant adds availability inside window",
  "Organizer sets final start time",
  "Calendar export works after final start time",
];

function statusLabel(check) {
  if (check.loading) return "Checking";
  if (check.ok) return "OK";
  return "Needs attention";
}

export default function SystemCheckPage() {
  const router = useRouter();

  const [profile, setProfile] = useState(null);
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [checks, setChecks] = useState({});
  const [notice, setNotice] = useState("");

  const summary = useMemo(() => {
    const values = Object.values(checks);
    const ok = values.filter((item) => item.ok).length;
    const total = values.length;
    return { ok, total };
  }, [checks]);

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

      const nextChecks = {};

      await Promise.all(
        tableChecks.map(async (item) => {
          try {
            const { count, error } = await supabase
              .from(item.table)
              .select("*", { count: "exact", head: true });

            nextChecks[item.key] = {
              ...item,
              ok: !error,
              count: count ?? 0,
              error: error?.message || "",
              loading: false,
            };
          } catch (error) {
            nextChecks[item.key] = {
              ...item,
              ok: false,
              count: 0,
              error: error?.message || "Unknown error",
              loading: false,
            };
          }
        })
      );

      setChecks(nextChecks);
    } catch (error) {
      console.error("System check error", error);
      setNotice(error?.message || "Could not run system check.");
    } finally {
      setLoading(false);
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
            Use this after running the Supabase hardening SQL and after every deploy.
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
            <section style={styles.summary}>
              <div>
                <div style={styles.kicker}>Database access</div>
                <strong style={styles.bigNumber}>
                  {summary.ok}/{summary.total}
                </strong>
                <p style={styles.muted}>tables reachable from the app client</p>
              </div>

              <button type="button" onClick={runChecks} style={styles.primaryButton}>
                Re-run checks
              </button>
            </section>

            <section style={styles.grid}>
              {tableChecks.map((item) => {
                const check = checks[item.key] || { ...item, loading: true, ok: false };

                return (
                  <article key={item.key} style={check.ok ? styles.checkCardOk : styles.checkCard}>
                    <div style={styles.checkTop}>
                      <span style={check.ok ? styles.okPill : styles.warnPill}>{statusLabel(check)}</span>
                      <span style={styles.countText}>{check.ok ? `${check.count} rows` : ""}</span>
                    </div>

                    <h2 style={styles.cardTitle}>{item.label}</h2>
                    <p style={styles.muted}>{item.description}</p>

                    {check.error ? <p style={styles.errorText}>{check.error}</p> : null}
                  </article>
                );
              })}
            </section>

            <section style={styles.card}>
              <div style={styles.kicker}>Manual beta flow test</div>
              <h2 style={styles.cardTitle}>Run this before inviting testers</h2>

              <div style={styles.flowList}>
                {flowChecks.map((item, index) => (
                  <div key={item} style={styles.flowItem}>
                    <span style={styles.stepNumber}>{index + 1}</span>
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </section>

            <section style={styles.card}>
              <div style={styles.kicker}>Important</div>
              <p style={styles.muted}>
                This page checks app access to tables. It cannot prove that every index or unique constraint exists.
                Run the hardening SQL in Supabase first, then use this page and the manual flow test.
              </p>
            </section>
          </>
        ) : null}
      </section>
    </main>
  );
}

const glass =
  "linear-gradient(145deg, rgba(255,255,255,0.105), rgba(255,255,255,0.045))";

const styles = {
  page: {
    minHeight: "100vh",
    background:
      "radial-gradient(circle at top right, rgba(228,239,22,0.12), transparent 30%), linear-gradient(180deg, #07100b 0%, #050505 65%, #020202 100%)",
    color: "white",
    padding: "18px 16px 44px",
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    overflowX: "hidden",
  },
  shell: {
    width: "100%",
    maxWidth: 1040,
    margin: "0 auto",
    display: "grid",
    gap: 18,
  },
  header: {
    display: "grid",
    gap: 10,
  },
  kicker: {
    color: "#e4ef16",
    fontSize: 13,
    fontWeight: 950,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
  },
  title: {
    margin: 0,
    fontSize: "clamp(42px, 12vw, 72px)",
    lineHeight: 0.92,
    letterSpacing: "-0.07em",
  },
  subtitle: {
    margin: 0,
    color: "rgba(255,255,255,0.68)",
    lineHeight: 1.5,
  },
  notice: {
    borderRadius: 20,
    padding: 14,
    background: "rgba(228,239,22,0.10)",
    border: "1px solid rgba(228,239,22,0.18)",
    color: "#e4ef16",
    fontWeight: 850,
  },
  summary: {
    borderRadius: 30,
    padding: 18,
    background: "linear-gradient(145deg, rgba(228,239,22,0.13), rgba(255,255,255,0.045))",
    border: "1px solid rgba(228,239,22,0.24)",
    display: "flex",
    justifyContent: "space-between",
    gap: 14,
    alignItems: "center",
    flexWrap: "wrap",
  },
  bigNumber: {
    display: "block",
    marginTop: 6,
    fontSize: 44,
    letterSpacing: "-0.07em",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
    gap: 12,
  },
  card: {
    borderRadius: 28,
    padding: 18,
    background: glass,
    border: "1px solid rgba(255,255,255,0.13)",
    display: "grid",
    gap: 12,
  },
  checkCard: {
    borderRadius: 28,
    padding: 18,
    background: glass,
    border: "1px solid rgba(255,255,255,0.13)",
    display: "grid",
    gap: 10,
  },
  checkCardOk: {
    borderRadius: 28,
    padding: 18,
    background: "linear-gradient(145deg, rgba(228,239,22,0.10), rgba(255,255,255,0.045))",
    border: "1px solid rgba(228,239,22,0.20)",
    display: "grid",
    gap: 10,
  },
  checkTop: {
    display: "flex",
    justifyContent: "space-between",
    gap: 8,
    alignItems: "center",
  },
  okPill: {
    borderRadius: 999,
    padding: "6px 9px",
    background: "rgba(228,239,22,0.14)",
    border: "1px solid rgba(228,239,22,0.24)",
    color: "#e4ef16",
    fontSize: 12,
    fontWeight: 950,
  },
  warnPill: {
    borderRadius: 999,
    padding: "6px 9px",
    background: "rgba(255,90,90,0.12)",
    border: "1px solid rgba(255,90,90,0.20)",
    color: "#ffb4b4",
    fontSize: 12,
    fontWeight: 950,
  },
  countText: {
    color: "rgba(255,255,255,0.52)",
    fontWeight: 850,
    fontSize: 12,
  },
  cardTitle: {
    margin: 0,
    fontSize: 24,
    letterSpacing: "-0.045em",
  },
  muted: {
    margin: 0,
    color: "rgba(255,255,255,0.68)",
    lineHeight: 1.45,
  },
  errorText: {
    margin: 0,
    color: "#ffb4b4",
    lineHeight: 1.4,
    fontSize: 13,
  },
  flowList: {
    display: "grid",
    gap: 8,
  },
  flowItem: {
    minHeight: 44,
    display: "grid",
    gridTemplateColumns: "32px minmax(0,1fr)",
    gap: 10,
    alignItems: "center",
    padding: 10,
    borderRadius: 18,
    background: "rgba(255,255,255,0.055)",
    border: "1px solid rgba(255,255,255,0.08)",
  },
  stepNumber: {
    width: 32,
    height: 32,
    borderRadius: 999,
    display: "grid",
    placeItems: "center",
    background: "rgba(228,239,22,0.12)",
    color: "#e4ef16",
    fontWeight: 950,
  },
  primaryButton: {
    minHeight: 44,
    borderRadius: 999,
    border: 0,
    background: "#e4ef16",
    color: "#101406",
    padding: "0 16px",
    fontWeight: 950,
    cursor: "pointer",
  },
};
