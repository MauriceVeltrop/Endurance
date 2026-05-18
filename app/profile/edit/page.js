"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "../../../components/AppHeader";
import ImageCropperModal from "../../../components/ImageCropperModal";
import { supabase } from "../../../lib/supabase";
import { sportOptions } from "../../../lib/sportsConfig";

function displayName(profile) {
  return [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || profile?.name || profile?.email || "Endurance user";
}

export default function EditProfilePage() {
  const router = useRouter();

  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    location: "",
    birth_date: "",
    avatar_url: "",
    sports: [],
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarCropFile, setAvatarCropFile] = useState(null);
  const [message, setMessage] = useState("");

  const selectedSports = useMemo(() => new Set(form.sports), [form.sports]);

  useEffect(() => {
    loadProfile();
  }, []);

  function update(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function toggleSport(sportId) {
    setForm((current) => {
      const exists = current.sports.includes(sportId);
      const sports = exists
        ? current.sports.filter((item) => item !== sportId)
        : [...current.sports, sportId];

      return { ...current, sports };
    });
  }

  async function loadProfile() {
    setLoading(true);
    setMessage("");

    try {
      const { data: authData } = await supabase.auth.getUser();
      const currentUser = authData?.user || null;
      setUser(currentUser);

      if (!currentUser?.id) {
        router.replace("/login");
        return;
      }

      const { data: profileRow, error: profileError } = await supabase
        .from("profiles")
        .select("id,name,email,avatar_url,location,birth_date,role,onboarding_completed,blocked,first_name,last_name")
        .eq("id", currentUser.id)
        .maybeSingle();

      if (profileError) throw profileError;

      const { data: sportRows, error: sportError } = await supabase
        .from("user_sports")
        .select("sport_id")
        .eq("user_id", currentUser.id);

      if (sportError) console.warn("Sports skipped", sportError);

      const nextProfile = profileRow || { id: currentUser.id, email: currentUser.email };
      setProfile(nextProfile);
      setForm({
        first_name: nextProfile.first_name || "",
        last_name: nextProfile.last_name || "",
        email: nextProfile.email || currentUser.email || "",
        location: nextProfile.location || "",
        birth_date: nextProfile.birth_date || "",
        avatar_url: nextProfile.avatar_url || "",
        sports: (sportRows || []).map((row) => row.sport_id).filter(Boolean),
      });
    } catch (error) {
      console.error("Profile load error", error);
      setMessage(error?.message || "Could not load your profile.");
    } finally {
      setLoading(false);
    }
  }

  function chooseAvatar(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    setMessage("");

    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setMessage("Choose an image file.");
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
      setMessage("Profile photo is too large. Use an image under 8 MB.");
      return;
    }

    setAvatarCropFile(file);
  }

  async function confirmAvatarCrop({ file }) {
    if (!file || !user?.id) return;

    try {
      setUploadingAvatar(true);

      const path = `${user.id}/avatar-${Date.now()}.jpg`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, file, {
          cacheControl: "3600",
          upsert: true,
          contentType: file.type || "image/jpeg",
        });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from("avatars").getPublicUrl(path);

      if (!data?.publicUrl) throw new Error("Could not create avatar URL.");

      update("avatar_url", data.publicUrl);
      setAvatarCropFile(null);
      setMessage("Profile photo updated. Save your profile to keep the changes.");
    } catch (error) {
      console.error("Avatar upload error", error);
      setMessage(error?.message || "Could not upload profile photo.");
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function saveProfile(event) {
    event.preventDefault();

    if (!user?.id || saving) return;

    setSaving(true);
    setMessage("");

    try {
      if (!form.first_name.trim() || !form.last_name.trim()) {
        setMessage("First and last name are required.");
        return;
      }

      if (!form.email.trim()) {
        setMessage("Email is required.");
        return;
      }

      if (!form.avatar_url) {
        setMessage("Profile photo is required.");
        return;
      }

      if (!form.sports.length) {
        setMessage("Choose at least one preferred sport.");
        return;
      }

      const firstName = form.first_name.trim();
      const lastName = form.last_name.trim();
      const fullName = `${firstName} ${lastName}`.trim();

      const { error: profileError } = await supabase
        .from("profiles")
        .upsert(
          {
            id: user.id,
            first_name: firstName,
            last_name: lastName,
            name: fullName,
            email: form.email.trim(),
            location: form.location.trim() || null,
            birth_date: form.birth_date || null,
            avatar_url: form.avatar_url,
            onboarding_completed: true,
          },
          { onConflict: "id" }
        );

      if (profileError) throw profileError;

      const { error: deleteSportsError } = await supabase
        .from("user_sports")
        .delete()
        .eq("user_id", user.id);

      if (deleteSportsError) throw deleteSportsError;

      const sportRows = form.sports.map((sportId) => ({
        user_id: user.id,
        sport_id: sportId,
      }));

      const { error: sportError } = await supabase
        .from("user_sports")
        .upsert(sportRows, { onConflict: "user_id,sport_id" });

      if (sportError) throw sportError;

      setMessage("Profile saved.");
      router.replace(`/profile/${user.id}`);
    } catch (error) {
      console.error("Profile save error", error);
      setMessage(error?.message || "Could not save profile.");
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
          <p style={styles.kicker}>Profile settings</p>
          <h1 style={styles.title}>Edit your identity.</h1>
          <p style={styles.subtitle}>
            Keep your profile verified, personal and relevant for your preferred sports.
          </p>
        </section>

        {message ? <div style={styles.message}>{message}</div> : null}

        {loading ? (
          <section style={styles.card}>Loading profile...</section>
        ) : (
          <form onSubmit={saveProfile} style={styles.card}>
            <section style={styles.avatarCard}>
              <div style={styles.avatarPreview}>
                {form.avatar_url ? (
                  <img src={form.avatar_url} alt="Profile preview" style={styles.avatarImage} />
                ) : (
                  <span>{displayName(form).slice(0, 2).toUpperCase()}</span>
                )}
              </div>

              <div style={{ minWidth: 0 }}>
                <h2 style={styles.cardTitle}>Profile photo</h2>
                <p style={styles.muted}>
                  Upload, crop and zoom your avatar before saving.
                </p>
                <label style={styles.uploadButton}>
                  {uploadingAvatar ? "Uploading..." : "Change photo"}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={chooseAvatar}
                    disabled={uploadingAvatar}
                    style={{ display: "none" }}
                  />
                </label>
              </div>
            </section>

            <div style={styles.twoColumns}>
              <label style={styles.label}>
                First name
                <input value={form.first_name} onChange={(event) => update("first_name", event.target.value)} style={styles.input} />
              </label>

              <label style={styles.label}>
                Last name
                <input value={form.last_name} onChange={(event) => update("last_name", event.target.value)} style={styles.input} />
              </label>
            </div>

            <label style={styles.label}>
              Email
              <input type="email" value={form.email} onChange={(event) => update("email", event.target.value)} style={styles.input} />
            </label>

            <label style={styles.label}>
              City / region
              <input value={form.location} onChange={(event) => update("location", event.target.value)} placeholder="Landgraaf" style={styles.input} />
            </label>

            <label style={styles.label}>
              Birth date
              <input type="date" value={form.birth_date} onChange={(event) => update("birth_date", event.target.value)} style={styles.input} />
            </label>

            <section style={styles.sportsSection}>
              <h2 style={styles.cardTitle}>Preferred sports</h2>
              <p style={styles.muted}>
                These determine which trainings you see and can create.
              </p>

              <div style={styles.sportGrid}>
                {sportOptions.map((sport) => {
                  const active = selectedSports.has(sport.id);

                  return (
                    <button
                      key={sport.id}
                      type="button"
                      onClick={() => toggleSport(sport.id)}
                      style={active ? styles.sportActive : styles.sportButton}
                    >
                      <span style={styles.sportName}>{sport.label || sport.name || sport.id}</span>
                      <span style={styles.sportMeta}>{active ? "Selected" : "Tap to select"}</span>
                    </button>
                  );
                })}
              </div>
            </section>

            <button type="submit" disabled={saving} style={styles.saveButton}>
              {saving ? "Saving..." : "Save profile"}
            </button>
          </form>
        )}
      </section>

      {avatarCropFile ? (
        <ImageCropperModal
          file={avatarCropFile}
          mode="avatar"
          title="Crop profile photo"
          onCancel={() => setAvatarCropFile(null)}
          onConfirm={confirmAvatarCrop}
        />
      ) : null}
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
    fontSize: 42,
    lineHeight: 0.95,
    fontWeight: 950,
    letterSpacing: "-0.06em",
  },
  subtitle: {
    margin: "12px 0 0",
    color: "rgba(255,255,255,0.62)",
    lineHeight: 1.45,
    fontWeight: 650,
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
    gap: 16,
  },
  avatarCard: {
    display: "grid",
    gridTemplateColumns: "86px minmax(0, 1fr)",
    gap: 14,
    alignItems: "center",
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(0,0,0,0.22)",
    borderRadius: 24,
    padding: 14,
  },
  avatarPreview: {
    width: 82,
    height: 82,
    borderRadius: 999,
    overflow: "hidden",
    display: "grid",
    placeItems: "center",
    background: "rgba(215,255,63,0.12)",
    border: "2px solid rgba(215,255,63,0.65)",
    color: "#d7ff3f",
    fontWeight: 950,
  },
  avatarImage: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
  },
  cardTitle: {
    margin: 0,
    fontSize: 22,
    fontWeight: 950,
    letterSpacing: "-0.04em",
  },
  muted: {
    margin: "6px 0 0",
    color: "rgba(255,255,255,0.56)",
    fontSize: 13,
    lineHeight: 1.45,
    fontWeight: 650,
  },
  uploadButton: {
    marginTop: 10,
    display: "inline-flex",
    borderRadius: 999,
    background: "#d7ff3f",
    color: "#050505",
    padding: "10px 14px",
    fontWeight: 950,
    cursor: "pointer",
  },
  twoColumns: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 12,
  },
  label: {
    display: "grid",
    gap: 7,
    color: "rgba(255,255,255,0.70)",
    fontSize: 13,
    fontWeight: 850,
  },
  input: {
    width: "100%",
    boxSizing: "border-box",
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(0,0,0,0.25)",
    color: "#fff",
    borderRadius: 16,
    padding: "13px 14px",
    fontSize: 16,
    outline: "none",
  },
  sportsSection: {
    display: "grid",
    gap: 12,
  },
  sportGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
    gap: 10,
  },
  sportButton: {
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(0,0,0,0.22)",
    color: "#fff",
    borderRadius: 20,
    padding: 14,
    textAlign: "left",
    display: "grid",
    gap: 4,
  },
  sportActive: {
    border: "1px solid rgba(215,255,63,0.55)",
    background: "rgba(215,255,63,0.13)",
    color: "#fff",
    borderRadius: 20,
    padding: 14,
    textAlign: "left",
    display: "grid",
    gap: 4,
  },
  sportName: {
    fontWeight: 950,
  },
  sportMeta: {
    color: "rgba(255,255,255,0.50)",
    fontSize: 12,
    fontWeight: 750,
  },
  saveButton: {
    border: 0,
    borderRadius: 999,
    background: "#d7ff3f",
    color: "#050505",
    padding: "15px 18px",
    fontSize: 16,
    fontWeight: 950,
  },
};
