"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "../../components/AppHeader";
import { supabase } from "../../lib/supabase";

const roleOptions = ["user", "organizer", "moderator", "admin"];

export default function AdminPage() {
  const router = useRouter();
  const [currentProfile, setCurrentProfile] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState("");
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");

  const filteredUsers = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) return users;

    return users.filter((user) => {
      const haystack = `${user.name || ""} ${user.email || ""} ${user.location || ""} ${user.role || ""}`.toLowerCase();
      return haystack.includes(value);
    });
  }, [users, query]);

  const loadAdmin = async () => {
    setLoading(true);
    setMessage("");

    try {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData?.user;

      if (!user?.id) {
        router.replace("/login");
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id,name,email,avatar_url,role,onboarding_completed,blocked")
        .eq("id", user.id)
        .maybeSingle();

      if (profileError) throw profileError;

      if (!profile?.onboarding_completed) {
        router.replace("/onboarding");
        return;
      }

      if (!profile || !["admin", "moderator"].includes(profile.role)) {
        setCurrentProfile(profile || null);
        setUsers([]);
        setMessage("Admin access is required for this page.");
        return;
      }

      setCurrentProfile(profile);

      const { data, error } = await supabase
        .from("profiles")
        .select("id,name,email,avatar_url,location,role,onboarding_completed,blocked,created_at")
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) throw error;
      setUsers(data || []);
    } catch (err) {
      console.error("Admin load error", err);
      setMessage(err?.message || "Could not load admin page.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAdmin();
  }, []);

  const updateRole = async (profileId, role) => {
    setMessage("");
    setSavingId(profileId);

    try {
      if (currentProfile?.role !== "admin") {
        setMessage("Only admins can change roles. Moderators can view this page.");
        return;
      }

      const { error } = await supabase
        .from("profiles")
        .update({ role })
        .eq("id", profileId);

      if (error) throw error;

      setUsers((items) => items.map((item) => (item.id === profileId ? { ...item, role } : item)));
      setMessage("Role updated.");
    } catch (err) {
      console.error("Role update error", err);
      setMessage(err?.message || "Could not update role.");
    } finally {
      setSavingId("");
    }
  };

  const toggleBlocked = async (profileId, blocked) => {
    setMessage("");
    setSavingId(profileId);

    try {
      if (currentProfile?.role !== "admin") {
        setMessage("Only admins can block or unblock users.");
        return;
      }

      const { error } = await supabase
        .from("profiles")
        .update({ blocked: !blocked })
        .eq("id", profileId);

      if (error) throw error;

      setUsers((items) => items.map((item) => (item.id === profileId ? { ...item, blocked: !blocked } : item)));
      setMessage(!blocked ? "User blocked." : "User unblocked.");
    } catch (err) {
      console.error("Block update error", err);
      setMessage(err?.message || "Could not update blocked status.");
    } finally {
      setSavingId("");
    }
  };

  return (
    <main style={styles.page}>
      <section style={styles.shell}>
        <AppHeader profile={currentProfile} compact />

        <button type="button" onClick={() => router.push("/trainings")} style={styles.backButton}>
          ← Back to trainings
        </button>

        <header style={styles.headerCard}>
          <div style={styles.kicker}>Admin</div>
          <h1 style={styles.title}>User roles & access.</h1>
          <p style={styles.subtitle}>
            Start simple: manage verified platform roles without touching training feed RLS or group logic.
          </p>
        </header>

        {message ? <div style={message.includes("updated") || message.includes("blocked") || message.includes("unblocked") ? styles.successMessage : styles.message}>{message}</div> : null}

        {loading ? (
          <section style={styles.stateCard}>
            <div style={styles.stateTitle}>Loading admin...</div>
          </section>
        ) : null}

        {!loading && ["admin", "moderator"].includes(currentProfile?.role) ? (
          <section style={styles.panel}>
            <div style={styles.toolbar}>
              <label style={styles.searchLabel}>
                Search users
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Name, email, role or location"
                  style={styles.input}
                />
              </label>

              <button type="button" onClick={loadAdmin} style={styles.refreshButton}>
                Refresh
              </button>
            </div>

            <div style={styles.userList}>
              {filteredUsers.map((item) => (
                <article key={item.id} style={styles.userCard}>
                  <div style={styles.identity}>
                    <div style={styles.avatar}>
                      {item.avatar_url ? <img src={item.avatar_url} alt="" style={styles.avatarImage} /> : getInitials(item.name || item.email)}
                    </div>
                    <div>
                      <h2 style={styles.userName}>{item.name || "Unnamed user"}</h2>
                      <p style={styles.userMeta}>{item.email}</p>
                      <p style={styles.userMeta}>{item.location || "No location"}</p>
                    </div>
                  </div>

                  <div style={styles.statusRow}>
                    <span style={item.onboarding_completed ? styles.goodPill : styles.warnPill}>
                      {item.onboarding_completed ? "Onboarded" : "Needs onboarding"}
                    </span>
                    <span style={item.blocked ? styles.blockedPill : styles.goodPill}>
                      {item.blocked ? "Blocked" : "Active"}
                    </span>
                  </div>

                  <div style={styles.controls}>
                    <label style={styles.controlLabel}>
                      Role
                      <select
                        value={item.role || "user"}
                        disabled={currentProfile?.role !== "admin" || savingId === item.id}
                        onChange={(event) => updateRole(item.id, event.target.value)}
                        style={styles.select}
                      >
                        {roleOptions.map((role) => <option key={role} value={role}>{role}</option>)}
                      </select>
                    </label>

                    <button
                      type="button"
                      disabled={currentProfile?.role !== "admin" || savingId === item.id || item.id === currentProfile?.id}
                      onClick={() => toggleBlocked(item.id, item.blocked)}
                      style={item.blocked ? styles.unblockButton : styles.blockButton}
                    >
                      {savingId === item.id ? "Saving..." : item.blocked ? "Unblock" : "Block"}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}
      </section>
    </main>
  );
}

function getInitials(value) {
  return String(value)
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "E";
}

const baseButton = { border: 0, cursor: "pointer", fontWeight: 950 };

const styles = {
  page: {
    minHeight: "100vh",
    background: "radial-gradient(circle at top right, rgba(228,239,22,0.12), transparent 30%), linear-gradient(180deg, #07100b 0%, #050505 65%, #020202 100%)",
    color: "white",
    padding: "18px 18px 34px",
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },
  shell: { width: "min(960px, 100%)", margin: "0 auto", display: "grid", gap: 18 },
  backButton: { ...baseButton, justifySelf: "start", borderRadius: 999, padding: "10px 13px", background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.11)", color: "rgba(255,255,255,0.84)" },
  headerCard: { borderRadius: 32, padding: 22, background: "linear-gradient(145deg, rgba(255,255,255,0.105), rgba(255,255,255,0.045))", border: "1px solid rgba(255,255,255,0.14)" },
  kicker: { color: "#e4ef16", fontSize: 13, fontWeight: 950, letterSpacing: "0.14em", textTransform: "uppercase" },
  title: { margin: "10px 0 0", fontSize: "clamp(34px, 8vw, 60px)", lineHeight: 0.98, letterSpacing: "-0.06em" },
  subtitle: { margin: "14px 0 0", color: "rgba(255,255,255,0.68)", lineHeight: 1.5 },
  panel: { display: "grid", gap: 14 },
  toolbar: { display: "flex", gap: 12, alignItems: "end", flexWrap: "wrap" },
  searchLabel: { display: "grid", gap: 8, flex: "1 1 260px", color: "rgba(255,255,255,0.76)", fontSize: 13, fontWeight: 850 },
  input: { width: "100%", minHeight: 52, borderRadius: 18, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.26)", color: "white", padding: "0 14px", boxSizing: "border-box", fontSize: 16, outline: "none" },
  refreshButton: { ...baseButton, minHeight: 52, borderRadius: 18, padding: "0 16px", background: "#e4ef16", color: "#101406" },
  userList: { display: "grid", gap: 12 },
  userCard: { display: "grid", gap: 14, borderRadius: 26, padding: 16, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)" },
  identity: { display: "flex", gap: 12, alignItems: "center" },
  avatar: { width: 54, height: 54, borderRadius: 18, display: "grid", placeItems: "center", overflow: "hidden", background: "rgba(228,239,22,0.12)", border: "1px solid rgba(228,239,22,0.22)", color: "#e4ef16", fontWeight: 950 },
  avatarImage: { width: "100%", height: "100%", objectFit: "cover" },
  userName: { margin: 0, fontSize: 19, letterSpacing: "-0.02em" },
  userMeta: { margin: "4px 0 0", color: "rgba(255,255,255,0.62)", fontSize: 13 },
  statusRow: { display: "flex", gap: 8, flexWrap: "wrap" },
  goodPill: { borderRadius: 999, padding: "7px 10px", background: "rgba(228,239,22,0.10)", border: "1px solid rgba(228,239,22,0.22)", color: "#e4ef16", fontSize: 12, fontWeight: 900 },
  warnPill: { borderRadius: 999, padding: "7px 10px", background: "rgba(255,180,60,0.12)", border: "1px solid rgba(255,180,60,0.22)", color: "#ffd083", fontSize: 12, fontWeight: 900 },
  blockedPill: { borderRadius: 999, padding: "7px 10px", background: "rgba(255,60,60,0.14)", border: "1px solid rgba(255,80,80,0.22)", color: "#ffb2b2", fontSize: 12, fontWeight: 900 },
  controls: { display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "end" },
  controlLabel: { display: "grid", gap: 8, color: "rgba(255,255,255,0.76)", fontSize: 13, fontWeight: 850 },
  select: { minHeight: 46, borderRadius: 16, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.26)", color: "white", padding: "0 12px", fontSize: 15 },
  blockButton: { ...baseButton, minHeight: 46, borderRadius: 16, background: "rgba(255,60,60,0.16)", border: "1px solid rgba(255,80,80,0.22)", color: "#ffb2b2", padding: "0 14px" },
  unblockButton: { ...baseButton, minHeight: 46, borderRadius: 16, background: "rgba(228,239,22,0.13)", border: "1px solid rgba(228,239,22,0.24)", color: "#e4ef16", padding: "0 14px" },
  message: { borderRadius: 18, padding: 14, background: "rgba(255,120,80,0.12)", border: "1px solid rgba(255,160,120,0.22)", color: "rgba(255,255,255,0.86)", fontWeight: 800 },
  successMessage: { borderRadius: 18, padding: 14, background: "rgba(228,239,22,0.10)", border: "1px solid rgba(228,239,22,0.25)", color: "#e4ef16", fontWeight: 900 },
  stateCard: { borderRadius: 28, padding: 22, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)" },
  stateTitle: { fontSize: 22, fontWeight: 950 },
};
