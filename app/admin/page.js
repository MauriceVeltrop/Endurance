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

function formatJoined(value) {
  if (!value) return "Unknown";
  try {
    return new Date(value).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "Unknown";
  }
}

function generateTemporaryPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const symbols = "!@#";
  let password = "Endurance-";
  for (let i = 0; i < 8; i += 1) {
    password += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  password += symbols[Math.floor(Math.random() * symbols.length)];
  return password;
}

export default function AdminPage() {
  const router = useRouter();

  const [profile, setProfile] = useState(null);
  const [users, setUsers] = useState([]);
  const [pendingInviteCount, setPendingInviteCount] = useState(0);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [createMode, setCreateMode] = useState("auth");
  const [inviteForm, setInviteForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    role: "user",
    temporary_password: generateTemporaryPassword(),
  });
  const [lastCreated, setLastCreated] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [message, setMessage] = useState("");

  const isAllowed = allowedRoles.includes(profile?.role);

  const filteredUsers = useMemo(() => {
    const q = query.trim().toLowerCase();

    return users.filter((user) => {
      if (roleFilter !== "all" && user.role !== roleFilter) return false;
      if (!q) return true;

      return [
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
        .includes(q);
    });
  }, [query, roleFilter, users]);

  const blockedCount = users.filter((user) => user.blocked).length;
  const adminCount = users.filter((user) => user.role === "admin").length;

  useEffect(() => {
    loadAdmin();
  }, []);

  async function loadAdmin(options = {}) {
    setLoading(true);
    if (!options.keepMessage) setMessage("");

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

      setProfile(profileRow || null);

      if (!allowedRoles.includes(profileRow?.role)) {
        setMessage("You do not have access to the Admin page.");
        setUsers([]);
        return;
      }

      const { data: userRows, error: usersError } = await supabase
        .from("profiles")
        .select("id,name,email,avatar_url,location,role,blocked,onboarding_completed,created_at,first_name,last_name")
        .order("created_at", { ascending: false })
        .limit(250);

      if (usersError) throw usersError;

      setUsers(userRows || []);

      const { count } = await supabase
        .from("admin_user_invites")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending");

      setPendingInviteCount(count || 0);
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
    if (!profile || !targetUser) return false;

    if (targetUser.id !== "new-user" && !canEditUser(targetUser)) return false;

    if (profile.role === "admin") return roleOptions.includes(nextRole);

    if (profile.role === "moderator") {
      return ["user", "organizer"].includes(nextRole);
    }

    return false;
  }

  function updateInviteForm(key, value) {
    setInviteForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function resetCreateForm() {
    setInviteForm({
      first_name: "",
      last_name: "",
      email: "",
      role: "user",
      temporary_password: generateTemporaryPassword(),
    });
  }

  async function createOrInviteUser(event) {
    event.preventDefault();

    if (!isAllowed) {
      setMessage("You do not have access to add users.");
      return;
    }

    const firstName = inviteForm.first_name.trim();
    const lastName = inviteForm.last_name.trim();
    const email = inviteForm.email.trim().toLowerCase();
    const role = inviteForm.role || "user";
    const temporaryPassword = inviteForm.temporary_password.trim();

    if (!firstName) return setMessage("First name is required.");
    if (!lastName) return setMessage("Last name is required.");
    if (!email) return setMessage("Email address is required.");
    if (!canSetRole({ id: "new-user", role: "user" }, role)) {
      return setMessage("You cannot assign that role.");
    }

    if (createMode === "auth" && temporaryPassword.length < 8) {
      return setMessage("Temporary password must be at least 8 characters.");
    }

    setBusyId("create-user");
    setMessage("");
    setLastCreated(null);

    try {
      if (createMode === "auth") {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData?.session?.access_token;

        if (!token) throw new Error("No active session.");

        const response = await fetch("/api/admin/create-user", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            first_name: firstName,
            last_name: lastName,
            email,
            role,
            temporary_password: temporaryPassword,
          }),
        });

        const payload = await response.json();

        if (!response.ok) {
          const debugText = payload?.debug ? ` Stage: ${payload.debug.stage || "unknown"}.` : "";
          throw new Error(`${payload?.error || "Could not create user."}${debugText}`);
        }

        setLastCreated({
          email,
          temporary_password: temporaryPassword,
          role,
        });
        setMessage(
          payload?.warning
            ? `User saved, but with warning: ${payload.warning}`
            : `User created for ${firstName} ${lastName}. Share the temporary password discreetly.`
        );
      } else {
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

        setMessage(`Invite prepared for ${firstName} ${lastName}.`);
      }

      resetCreateForm();
      await loadAdmin({ keepMessage: true });
    } catch (error) {
      console.error("Create invited user error", error);
      setMessage(error?.message || "Could not create user.");
    } finally {
      setBusyId("");
    }
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

  return (
    <main style={styles.page}>
      <section style={styles.shell}>
        <AppHeader profile={profile} compact />

        <header style={styles.hero}>
          <div style={styles.kicker}>Admin</div>
          <h1 style={styles.title}>Manage Endurance<span style={styles.dot}>.</span></h1>
          <p style={styles.subtitle}>
            Manage users, roles and access for the verified Endurance community.
          </p>
        </header>

        {message ? <section style={styles.message}>{message}</section> : null}

        {lastCreated ? (
          <section style={styles.passwordNotice}>
            <div>
              <div style={styles.kicker}>Temporary login</div>
              <strong>{lastCreated.email}</strong>
              <p style={styles.muted}>
                Temporary password: <span style={styles.passwordText}>{lastCreated.temporary_password}</span>
              </p>
              <p style={styles.mutedSmall}>
                Share this discreetly. The user can change it after logging in.
              </p>
            </div>
          </section>
        ) : null}

        {!isAllowed && !loading ? (
          <section style={styles.card}>
            <h2 style={styles.cardTitle}>No access</h2>
            <p style={styles.muted}>This page is only available for moderators and admins.</p>
          </section>
        ) : null}

        {isAllowed ? (
          <>
            <section style={styles.systemCard}>
              <div style={styles.iconBubbleLime}>🛡</div>

              <div style={styles.cardCopy}>
                <h2 style={styles.cardTitle}>Run system check</h2>
                <p style={styles.muted}>Validate database, RLS and beta flow after every deploy.</p>
              </div>

              <button type="button" onClick={() => router.push("/admin/system-check")} style={styles.primaryButton}>
                Open check →
              </button>
            </section>

            <section style={styles.inviteCard} id="add-user">
              <div style={styles.sectionIntro}>
                <div style={styles.iconInline}>👤＋</div>
                <div>
                  <div style={styles.kicker}>Add user</div>
                  <h2 style={styles.cardTitle}>Create user</h2>
                  <p style={styles.muted}>
                    Create an account with a temporary password, or prepare an invite for onboarding.
                  </p>
                </div>
              </div>

              <div style={styles.modeSwitch}>
                <button
                  type="button"
                  onClick={() => setCreateMode("auth")}
                  style={createMode === "auth" ? styles.modeActive : styles.modeButton}
                >
                  Create login
                </button>
                <button
                  type="button"
                  onClick={() => setCreateMode("invite")}
                  style={createMode === "invite" ? styles.modeActive : styles.modeButton}
                >
                  Invite only
                </button>
              </div>

              <form onSubmit={createOrInviteUser} style={styles.inviteForm}>
                <div style={styles.twoColumns}>
                  <label style={styles.label}>
                    First name
                    <input
                      value={inviteForm.first_name}
                      onChange={(event) => updateInviteForm("first_name", event.target.value)}
                      placeholder="First name"
                      style={styles.input}
                    />
                  </label>

                  <label style={styles.label}>
                    Last name
                    <input
                      value={inviteForm.last_name}
                      onChange={(event) => updateInviteForm("last_name", event.target.value)}
                      placeholder="Last name"
                      style={styles.input}
                    />
                  </label>
                </div>

                <label style={styles.label}>
                  Email
                  <input
                    type="email"
                    value={inviteForm.email}
                    onChange={(event) => updateInviteForm("email", event.target.value)}
                    placeholder="email@domain.com"
                    style={styles.input}
                  />
                </label>

                <div style={styles.roleGrid}>
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

                  {createMode === "auth" ? (
                    <label style={styles.label}>
                      Temporary password
                      <div style={styles.passwordRow}>
                        <input
                          type="text"
                          value={inviteForm.temporary_password}
                          onChange={(event) => updateInviteForm("temporary_password", event.target.value)}
                          style={styles.input}
                        />
                        <button
                          type="button"
                          onClick={() => updateInviteForm("temporary_password", generateTemporaryPassword())}
                          style={styles.smallButton}
                        >
                          Generate
                        </button>
                      </div>
                    </label>
                  ) : (
                    <div style={styles.roleInfo}>
                      <span style={styles.infoIcon}>ⓘ</span>
                      <span>The user signs up later with this email. Onboarding applies the selected role.</span>
                    </div>
                  )}
                </div>

                <button type="submit" disabled={busyId === "create-user"} style={styles.primaryButtonWide}>
                  👤＋ {busyId === "create-user" ? "Saving..." : createMode === "auth" ? "Create user" : "Add invited user"}
                </button>
              </form>
            </section>

            <section style={styles.statsGrid}>
              <article style={styles.statCard}>
                <span style={styles.statIconLime}>👥</span>
                <strong style={styles.statValue}>{loading ? "…" : users.length}</strong>
                <span style={styles.statTitle}>Total users</span>
                <span style={styles.statHint}>All registered profiles</span>
              </article>

              <article style={styles.statCard}>
                <span style={styles.statIconBlue}>✉</span>
                <strong style={styles.statValue}>{pendingInviteCount}</strong>
                <span style={styles.statTitle}>Pending invites</span>
                <span style={styles.statHint}>Invites not accepted yet</span>
              </article>

              <article style={styles.statCard}>
                <span style={styles.statIconPurple}>🛡</span>
                <strong style={styles.statValue}>{loading ? "…" : blockedCount}</strong>
                <span style={styles.statTitle}>Blocked users</span>
                <span style={styles.statHint}>Restricted accounts</span>
              </article>

              <article style={styles.statCard}>
                <span style={styles.statIconOrange}>♛</span>
                <strong style={styles.statValue}>{loading ? "…" : adminCount}</strong>
                <span style={styles.statTitle}>Admins</span>
                <span style={styles.statHint}>Full system access</span>
              </article>
            </section>

            <section style={styles.managementCard}>
              <div style={styles.managementHeader}>
                <div style={styles.sectionIntroCompact}>
                  <span style={styles.iconSmall}>👥</span>
                  <h2 style={styles.cardTitle}>User management</h2>
                </div>

                <button
                  type="button"
                  onClick={() => document.getElementById("add-user")?.scrollIntoView({ behavior: "smooth" })}
                  style={styles.secondaryButton}
                >
                  👤＋ Add user
                </button>
              </div>

              <div style={styles.searchGrid}>
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search name, email, location or role..."
                  style={styles.searchInput}
                />

                <select
                  value={roleFilter}
                  onChange={(event) => setRoleFilter(event.target.value)}
                  style={styles.searchInput}
                >
                  <option value="all">All roles</option>
                  {roleOptions.map((role) => (
                    <option key={role} value={role}>{role}</option>
                  ))}
                </select>
              </div>

              {loading ? (
                <p style={styles.muted}>Loading users...</p>
              ) : filteredUsers.length ? (
                <div style={styles.userList}>
                  {filteredUsers.map((user) => {
                    const editable = canEditUser(user);

                    return (
                      <article key={user.id} style={user.blocked ? styles.userRowBlocked : styles.userRow}>
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
                            <small>{user.location || "Location not set"} · {formatJoined(user.created_at)}</small>
                          </span>
                        </button>

                        <div style={styles.userControls}>
                          <span style={user.blocked ? styles.blockedPill : styles.statusPill}>
                            {user.blocked ? "Blocked" : "Active"}
                          </span>

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

                          {editable ? (
                            <button
                              type="button"
                              onClick={() => toggleBlocked(user)}
                              disabled={busyId === user.id}
                              style={user.blocked ? styles.unblockButton : styles.blockButton}
                            >
                              {user.blocked ? "Unblock" : "Block"}
                            </button>
                          ) : null}
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <p style={styles.muted}>No users found.</p>
              )}
            </section>

            <section style={styles.infoCard}>
              <span style={styles.infoIconLarge}>ⓘ</span>
              <p style={styles.muted}>
                Users with a temporary password should change it themselves after logging in. Share temporary passwords discreetly and outside public channels.
              </p>
            </section>
          </>
        ) : null}
      </section>
    </main>
  );
}

const glass =
  "linear-gradient(145deg, rgba(255,255,255,0.095), rgba(255,255,255,0.035))";

const styles = {
  page: {
    minHeight: "100vh",
    background:
      "radial-gradient(circle at top right, rgba(228,239,22,0.12), transparent 34%), linear-gradient(180deg, #07100b 0%, #050505 60%, #020202 100%)",
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
  hero: {
    display: "grid",
    gap: 10,
  },
  kicker: {
    color: "#e4ef16",
    fontSize: 13,
    fontWeight: 950,
    letterSpacing: "0.16em",
    textTransform: "uppercase",
  },
  title: {
    margin: 0,
    fontSize: "clamp(46px, 13vw, 76px)",
    lineHeight: 0.92,
    letterSpacing: "-0.075em",
  },
  dot: {
    color: "#e4ef16",
  },
  subtitle: {
    margin: 0,
    maxWidth: 620,
    color: "rgba(255,255,255,0.68)",
    lineHeight: 1.55,
    fontSize: 18,
  },
  message: {
    borderRadius: 20,
    padding: 14,
    background: "rgba(228,239,22,0.10)",
    border: "1px solid rgba(228,239,22,0.18)",
    color: "#e4ef16",
    fontWeight: 850,
  },
  passwordNotice: {
    borderRadius: 24,
    padding: 18,
    background: "rgba(228,239,22,0.10)",
    border: "1px solid rgba(228,239,22,0.22)",
    display: "grid",
    gap: 8,
  },
  passwordText: {
    color: "#e4ef16",
    fontWeight: 950,
    letterSpacing: "0.02em",
    wordBreak: "break-all",
  },
  mutedSmall: {
    margin: 0,
    color: "rgba(255,255,255,0.58)",
    lineHeight: 1.45,
    fontSize: 13,
  },
  card: {
    borderRadius: 28,
    padding: 18,
    background: glass,
    border: "1px solid rgba(255,255,255,0.13)",
    display: "grid",
    gap: 10,
  },
  systemCard: {
    borderRadius: 28,
    padding: 18,
    background: glass,
    border: "1px solid rgba(255,255,255,0.13)",
    display: "grid",
    gridTemplateColumns: "64px minmax(0,1fr) auto",
    gap: 18,
    alignItems: "center",
  },
  inviteCard: {
    borderRadius: 30,
    padding: "22px 22px 24px",
    background: glass,
    border: "1px solid rgba(255,255,255,0.13)",
    display: "grid",
    gap: 18,
  },
  sectionIntro: {
    display: "grid",
    gridTemplateColumns: "46px minmax(0,1fr)",
    gap: 14,
    alignItems: "start",
  },
  sectionIntroCompact: {
    display: "flex",
    gap: 12,
    alignItems: "center",
  },
  iconInline: {
    color: "#e4ef16",
    fontSize: 32,
    lineHeight: 1,
  },
  iconSmall: {
    color: "#e4ef16",
    fontSize: 26,
    lineHeight: 1,
  },
  iconBubbleLime: {
    width: 64,
    height: 64,
    borderRadius: 22,
    display: "grid",
    placeItems: "center",
    color: "#e4ef16",
    background: "rgba(228,239,22,0.13)",
    border: "1px solid rgba(228,239,22,0.22)",
    fontSize: 32,
  },
  cardCopy: {
    display: "grid",
    gap: 4,
  },
  cardTitle: {
    margin: 0,
    fontSize: "clamp(25px, 6.5vw, 34px)",
    lineHeight: 1,
    letterSpacing: "-0.055em",
  },
  muted: {
    margin: 0,
    color: "rgba(255,255,255,0.68)",
    lineHeight: 1.48,
  },
  modeSwitch: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 8,
    padding: 4,
    borderRadius: 999,
    background: "rgba(0,0,0,0.22)",
    border: "1px solid rgba(255,255,255,0.10)",
  },
  modeButton: {
    minHeight: 42,
    borderRadius: 999,
    border: 0,
    background: "transparent",
    color: "rgba(255,255,255,0.68)",
    fontWeight: 950,
    cursor: "pointer",
  },
  modeActive: {
    minHeight: 42,
    borderRadius: 999,
    border: 0,
    background: "#e4ef16",
    color: "#101406",
    fontWeight: 950,
    cursor: "pointer",
  },
  inviteForm: {
    display: "grid",
    gap: 14,
  },
  twoColumns: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
    gap: 14,
  },
  roleGrid: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) minmax(220px, 0.9fr)",
    gap: 14,
    alignItems: "end",
  },
  label: {
    display: "grid",
    gap: 8,
    color: "rgba(255,255,255,0.86)",
    fontSize: 14,
    fontWeight: 850,
    minWidth: 0,
  },
  input: {
    width: "100%",
    minWidth: 0,
    minHeight: 54,
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(0,0,0,0.23)",
    color: "white",
    padding: "0 14px",
    boxSizing: "border-box",
    fontSize: 16,
    outline: "none",
  },
  passwordRow: {
    display: "grid",
    gridTemplateColumns: "minmax(0,1fr) auto",
    gap: 8,
  },
  smallButton: {
    minHeight: 54,
    borderRadius: 16,
    border: "1px solid rgba(228,239,22,0.24)",
    background: "rgba(228,239,22,0.10)",
    color: "#e4ef16",
    padding: "0 12px",
    fontWeight: 950,
    cursor: "pointer",
  },
  roleInfo: {
    minHeight: 54,
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(0,0,0,0.18)",
    color: "rgba(255,255,255,0.70)",
    padding: "12px 14px",
    boxSizing: "border-box",
    display: "flex",
    alignItems: "center",
    gap: 10,
    lineHeight: 1.35,
  },
  primaryButton: {
    minHeight: 52,
    borderRadius: 999,
    border: 0,
    background: "#e4ef16",
    color: "#101406",
    padding: "0 20px",
    fontWeight: 950,
    cursor: "pointer",
    boxShadow: "0 18px 46px rgba(228,239,22,0.16)",
    whiteSpace: "nowrap",
  },
  primaryButtonWide: {
    width: "fit-content",
    minHeight: 52,
    borderRadius: 999,
    border: 0,
    background: "#e4ef16",
    color: "#101406",
    padding: "0 22px",
    fontWeight: 950,
    cursor: "pointer",
    boxShadow: "0 18px 46px rgba(228,239,22,0.16)",
  },
  secondaryButton: {
    minHeight: 44,
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.13)",
    background: "rgba(255,255,255,0.06)",
    color: "white",
    padding: "0 14px",
    fontWeight: 900,
    cursor: "pointer",
  },
  statsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: 12,
  },
  statCard: {
    minHeight: 150,
    borderRadius: 24,
    padding: 18,
    background: glass,
    border: "1px solid rgba(255,255,255,0.13)",
    display: "grid",
    alignContent: "space-between",
    gap: 8,
    minWidth: 0,
  },
  statIconLime: {
    color: "#e4ef16",
    fontSize: 30,
  },
  statIconBlue: {
    color: "#3ea2ff",
    fontSize: 30,
  },
  statIconPurple: {
    color: "#a764ff",
    fontSize: 30,
  },
  statIconOrange: {
    color: "#ff9d1c",
    fontSize: 30,
  },
  statValue: {
    fontSize: 46,
    lineHeight: 0.9,
    letterSpacing: "-0.07em",
  },
  statTitle: {
    fontWeight: 950,
  },
  statHint: {
    color: "rgba(255,255,255,0.62)",
    fontSize: 13,
  },
  managementCard: {
    borderRadius: 30,
    padding: 18,
    background: glass,
    border: "1px solid rgba(255,255,255,0.13)",
    display: "grid",
    gap: 16,
    overflow: "hidden",
  },
  managementHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "center",
    flexWrap: "wrap",
  },
  searchGrid: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1.4fr) minmax(150px, 0.7fr)",
    gap: 12,
  },
  searchInput: {
    width: "100%",
    minWidth: 0,
    minHeight: 48,
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,0.13)",
    background: "rgba(0,0,0,0.24)",
    color: "white",
    padding: "0 14px",
    boxSizing: "border-box",
    outline: "none",
    fontSize: 15,
  },
  userList: {
    display: "grid",
    gap: 10,
  },
  userRow: {
    borderRadius: 22,
    padding: 12,
    background: "rgba(255,255,255,0.045)",
    border: "1px solid rgba(255,255,255,0.075)",
    display: "grid",
    gridTemplateColumns: "minmax(0,1fr)",
    gap: 12,
    alignItems: "center",
  },
  userRowBlocked: {
    borderRadius: 22,
    padding: 12,
    background: "rgba(255,70,70,0.10)",
    border: "1px solid rgba(255,90,90,0.18)",
    display: "grid",
    gridTemplateColumns: "minmax(0,1fr)",
    gap: 12,
    alignItems: "center",
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
    minWidth: 0,
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
    gap: 3,
    color: "rgba(255,255,255,0.66)",
    overflowWrap: "anywhere",
    wordBreak: "break-word",
  },
  userControls: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(112px, 1fr))",
    gap: 8,
    alignItems: "center",
  },
  statusPill: {
    minHeight: 38,
    borderRadius: 999,
    display: "grid",
    placeItems: "center",
    padding: "0 10px",
    color: "#7dff9b",
    background: "rgba(0,255,90,0.10)",
    border: "1px solid rgba(0,255,90,0.15)",
    fontWeight: 900,
    fontSize: 12,
  },
  blockedPill: {
    minHeight: 38,
    borderRadius: 999,
    display: "grid",
    placeItems: "center",
    padding: "0 10px",
    color: "#ffb4b4",
    background: "rgba(255,70,70,0.10)",
    border: "1px solid rgba(255,90,90,0.18)",
    fontWeight: 900,
    fontSize: 12,
  },
  roleSelect: {
    minHeight: 38,
    width: "100%",
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.13)",
    background: "rgba(0,0,0,0.28)",
    color: "white",
    padding: "0 10px",
    fontWeight: 900,
  },
  blockButton: {
    minHeight: 38,
    borderRadius: 999,
    border: "1px solid rgba(255,90,90,0.22)",
    background: "rgba(255,70,70,0.10)",
    color: "#ffb4b4",
    padding: "0 12px",
    fontWeight: 950,
    cursor: "pointer",
  },
  unblockButton: {
    minHeight: 38,
    borderRadius: 999,
    border: "1px solid rgba(228,239,22,0.24)",
    background: "rgba(228,239,22,0.12)",
    color: "#e4ef16",
    padding: "0 12px",
    fontWeight: 950,
    cursor: "pointer",
  },
  infoCard: {
    borderRadius: 24,
    padding: 18,
    background: glass,
    border: "1px solid rgba(255,255,255,0.13)",
    display: "grid",
    gridTemplateColumns: "34px minmax(0,1fr)",
    gap: 12,
    alignItems: "center",
  },
  infoIconLarge: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 30,
  },
  "@media (max-width: 760px)": {},
};

