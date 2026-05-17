"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "../../components/AppHeader";
import { supabase } from "../../lib/supabase";

const allowedRoles = ["admin", "moderator"];
const roleOptions = ["user", "organizer", "moderator", "admin"];

function displayName(user) {
  return user?.name || [user?.first_name, user?.last_name].filter(Boolean).join(" ") || user?.email || "Endurance user";
}

function initials(user) {
  return displayName(user)
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export default function AdminPage() {
  const router = useRouter();

  const [profile, setProfile] = useState(null);
  const [users, setUsers] = useState([]);
  const [query, setQuery] = useState("");
  const [inviteForm, setInviteForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    role: "user",
  });
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [message, setMessage] = useState("");

  const filteredUsers = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;

    return users.filter((user) =>
      [
        user.name,
        user.email,
        user.first_name,
        user.last_name,
        user.location,
        user.role,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [query, users]);

  useEffect(() => {
    loadAdmin();
  }, []);

  async function loadAdmin() {
    setLoading(true);
    setMessage("");

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

      if (!profileRow?.onboarding_completed) {
        router.replace("/onboarding");
        return;
      }

      if (!allowedRoles.includes(profileRow?.role)) {
        setProfile(profileRow || null);
        setMessage("You do not have access to the Admin page.");
        setUsers([]);
        return;
      }

      setProfile(profileRow);

      const { data: userRows, error: usersError } = await supabase
        .from("profiles")
        .select("id,name,email,avatar_url,location,role,blocked,onboarding_completed,created_at,first_name,last_name")
        .order("created_at", { ascending: false })
        .limit(250);

      if (usersError) throw usersError;

      setUsers(userRows || []);
    } catch (error) {
      console.error("Admin load error", error);
      setMessage(error?.message || "Could not load Admin page.");
    } finally {
      setLoading(false);
    }
  }

  function canEditUser(targetUser) {
    if (!profile || !targetUser) return false;
    if (profile.id === targetUser.id) return false;

    if (profile.role === "admin") return true;

    if (profile.role === "moderator") {
      return !["admin", "moderator"].includes(targetUser.role);
    }

    return false;
  }

  function canSetRole(targetUser, nextRole) {
    if (!canEditUser(targetUser)) return false;

    if (profile.role === "admin") return roleOptions.includes(nextRole);

    if (profile.role === "moderator") {
      return ["user", "organizer"].includes(nextRole);
    }

    return false;
  }

  async function updateRole(targetUser, nextRole) {
    if (!canSetRole(targetUser, nextRole)) {
      setMessage("You cannot assign that role.");
      return;
    }

    setBusyId(targetUser.id);
    setMessage("");

    try {
      const { error } = await supabase
        .from("profiles")
        .update({ role: nextRole })
        .eq("id", targetUser.id);

      if (error) throw error;

      setUsers((current) =>
        current.map((user) =>
          user.id === targetUser.id ? { ...user, role: nextRole } : user
        )
      );
      setMessage(`Role updated for ${displayName(targetUser)}.`);
    } catch (error) {
      console.error("Role update error", error);
      setMessage(error?.message || "Could not update role.");
    } finally {
      setBusyId("");
    }
  }

  async function toggleBlocked(targetUser) {
    if (!canEditUser(targetUser)) {
      setMessage("You cannot change this user.");
      return;
    }

    setBusyId(targetUser.id);
    setMessage("");

    try {
      const nextBlocked = !targetUser.blocked;

      const { error } = await supabase
        .from("profiles")
        .update({ blocked: nextBlocked })
        .eq("id", targetUser.id);

      if (error) throw error;

      setUsers((current) =>
        current.map((user) =>
          user.id === targetUser.id ? { ...user, blocked: nextBlocked } : user
        )
      );

      setMessage(nextBlocked ? "User blocked." : "User unblocked.");
    } catch (error) {
      console.error("Block user error", error);
      setMessage(error?.message || "Could not update user status.");
    } finally {
      setBusyId("");
    }
  }

  function updateInviteForm(key, value) {
    setInviteForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  async function createInvitedUser(event) {
    event.preventDefault();

    if (!profile || !allowedRoles.includes(profile.role)) {
      setMessage("You do not have access to add users.");
      return;
    }

    const firstName = inviteForm.first_name.trim();
    const lastName = inviteForm.last_name.trim();
    const email = inviteForm.email.trim().toLowerCase();
    const role = inviteForm.role || "user";

    if (!firstName) return setMessage("First name is required.");
    if (!lastName) return setMessage("Last name is required.");
    if (!email) return setMessage("Email address is required.");
    if (!canSetRole({ id: "new-user", role: "user" }, role)) {
      return setMessage("You cannot assign that role.");
    }

    setBusyId("create-user");
    setMessage("");

    try {
      const { error } = await supabase
        .from("admin_user_invites")
        .upsert(
          {
            first_name: firstName,
            last_name: lastName,
            email,
            role,
            invited_by: profile.id,
            status: "pending",
          },
          { onConflict: "email" }
        );

      if (error) throw error;

      setInviteForm({
        first_name: "",
        last_name: "",
        email: "",
        role: "user",
      });

      setMessage(`Invite prepared for ${firstName} ${lastName}. They can sign up with ${email} and will receive role: ${role}.`);
    } catch (error) {
      console.error("Create invited user error", error);
      setMessage(error?.message || "Could not prepare invited user.");
    } finally {
      setBusyId("");
    }
  }

  return (
    <main style={styles.page}>
      <section style={styles.shell}>
        <AppHeader profile={profile} compact />

        <header style={styles.header}>
          <div style={styles.kicker}>Admin</div>
          <div style={styles.titleRow}>
            <h1 style={styles.title}>Manage Endurance.</h1>
            <button type="button" onClick={() => router.push("/trainings")} style={styles.primaryButton}>
              Trainings
            </button>
          </div>
          <p style={styles.subtitle}>
            Manage users, roles and access for the verified Endurance community.
          </p>
        </header>

        <section style={styles.systemCheckCard}>
          <div>
            <div style={styles.kicker}>MVP stability</div>
            <h2 style={styles.systemCheckTitle}>Run system check</h2>
            <p style={styles.muted}>Validate database, RLS and beta flow after every deploy.</p>
          </div>

          <button type="button" onClick={() => router.push("/admin/system-check")} style={styles.primaryButton}>
            Open check
          </button>
        </section>

        <section style={styles.inviteCard}>
          <div>
            <div style={styles.kicker}>Add user</div>
            <h2 style={styles.systemCheckTitle}>Prepare invited user</h2>
            <p style={styles.muted}>
              Add first name, last name, email and role. When the user signs up with this email, onboarding applies these rights.
            </p>
          </div>

          <form onSubmit={createInvitedUser} style={styles.inviteForm}>
            <div style={styles.inviteGrid}>
              <label style={styles.label}>
                First name
                <input
                  value={inviteForm.first_name}
                  onChange={(event) => updateInviteForm("first_name", event.target.value)}
                  style={styles.input}
                />
              </label>

              <label style={styles.label}>
                Last name
                <input
                  value={inviteForm.last_name}
                  onChange={(event) => updateInviteForm("last_name", event.target.value)}
                  style={styles.input}
                />
              </label>

              <label style={styles.label}>
                Email
                <input
                  type="email"
                  value={inviteForm.email}
                  onChange={(event) => updateInviteForm("email", event.target.value)}
                  style={styles.input}
                />
              </label>

              <label style={styles.label}>
                Role
                <select
                  value={inviteForm.role}
                  onChange={(event) => updateInviteForm("role", event.target.value)}
                  style={styles.input}
                >
                  {roleOptions
                    .filter((role) => {
                      if (profile?.role === "admin") return true;
                      return ["user", "organizer"].includes(role);
                    })
                    .map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                </select>
              </label>
            </div>

            <button type="submit" disabled={busyId === "create-user"} style={styles.primaryButton}>
              {busyId === "create-user" ? "Saving..." : "Add invited user"}
            </button>
          </form>
        </section>

        {message ? <section style={styles.message}>{message}</section> : null}

        {allowedRoles.includes(profile?.role) ? (
          <>
            <section style={styles.statsGrid}>
              <div style={styles.statCard}>
                <span style={styles.statLabel}>Users</span>
                <strong style={styles.statValue}>{loading ? "…" : users.length}</strong>
                <span style={styles.statHint}>total profiles</span>
              </div>

              <div style={styles.statCard}>
                <span style={styles.statLabel}>Blocked</span>
                <strong style={styles.statValue}>{loading ? "…" : users.filter((user) => user.blocked).length}</strong>
                <span style={styles.statHint}>restricted accounts</span>
              </div>
            </section>

            <section style={styles.panel}>
              <div style={styles.panelHeader}>
                <div>
                  <div style={styles.panelKicker}>Users</div>
                  <h2 style={styles.panelTitle}>Role management</h2>
                </div>

                <button type="button" onClick={createPlaceholderUser} style={styles.secondaryButton}>
                  Add user
                </button>
              </div>

              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search name, email, location or role..."
                style={styles.searchInput}
              />

              {loading ? (
                <p style={styles.panelText}>Loading users...</p>
              ) : filteredUsers.length ? (
                <div style={styles.userList}>
                  {filteredUsers.map((user) => {
                    const editable = canEditUser(user);

                    return (
                      <article key={user.id} style={user.blocked ? styles.userCardBlocked : styles.userCard}>
                        <button
                          type="button"
                          onClick={() => router.push(`/profile/${user.id}`)}
                          style={styles.userMain}
                        >
                          {user.avatar_url ? (
                            <img src={user.avatar_url} alt="" style={styles.avatar} />
                          ) : (
                            <span style={styles.initials}>{initials(user)}</span>
                          )}

                          <span style={styles.userText}>
                            <strong>{displayName(user)}</strong>
                            <span>{user.email || "No email"}</span>
                            <small>{user.location || "Location not set"}</small>
                          </span>
                        </button>

                        <div style={styles.userControls}>
                          <select
                            value={user.role || "user"}
                            disabled={!editable || busyId === user.id}
                            onChange={(event) => updateRole(user, event.target.value)}
                            style={styles.roleSelect}
                          >
                            {roleOptions.map((role) => (
                              <option key={role} value={role} disabled={!canSetRole(user, role)}>
                                {role}
                              </option>
                            ))}
                          </select>

                          <button
                            type="button"
                            onClick={() => toggleBlocked(user)}
                            disabled={!editable || busyId === user.id}
                            style={user.blocked ? styles.unblockButton : styles.blockButton}
                          >
                            {busyId === user.id ? "..." : user.blocked ? "Unblock" : "Block"}
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <p style={styles.panelText}>No users found.</p>
              )}
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
    padding: "18px 16px 42px",
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    overflowX: "hidden",
  },
  shell: {
    width: "100%",
    maxWidth: 980,
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
  titleRow: {
    display: "grid",
    gap: 12,
  },
  title: {
    margin: 0,
    fontSize: "clamp(38px, 11vw, 64px)",
    lineHeight: 0.96,
    letterSpacing: "-0.065em",
  },
  subtitle: {
    margin: 0,
    color: "rgba(255,255,255,0.68)",
    lineHeight: 1.5,
    maxWidth: 660,
  },
  primaryButton: {
    minHeight: 46,
    borderRadius: 999,
    border: 0,
    background: "#e4ef16",
    color: "#101406",
    padding: "0 16px",
    fontWeight: 950,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  secondaryButton: {
    minHeight: 42,
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.08)",
    color: "white",
    padding: "0 15px",
    fontWeight: 950,
    cursor: "pointer",
  },
  message: {
    borderRadius: 20,
    padding: 14,
    background: "rgba(228,239,22,0.10)",
    border: "1px solid rgba(228,239,22,0.18)",
    color: "#e4ef16",
    fontWeight: 850,
    lineHeight: 1.45,
  },
  statsGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 12,
  },
  statCard: {
    minHeight: 112,
    borderRadius: 26,
    padding: 16,
    boxSizing: "border-box",
    background: glass,
    border: "1px solid rgba(255,255,255,0.13)",
    display: "grid",
    alignContent: "space-between",
  },
  statLabel: {
    color: "rgba(255,255,255,0.54)",
    fontSize: 12,
    fontWeight: 900,
    textTransform: "uppercase",
    letterSpacing: "0.12em",
  },
  statValue: {
    fontSize: 42,
    letterSpacing: "-0.06em",
    lineHeight: 0.95,
  },
  statHint: {
    color: "rgba(255,255,255,0.62)",
    fontSize: 13,
    fontWeight: 800,
  },
  panel: {
    borderRadius: 30,
    padding: 18,
    background: glass,
    border: "1px solid rgba(255,255,255,0.13)",
    display: "grid",
    gap: 14,
  },
  panelHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  panelKicker: {
    color: "#e4ef16",
    fontSize: 12,
    fontWeight: 950,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
  },
  panelTitle: {
    margin: 0,
    fontSize: 25,
    letterSpacing: "-0.05em",
  },
  panelText: {
    margin: 0,
    color: "rgba(255,255,255,0.66)",
    lineHeight: 1.45,
  },
  searchInput: {
    width: "100%",
    minHeight: 48,
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.13)",
    background: "rgba(0,0,0,0.22)",
    color: "white",
    padding: "0 16px",
    boxSizing: "border-box",
    outline: "none",
    fontSize: 15,
  },
  userList: {
    display: "grid",
    gap: 10,
  },
  userCard: {
    minHeight: 78,
    borderRadius: 24,
    padding: 10,
    background: "rgba(255,255,255,0.055)",
    border: "1px solid rgba(255,255,255,0.08)",
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr)",
    gap: 10,
  },
  userCardBlocked: {
    minHeight: 78,
    borderRadius: 24,
    padding: 10,
    background: "rgba(255,70,70,0.10)",
    border: "1px solid rgba(255,90,90,0.18)",
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr)",
    gap: 10,
  },
  userMain: {
    border: 0,
    background: "transparent",
    color: "white",
    padding: 0,
    display: "grid",
    gridTemplateColumns: "48px minmax(0, 1fr)",
    alignItems: "center",
    gap: 11,
    textAlign: "left",
    cursor: "pointer",
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 999,
    objectFit: "cover",
    border: "1px solid rgba(228,239,22,0.30)",
  },
  initials: {
    width: 48,
    height: 48,
    borderRadius: 999,
    display: "grid",
    placeItems: "center",
    background: "rgba(228,239,22,0.14)",
    color: "#e4ef16",
    border: "1px solid rgba(228,239,22,0.28)",
    fontWeight: 950,
  },
  userText: {
    minWidth: 0,
    display: "grid",
    gap: 2,
    color: "rgba(255,255,255,0.66)",
  },
  userControls: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
  },
  roleSelect: {
    minHeight: 42,
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.13)",
    background: "rgba(0,0,0,0.28)",
    color: "white",
    padding: "0 12px",
    fontWeight: 900,
  },
  blockButton: {
    minHeight: 42,
    borderRadius: 999,
    border: "1px solid rgba(255,90,90,0.22)",
    background: "rgba(255,70,70,0.10)",
    color: "#ffb4b4",
    padding: "0 14px",
    fontWeight: 950,
    cursor: "pointer",
  },
  unblockButton: {
    minHeight: 42,
    borderRadius: 999,
    border: "1px solid rgba(228,239,22,0.24)",
    background: "rgba(228,239,22,0.12)",
    color: "#e4ef16",
    padding: "0 14px",
    fontWeight: 950,
    cursor: "pointer",
  },
};
