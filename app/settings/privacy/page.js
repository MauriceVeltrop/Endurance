"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";

const DEFAULT_VISIBILITY = {
  avatar_visibility: "all",
  location_visibility: "partners",
  email_visibility: "private",
  phone_visibility: "private",
  strava_visibility: "partners",
  garmin_visibility: "partners",
  suunto_visibility: "partners",
  age_visibility: "partners",
};

export default function PrivacySettingsPage() {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const [form, setForm] = useState(DEFAULT_VISIBILITY);

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
    loadProfileAndSettings();
  }, [user?.id]);

  const loadProfileAndSettings = async () => {
    setMessage("");

    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .select("id, name, email, role")
      .eq("id", user.id)
      .single();

    if (profileError) {
      console.error("profile load error", profileError);
      setMessage(profileError.message);
      return;
    }

    setProfile(profileData);

    const { data: settingsData, error: settingsError } = await supabase
      .from("profile_visibility_settings")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (settingsError) {
      console.error("settings load error", settingsError);
      setMessage(settingsError.message);
      return;
    }

    const nextForm = settingsData
      ? {
          avatar_visibility:
            settingsData.avatar_visibility || DEFAULT_VISIBILITY.avatar_visibility,
          location_visibility:
            settingsData.location_visibility || DEFAULT_VISIBILITY.location_visibility,
          email_visibility:
            settingsData.email_visibility || DEFAULT_VISIBILITY.email_visibility,
          phone_visibility:
            settingsData.phone_visibility || DEFAULT_VISIBILITY.phone_visibility,
          strava_visibility:
            settingsData.strava_visibility || DEFAULT_VISIBILITY.strava_visibility,
          garmin_visibility:
            settingsData.garmin_visibility || DEFAULT_VISIBILITY.garmin_visibility,
          suunto_visibility:
            settingsData.suunto_visibility || DEFAULT_VISIBILITY.suunto_visibility,
          age_visibility:
            settingsData.age_visibility || DEFAULT_VISIBILITY.age_visibility,
        }
      : DEFAULT_VISIBILITY;

    setForm(nextForm);
  };




const saveSettings = async (e) => {
    e.preventDefault();

    if (!user?.id) {
      setMessage("You must be signed in.");
      return;
    }

    setSaving(true);
    setMessage("");

    const payload = {
      user_id: user.id,
      avatar_visibility: form.avatar_visibility,
      location_visibility: form.location_visibility,
      email_visibility: form.email_visibility,
      phone_visibility: form.phone_visibility,
      strava_visibility: form.strava_visibility,
      garmin_visibility: form.garmin_visibility,
      suunto_visibility: form.suunto_visibility,
      age_visibility: form.age_visibility,
    };

    const { error } = await supabase
      .from("profile_visibility_settings")
      .upsert(payload, { onConflict: "user_id" });

    setSaving(false);

    if (error) {
      console.error("settings save error", error);
      setMessage(`Saving failed: ${error.message}`);
      return;
    }

    setMessage("Privacy settings saved.");
    await loadProfileAndSettings();
  };

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
          <h1 style={title}>Privacy Settings</h1>
          <div style={muted}>You need to sign in first.</div>

          <div style={topActions}>
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
      <div style={topActions}>
        <Link href="/" style={linkBtn}>
          Back to app
        </Link>

        <Link href={`/profile/${user.id}`} style={linkBtn}>
          Back to profile
        </Link>
      </div>

      <section style={panel}>
        <div style={headerRow}>
          <div>
            <h1 style={title}>Privacy Settings</h1>
            <div style={muted}>
              Choose who can see each part of your profile.
            </div>
          </div>

          <div style={roleBadge}>
            {profile?.role || "user"}
          </div>
        </div>

        <div style={accountBox}>
          <div style={accountTitle}>Account</div>
          <div style={accountText}>
            {profile?.name || profile?.email || "Signed-in user"}
          </div>
        </div>

        {message ? (
          <div style={messageBox}>
            {message}
          </div>
        ) : null}

        <form onSubmit={saveSettings} style={formWrap}>



<div style={settingsGrid}>
            <div style={settingCard}>
              <div style={settingTitle}>Profile Photo</div>
              <div style={settingSub}>
                Your avatar on profile pages and community features.
              </div>
              <select
                value={form.avatar_visibility}
                onChange={(e) =>
                  setForm({ ...form, avatar_visibility: e.target.value })
                }
                style={field}
              >
                <option value="private">Only Me</option>
                <option value="partners">Training Partners</option>
                <option value="all">All Users</option>
              </select>
            </div>

            <div style={settingCard}>
              <div style={settingTitle}>Age</div>
              <div style={settingSub}>
                Your age is shown, never your full birth date.
              </div>
              <select
                value={form.age_visibility}
                onChange={(e) =>
                  setForm({ ...form, age_visibility: e.target.value })
                }
                style={field}
              >
                <option value="private">Only Me</option>
                <option value="partners">Training Partners</option>
                <option value="all">All Users</option>
              </select>
            </div>

            <div style={settingCard}>
              <div style={settingTitle}>Location</div>
              <div style={settingSub}>
                Your city or area shown on your profile.
              </div>
              <select
                value={form.location_visibility}
                onChange={(e) =>
                  setForm({ ...form, location_visibility: e.target.value })
                }
                style={field}
              >
                <option value="private">Only Me</option>
                <option value="partners">Training Partners</option>
                <option value="all">All Users</option>
              </select>
            </div>

            <div style={settingCard}>
              <div style={settingTitle}>Email Address</div>
              <div style={settingSub}>
                Your email on your profile page.
              </div>
              <select
                value={form.email_visibility}
                onChange={(e) =>
                  setForm({ ...form, email_visibility: e.target.value })
                }
                style={field}
              >
                <option value="private">Only Me</option>
                <option value="partners">Training Partners</option>
                <option value="all">All Users</option>
              </select>
            </div>





<div style={settingCard}>
              <div style={settingTitle}>Phone Number</div>
              <div style={settingSub}>
                Your phone number on your profile page.
              </div>
              <select
                value={form.phone_visibility}
                onChange={(e) =>
                  setForm({ ...form, phone_visibility: e.target.value })
                }
                style={field}
              >
                <option value="private">Only Me</option>
                <option value="partners">Training Partners</option>
                <option value="all">All Users</option>
              </select>
            </div>

            <div style={settingCard}>
              <div style={settingTitle}>Strava</div>
              <div style={settingSub}>
                Visibility of your Strava profile link.
              </div>
              <select
                value={form.strava_visibility}
                onChange={(e) =>
                  setForm({ ...form, strava_visibility: e.target.value })
                }
                style={field}
              >
                <option value="private">Only Me</option>
                <option value="partners">Training Partners</option>
                <option value="all">All Users</option>
              </select>
            </div>

            <div style={settingCard}>
              <div style={settingTitle}>Garmin</div>
              <div style={settingSub}>
                Visibility of your Garmin profile link.
              </div>
              <select
                value={form.garmin_visibility}
                onChange={(e) =>
                  setForm({ ...form, garmin_visibility: e.target.value })
                }
                style={field}
              >
                <option value="private">Only Me</option>
                <option value="partners">Training Partners</option>
                <option value="all">All Users</option>
              </select>
            </div>

            <div style={settingCard}>
              <div style={settingTitle}>Suunto</div>
              <div style={settingSub}>
                Visibility of your Suunto profile link.
              </div>
              <select
                value={form.suunto_visibility}
                onChange={(e) =>
                  setForm({ ...form, suunto_visibility: e.target.value })
                }
                style={field}
              >
                <option value="private">Only Me</option>
                <option value="partners">Training Partners</option>
                <option value="all">All Users</option>
              </select>
            </div>
          </div>

          <div style={actionRow}>
            <button type="submit" style={saveBtn} disabled={saving}>
              {saving ? "Saving..." : "Save Privacy Settings"}
            </button>
          </div>
        </form>
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

const topActions = {
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

const roleBadge = {
  display: "inline-block",
  padding: "8px 12px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: "bold",
  background: "rgba(228,239,22,0.12)",
  color: "#e4ef16",
};

const accountBox = {
  background: "#0b0b0b",
  border: "1px solid rgba(255,255,255,0.05)",
  borderRadius: 18,
  padding: 16,
  marginBottom: 18,
};

const accountTitle = {
  fontSize: 14,
  opacity: 0.7,
  marginBottom: 6,
};

const accountText = {
  fontSize: 18,
  fontWeight: 700,
};

const messageBox = {
  background: "#151515",
  border: "1px solid rgba(255,255,255,0.05)",
  color: "#e8e8e8",
  padding: 14,
  borderRadius: 14,
  marginBottom: 18,
};

const formWrap = {
  display: "grid",
  gap: 18,
};

const settingsGrid = {
  display: "grid",
  gap: 14,
};



const settingCard = {
  background: "#0b0b0b",
  border: "1px solid rgba(255,255,255,0.05)",
  borderRadius: 18,
  padding: 16,
};

const settingTitle = {
  fontSize: 16,
  fontWeight: 700,
  marginBottom: 6,
};

const settingSub = {
  fontSize: 13,
  opacity: 0.68,
  marginBottom: 12,
  lineHeight: 1.45,
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

const actionRow = {
  display: "flex",
  gap: 12,
  flexWrap: "wrap",
};

const saveBtn = {
  background: "#e4ef16",
  color: "black",
  border: "none",
  padding: "12px 16px",
  borderRadius: 12,
  fontWeight: "bold",
};

const linkBtn = {
  display: "inline-block",
  background: "#2a2a2a",
  color: "white",
  textDecoration: "none",
  padding: "12px 16px",
  borderRadius: 12,
};





          
