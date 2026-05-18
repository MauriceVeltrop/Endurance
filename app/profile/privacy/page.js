"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "../../../components/AppHeader";
import { supabase } from "../../../lib/supabase";

const visibilityOptions = [
  { value: "private", label: "Private", short: "Private", description: "Only you" },
  { value: "team", label: "Team", short: "Team", description: "Training partners" },
  { value: "public", label: "Public", short: "Public", description: "Community" },
];

const trainingVisibilityOptions = [
  { value: "private", label: "Private", short: "Private", description: "Only you" },
  { value: "team", label: "Team", short: "Team", description: "Training partners" },
  { value: "selected", label: "Selected", short: "Selected", description: "Specific members" },
  { value: "group", label: "Group", short: "Group", description: "Group/community" },
  { value: "public", label: "Public", short: "Public", description: "Everyone" },
];

const defaultSettings = {
  profile_visibility: "team",
  avatar_visibility: "public",
  location_visibility: "team",
  age_visibility: "team",
  email_visibility: "private",
  availability_visibility: "team",
  default_training_visibility: "team",
  allow_team_requests: true,
  allow_training_invites: true,
};

function SettingSelect({ label, description, value, onChange, options = visibilityOptions }) {
  return (
    <label style={styles.settingRow}>
      <span style={styles.settingText}>
        <strong style={styles.settingTitle}>{label}</strong>
        <small style={styles.settingDescription}>{description}</small>
      </span>

      <select value={value} onChange={(event) => onChange(event.target.value)} style={styles.select}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.short} · {option.description}
          </option>
        ))}
      </select>
    </label>
  );
}

function ToggleRow({ label, description, checked, onChange }) {
  return (
    <label style={styles.toggleRow}>
      <span style={styles.settingText}>
        <strong style={styles.settingTitle}>{label}</strong>
        <small style={styles.settingDescription}>{description}</small>
      </span>

      <span style={checked ? styles.switchOn : styles.switchOff}>
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          style={styles.hiddenCheckbox}
        />
        <span style={checked ? styles.switchKnobOn : styles.switchKnobOff} />
      </span>
    </label>
  );
}

export default function PrivacySettingsPage() {
  const router = useRouter();

  const [profile, setProfile] = useState(null);
  const [settings, setSettings] = useState(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    loadPrivacySettings();
  }, []);

  function update(key, value) {
    setSettings((current) => ({ ...current, [key]: value }));
  }

  async function loadPrivacySettings() {
    setLoading(true);
    setMessage("");

    try {
      const { data: authData } = await supabase.auth.getUser();
      const user = authData?.user;

      if (!user?.id) {
        router.replace("/login");
        return;
      }

      const { data: profileRow, error: profileError } = await supabase
        .from("profiles")
        .select("id,name,email,avatar_url,role,onboarding_completed,blocked")
        .eq("id", user.id)
        .maybeSingle();

      if (profileError) throw profileError;

      if (!profileRow?.onboarding_completed) {
        router.replace("/onboarding");
        return;
      }

      setProfile(profileRow);

      const { data, error } = await supabase.rpc("ensure_profile_privacy_settings", {
        p_user_id: user.id,
      });

      if (error) {
        console.warn("Privacy RPC failed, using direct select fallback", error);
        const { data: fallbackSettings } = await supabase
          .from("profile_privacy_settings")
          .select("*")
          .eq("user_id", user.id)
          .maybeSingle();

        setSettings({ ...defaultSettings, ...(fallbackSettings || {}) });
      } else {
        setSettings({ ...defaultSettings, ...(data || {}) });
      }
    } catch (error) {
      console.error("Privacy settings load error", error);
      setMessage(error?.message || "Could not load privacy settings.");
    } finally {
      setLoading(false);
    }
  }

  async function savePrivacySettings(event) {
    event.preventDefault();

    if (!profile?.id || saving) return;

    setSaving(true);
    setMessage("");

    try {
      const payload = {
        user_id: profile.id,
        profile_visibility: settings.profile_visibility,
        avatar_visibility: settings.avatar_visibility,
        location_visibility: settings.location_visibility,
        age_visibility: settings.age_visibility,
        email_visibility: settings.email_visibility,
        availability_visibility: settings.availability_visibility,
        default_training_visibility: settings.default_training_visibility,
        allow_team_requests: Boolean(settings.allow_team_requests),
        allow_training_invites: Boolean(settings.allow_training_invites),
      };

      const { error } = await supabase
        .from("profile_privacy_settings")
        .upsert(payload, { onConflict: "user_id" });

      if (error) throw error;

      setMessage("Privacy settings saved.");
    } catch (error) {
      console.error("Privacy settings save error", error);
      setMessage(error?.message || "Could not save privacy settings.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main style={styles.page}>
      <section style={styles.shell}>
        <AppHeader profile={profile} compact />

        <button type="button" onClick={() => router.back()} style={styles.backButton}>
          ← Back
        </button>

        <section style={styles.hero}>
          <p style={styles.kicker}>Privacy</p>
          <h1 style={styles.title}>Control your visibility.</h1>
          <p style={styles.subtitle}>
            Decide what your team, the community and future training partners can see.
          </p>
        </section>

        {message ? <div style={styles.message}>{message}</div> : null}

        {loading ? (
          <section style={styles.card}>Loading privacy settings...</section>
        ) : (
          <form onSubmit={savePrivacySettings} style={styles.card}>
            <section style={styles.group}>
              <p style={styles.groupKicker}>Profile</p>

              <SettingSelect
                label="Profile"
                description="Who may view your general profile."
                value={settings.profile_visibility}
                onChange={(value) => update("profile_visibility", value)}
              />

              <SettingSelect
                label="Avatar"
                description="Who may see your profile photo."
                value={settings.avatar_visibility}
                onChange={(value) => update("avatar_visibility", value)}
              />

              <SettingSelect
                label="Location"
                description="Who may see your city or region."
                value={settings.location_visibility}
                onChange={(value) => update("location_visibility", value)}
              />

              <SettingSelect
                label="Age"
                description="Who may see your age."
                value={settings.age_visibility}
                onChange={(value) => update("age_visibility", value)}
              />

              <SettingSelect
                label="Email"
                description="Keep this private unless you choose otherwise."
                value={settings.email_visibility}
                onChange={(value) => update("email_visibility", value)}
              />
            </section>

            <section style={styles.group}>
              <p style={styles.groupKicker}>Training</p>

              <SettingSelect
                label="Availability"
                description="Who may see your general availability."
                value={settings.availability_visibility}
                onChange={(value) => update("availability_visibility", value)}
              />

              <SettingSelect
                label="Default visibility"
                description="Used as a future default when creating a training."
                value={settings.default_training_visibility}
                onChange={(value) => update("default_training_visibility", value)}
                options={trainingVisibilityOptions}
              />

              <ToggleRow
                label="Team Up requests"
                description="Allow other athletes to send Team Up requests."
                checked={settings.allow_team_requests}
                onChange={(value) => update("allow_team_requests", value)}
              />

              <ToggleRow
                label="Training invites"
                description="Allow team partners to invite you to trainings."
                checked={settings.allow_training_invites}
                onChange={(value) => update("allow_training_invites", value)}
              />
            </section>

            <button type="submit" disabled={saving} style={styles.saveButton}>
              {saving ? "Saving..." : "Save privacy settings"}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background: "radial-gradient(circle at top, rgba(215,255,63,0.12), transparent 34%), #050505",
    color: "#fff",
    overflowX: "hidden",
    padding: 16,
    boxSizing: "border-box",
  },
  shell: {
    width: "100%",
    maxWidth: 860,
    margin: "0 auto",
    display: "grid",
    gap: 14,
  },
  backButton: {
    justifySelf: "start",
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.06)",
    color: "#fff",
    borderRadius: 999,
    padding: "10px 14px",
    fontWeight: 900,
  },
  hero: {
    border: "1px solid rgba(255,255,255,0.10)",
    background: "linear-gradient(135deg, rgba(255,255,255,0.10), rgba(215,255,63,0.08))",
    borderRadius: 32,
    padding: 22,
  },
  kicker: {
    margin: 0,
    color: "#d7ff3f",
    textTransform: "uppercase",
    letterSpacing: "0.22em",
    fontSize: 11,
    fontWeight: 950,
  },
  title: {
    margin: "8px 0 0",
    fontSize: "clamp(38px, 12vw, 58px)",
    lineHeight: 0.95,
    fontWeight: 950,
    letterSpacing: "-0.07em",
  },
  subtitle: {
    margin: "12px 0 0",
    color: "rgba(255,255,255,0.62)",
    lineHeight: 1.45,
    fontWeight: 650,
    fontSize: 17,
  },
  message: {
    border: "1px solid rgba(215,255,63,0.28)",
    background: "rgba(215,255,63,0.10)",
    color: "#eaff8f",
    borderRadius: 22,
    padding: 14,
    fontWeight: 850,
  },
  card: {
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.055)",
    borderRadius: 30,
    padding: 18,
    display: "grid",
    gap: 18,
  },
  group: {
    display: "grid",
    gap: 10,
  },
  groupKicker: {
    margin: 0,
    color: "#d7ff3f",
    textTransform: "uppercase",
    letterSpacing: "0.20em",
    fontSize: 11,
    fontWeight: 950,
  },
  settingRow: {
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: 12,
    alignItems: "stretch",
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(0,0,0,0.22)",
    borderRadius: 22,
    padding: 16,
  },
  toggleRow: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) auto",
    gap: 14,
    alignItems: "center",
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(0,0,0,0.22)",
    borderRadius: 22,
    padding: 16,
  },
  settingText: {
    minWidth: 0,
    display: "grid",
    gap: 4,
  },
  settingTitle: {
    display: "block",
    color: "#fff",
    fontWeight: 950,
    fontSize: 22,
    letterSpacing: "-0.04em",
    lineHeight: 1.05,
  },
  settingDescription: {
    display: "block",
    color: "rgba(255,255,255,0.50)",
    fontWeight: 700,
    lineHeight: 1.35,
    fontSize: 14,
  },
  select: {
    width: "100%",
    maxWidth: "100%",
    minHeight: 54,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "#111",
    color: "#fff",
    borderRadius: 17,
    padding: "0 14px",
    fontWeight: 900,
    fontSize: 16,
    outline: "none",
  },
  hiddenCheckbox: {
    position: "absolute",
    opacity: 0,
    pointerEvents: "none",
  },
  switchOff: {
    position: "relative",
    width: 58,
    height: 34,
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.15)",
    background: "rgba(255,255,255,0.10)",
    display: "inline-flex",
    alignItems: "center",
    padding: 3,
    boxSizing: "border-box",
  },
  switchOn: {
    position: "relative",
    width: 58,
    height: 34,
    borderRadius: 999,
    border: "1px solid rgba(215,255,63,0.45)",
    background: "rgba(215,255,63,0.82)",
    display: "inline-flex",
    alignItems: "center",
    padding: 3,
    boxSizing: "border-box",
    boxShadow: "0 0 24px rgba(215,255,63,0.18)",
  },
  switchKnobOff: {
    width: 26,
    height: 26,
    borderRadius: 999,
    background: "rgba(255,255,255,0.75)",
    transform: "translateX(0)",
    transition: "160ms ease",
  },
  switchKnobOn: {
    width: 26,
    height: 26,
    borderRadius: 999,
    background: "#050505",
    transform: "translateX(24px)",
    transition: "160ms ease",
  },
  saveButton: {
    border: 0,
    borderRadius: 999,
    background: "#d7ff3f",
    color: "#050505",
    padding: "16px 18px",
    fontSize: 17,
    fontWeight: 950,
    minHeight: 56,
  },
};
