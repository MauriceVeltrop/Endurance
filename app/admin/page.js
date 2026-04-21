"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

export default function AdminPage() {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [myProfile, setMyProfile] = useState(null);
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const init = async () => {
      const {
        data: { session: currentSession },
      } = await supabase.auth.getSession();

      setSession(currentSession);
      setUser(currentSession?.user ?? null);
      setLoading(false);
    };

    init();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    loadMyProfile();
  }, [user?.id]);

  useEffect(() => {
    if (myProfile?.role === "moderator") {
      loadProfiles();
    }
  }, [myProfile?.role]);

  const loadMyProfile = async () => {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (error) {
      console.error("load my profile error", error);
      return;
    }

    setMyProfile(data);
  };

  const loadProfiles = async () => {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("load profiles error", error);
      return;
    }

    setProfiles(data || []);
  };

  const updateField = (profileId, field, value) => {
    setProfiles((prev) =>
      prev.map((p) => (p.id === profileId ? { ...p, [field]: value } : p))
    );
  };

  const saveProfile = async (profile) => {
    setSavingId(profile.id);

    const { error } = await supabase
      .from("profiles")
      .update({
        name: profile.name,
        email: profile.email,
        role: profile.role,
      })
      .eq("id", profile.id);

    setSavingId(null);

    if (error) {
      alert(`Saving failed: ${error.message}`);
      return;
    }

    alert("Profile saved");
    await loadProfiles();
    if (profile.id === user?.id) {
      await loadMyProfile();
    }
  };

  const deleteProfile = async (profile) => {
    if (!confirm(`Delete profile for ${profile.name || profile.email}?`)) return;

    setDeletingId(profile.id);

    const { error } = await supabase
      .from("profiles")
      .delete()
      .eq("id", profile.id);

    setDeletingId(null);

    if (error) {
      alert(`Deleting failed: ${error.message}`);
      return;
    }

    alert("Profile deleted");
    await loadProfiles();
  };



const formatDateTime = (value) => {
    if (!value) return "";
    const d = new Date(value);
    return d.toLocaleString("en-GB", {
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  const filteredProfiles = profiles.filter((profile) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;

    return (
      (profile.name || "").toLowerCase().includes(q) ||
      (profile.email || "").toLowerCase().includes(q) ||
      (profile.role || "").toLowerCase().includes(q)
    );
  });

  if (loading) {
    return (
      <main style={app}>
        <div style={panel}>Loading...</div>
      </main>
    );
  }

  if (!session) {
    return (
      <main style={app}>
        <div style={panel}>
          <div style={title}>Admin</div>
          <div style={muted}>You need to sign in first.</div>
          <div style={{ marginTop: 16 }}>
            <Link href="/" style={linkBtn}>
              Back to app
            </Link>
          </div>
        </div>
      </main>
    );
  }

  if (myProfile?.role !== "moderator") {
    return (
      <main style={app}>
        <div style={panel}>
          <div style={title}>Admin</div>
          <div style={muted}>Access denied. Moderator role required.</div>
          <div style={{ marginTop: 16 }}>
            <Link href="/" style={linkBtn}>
              Back to app
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main style={app}>
      <div style={topBar}>
        <Link href="/" style={linkBtn}>
          Back to app
        </Link>

        <Link href={`/profile/${user.id}`} style={linkBtn}>
          My Profile
        </Link>
      </div>

      <section style={panel}>
        <div style={headerRow}>
          <div>
            <h1 style={title}>Admin Panel</h1>
            <div style={muted}>
              Manage users, names, email addresses, and roles.
            </div>
          </div>

          <div style={counterBadge}>
            {filteredProfiles.length}
          </div>
        </div>

        <div style={searchWrap}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, or role"
            style={field}
          />
        </div>

        {!filteredProfiles.length ? (
          <div style={emptyCard}>No profiles found.</div>
        ) : (
          <div style={list}>
            {filteredProfiles.map((profile) => (
              <div key={profile.id} style={profileCard}>
                <div style={profileTop}>
                  <div style={avatarWrap}>
                    {profile.avatar_url ? (
                      <img
                        src={profile.avatar_url}
                        alt={profile.name || "User"}
                        style={avatar}
                      />
                    ) : (
                      <div style={avatarPlaceholder}>
                        {(profile.name || "?").charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>

                  <div style={{ flex: 1 }}>
                    <div style={profileName}>
                      {profile.name || "Unnamed user"}
                    </div>
                    <div style={profileSub}>
                      ID: {profile.id}
                    </div>
                  </div>
                </div>




<div style={formGrid}>
                  <div>
                    <div style={label}>Name</div>
                    <input
                      value={profile.name || ""}
                      onChange={(e) =>
                        updateField(profile.id, "name", e.target.value)
                      }
                      style={field}
                    />
                  </div>

                  <div>
                    <div style={label}>Email</div>
                    <input
                      value={profile.email || ""}
                      onChange={(e) =>
                        updateField(profile.id, "email", e.target.value)
                      }
                      style={field}
                    />
                  </div>

                  <div>
                    <div style={label}>Role</div>
                    <select
                      value={profile.role || "user"}
                      onChange={(e) =>
                        updateField(profile.id, "role", e.target.value)
                      }
                      style={field}
                    >
                      <option value="user">user</option>
                      <option value="organizer">organizer</option>
                      <option value="moderator">moderator</option>
                    </select>
                  </div>

                  <div>
                    <div style={label}>Created</div>
                    <input
                      value={formatDateTime(profile.created_at)}
                      readOnly
                      style={readOnlyField}
                    />
                  </div>

                  <div>
                    <div style={label}>Profile Link</div>
                    <div style={inlineRow}>
                      <Link href={`/profile/${profile.id}`} style={smallLinkBtn}>
                        Open Profile
                      </Link>
                    </div>
                  </div>

                  <div>
                    <div style={label}>Current Status</div>
                    <div style={roleBadge(profile.role)}>
                      {profile.role || "user"}
                    </div>
                  </div>
                </div>

                <div style={actionRow}>
                  <button
                    type="button"
                    onClick={() => saveProfile(profile)}
                    style={saveBtn}
                    disabled={savingId === profile.id}
                  >
                    {savingId === profile.id ? "Saving..." : "Save"}
                  </button>

                  <button
                    type="button"
                    onClick={() => deleteProfile(profile)}
                    style={deleteBtn}
                    disabled={deletingId === profile.id}
                  >
                    {deletingId === profile.id ? "Deleting..." : "Delete Profile"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
                        }




const app = {
  minHeight: "100vh",
  background: "#050505",
  color: "white",
  padding: 16,
  fontFamily: "sans-serif",
};

const topBar = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  marginBottom: 16,
};

const panel = {
  background: "#111",
  border: "1px solid rgba(255,255,255,0.06)",
  borderRadius: 24,
  padding: 20,
};

const headerRow = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
  flexWrap: "wrap",
  marginBottom: 18,
};

const title = {
  margin: 0,
  fontSize: 28,
};

const muted = {
  opacity: 0.72,
  marginTop: 8,
  fontSize: 14,
};

const counterBadge = {
  minWidth: 40,
  height: 40,
  padding: "0 12px",
  borderRadius: 999,
  background: "#e4ef16",
  color: "black",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontWeight: "bold",
  fontSize: 14,
};

const searchWrap = {
  marginBottom: 18,
};

const list = {
  display: "grid",
  gap: 18,
};

const emptyCard = {
  background: "#0b0b0b",
  border: "1px solid rgba(255,255,255,0.05)",
  borderRadius: 18,
  padding: 18,
  opacity: 0.75,
};

const profileCard = {
  background: "#0b0b0b",
  border: "1px solid rgba(255,255,255,0.05)",
  borderRadius: 22,
  padding: 18,
};

const profileTop = {
  display: "flex",
  alignItems: "center",
  gap: 14,
  marginBottom: 18,
};

const avatarWrap = {
  flexShrink: 0,
};

const avatar = {
  width: 72,
  height: 72,
  borderRadius: "50%",
  objectFit: "cover",
  objectPosition: "center",
  display: "block",
  border: "3px solid rgba(228,239,22,0.25)",
};

const avatarPlaceholder = {
  width: 72,
  height: 72,
  borderRadius: "50%",
  background: "#1f1f1f",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 26,
  fontWeight: "bold",
  color: "#e4ef16",
  border: "3px solid rgba(228,239,22,0.18)",
};

const profileName = {
  fontSize: 22,
  fontWeight: 700,
};



const profileSub = {
  marginTop: 6,
  opacity: 0.6,
  fontSize: 12,
  wordBreak: "break-all",
};

const formGrid = {
  display: "grid",
  gap: 12,
};

const label = {
  marginBottom: 6,
  fontSize: 13,
  opacity: 0.75,
};

const field = {
  width: "100%",
  background: "#1b1b1b",
  color: "white",
  border: "1px solid #333",
  padding: "12px 12px",
  borderRadius: 12,
  boxSizing: "border-box",
};

const readOnlyField = {
  width: "100%",
  background: "#171717",
  color: "#bdbdbd",
  border: "1px solid #2d2d2d",
  padding: "12px 12px",
  borderRadius: 12,
  boxSizing: "border-box",
};

const inlineRow = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
};

const actionRow = {
  display: "flex",
  gap: 12,
  flexWrap: "wrap",
  marginTop: 18,
};

const linkBtn = {
  display: "inline-block",
  background: "#2a2a2a",
  color: "white",
  textDecoration: "none",
  padding: "12px 16px",
  borderRadius: 12,
};

const smallLinkBtn = {
  display: "inline-block",
  background: "#2a2a2a",
  color: "white",
  textDecoration: "none",
  padding: "10px 14px",
  borderRadius: 10,
};

const saveBtn = {
  background: "#e4ef16",
  color: "black",
  border: "none",
  padding: "12px 16px",
  borderRadius: 12,
  fontWeight: "bold",
};

const deleteBtn = {
  background: "#5a1f1f",
  color: "white",
  border: "none",
  padding: "12px 16px",
  borderRadius: 12,
  fontWeight: "bold",
};



const roleBadge = (role) => ({
  display: "inline-block",
  padding: "8px 12px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: "bold",
  background:
    role === "moderator"
      ? "rgba(228,239,22,0.12)"
      : role === "organizer"
      ? "rgba(59,130,246,0.16)"
      : "rgba(255,255,255,0.08)",
  color:
    role === "moderator"
      ? "#e4ef16"
      : role === "organizer"
      ? "#93c5fd"
      : "#e5e7eb",
});

