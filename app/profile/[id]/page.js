"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "../../../lib/supabase";
import { SPORTS, getSportLabels } from "../../../lib/sports";

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

export default function ProfilePage() {
  const params = useParams();
  const profileId = params?.id;

  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [myProfile, setMyProfile] = useState(null);
  const [profile, setProfile] = useState(null);
  const [preferredSports, setPreferredSports] = useState([]);
  const [visibility, setVisibility] = useState(DEFAULT_VISIBILITY);
  const [teamMembers, setTeamMembers] = useState([]);
  const [loadingTeam, setLoadingTeam] = useState(false);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState("");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingSports, setSavingSports] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const [form, setForm] = useState({
    name: "",
    location: "",
    email: "",
    phone: "",
    strava_url: "",
    garmin_url: "",
    suunto_url: "",
    birth_date: "",
  });

  useEffect(() => {
    const init = async () => {
      const {
        data: { session: currentSession },
      } = await supabase.auth.getSession();

      setSession(currentSession);
      setUser(currentSession?.user ?? null);
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
    if (!profileId) return;
    loadProfilePage();
  }, [profileId, user?.id]);

  const loadProfilePage = async () => {
    try {
      setLoading(true);
      setErrorText("");

      if (user?.id) {
        const { data: myData } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", user.id)
          .maybeSingle();

        setMyProfile(myData || null);
      } else {
        setMyProfile(null);
      }

      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", profileId)
        .single();

      if (profileError) {
        throw profileError;
      }

      setProfile(profileData);
      setForm({
        name: profileData.name || "",
        location: profileData.location || "",
        email: profileData.email || "",
        phone: profileData.phone || "",
        strava_url: profileData.strava_url || "",
        garmin_url: profileData.garmin_url || "",
        suunto_url: profileData.suunto_url || "",
        birth_date: profileData.birth_date || "",
      });

      const { data: visibilityData } = await supabase
        .from("profile_visibility_settings")
        .select("*")
        .eq("user_id", profileId)
        .maybeSingle();

      setVisibility(
        visibilityData
          ? {
              avatar_visibility:
                visibilityData.avatar_visibility ||
                DEFAULT_VISIBILITY.avatar_visibility,
              location_visibility:
                visibilityData.location_visibility ||
                DEFAULT_VISIBILITY.location_visibility,
              email_visibility:
                visibilityData.email_visibility ||
                DEFAULT_VISIBILITY.email_visibility,
              phone_visibility:
                visibilityData.phone_visibility ||
                DEFAULT_VISIBILITY.phone_visibility,
              strava_visibility:
                visibilityData.strava_visibility ||
                DEFAULT_VISIBILITY.strava_visibility,
              garmin_visibility:
                visibilityData.garmin_visibility ||
                DEFAULT_VISIBILITY.garmin_visibility,
              suunto_visibility:
                visibilityData.suunto_visibility ||
                DEFAULT_VISIBILITY.suunto_visibility,
              age_visibility:
                visibilityData.age_visibility ||
                DEFAULT_VISIBILITY.age_visibility,
            }
          : DEFAULT_VISIBILITY
      );

      const { data: sportsData } = await supabase
        .from("user_sports")
        .select("sport")
        .eq("user_id", profileId);

      setPreferredSports((sportsData || []).map((row) => row.sport));

      await loadTeam(profileId);
    } catch (err) {
      console.error("profile page load error", err);
      setErrorText(err?.message || "Could not load profile.");
    } finally {
      setLoading(false);
    }
  };

  const loadTeam = async (currentProfileId) => {
    try {
      setLoadingTeam(true);

      const { data: partnerRows, error: partnerError } = await supabase
        .from("training_partners")
        .select("*")
        .eq("status", "accepted")
        .or(
          `requester_id.eq.${currentProfileId},addressee_id.eq.${currentProfileId}`
        );

      if (partnerError) {
        throw partnerError;
      }

      const otherIds = (partnerRows || []).map((row) =>
        row.requester_id === currentProfileId ? row.addressee_id : row.requester_id
      );

      if (!otherIds.length) {
        setTeamMembers([]);
        return;
      }

      const uniqueIds = [...new Set(otherIds)];

      const { data: teamProfiles, error: teamError } = await supabase
        .from("profiles")
        .select("id, name, avatar_url")
        .in("id", uniqueIds);

      if (teamError) {
        throw teamError;
      }

      setTeamMembers(teamProfiles || []);
    } catch (err) {
      console.error("team load error", err);
      setTeamMembers([]);
    } finally {
      setLoadingTeam(false);
    }
  };

  const saveProfile = async (e) => {
    e.preventDefault();

    if (!profile?.id) return;

    try {
      setSaving(true);

      const { error } = await supabase
        .from("profiles")
        .update({
          name: form.name,
          location: form.location,
          email: form.email,
          phone: form.phone,
          strava_url: form.strava_url,
          garmin_url: form.garmin_url,
          suunto_url: form.suunto_url,
          birth_date: form.birth_date || null,
        })
        .eq("id", profile.id);

      if (error) {
        throw error;
      }

      setEditing(false);
      await loadProfilePage();
    } catch (err) {
      console.error("save profile error", err);
      alert(err?.message || "Saving failed.");
    } finally {
      setSaving(false);
    }
  };

  const togglePreferredSport = async (sportId) => {
    if (!isOwnProfile || savingSports) return;

    try {
      setSavingSports(true);

      const alreadySelected = preferredSports.includes(sportId);

      if (alreadySelected) {
        const { error } = await supabase
          .from("user_sports")
          .delete()
          .eq("user_id", profileId)
          .eq("sport", sportId);

        if (error) throw error;

        setPreferredSports((prev) => prev.filter((id) => id !== sportId));
      } else {
        const { error } = await supabase.from("user_sports").insert({
          user_id: profileId,
          sport: sportId,
        });

        if (error) throw error;

        setPreferredSports((prev) => [...prev, sportId]);
      }
    } catch (err) {
      console.error("toggle preferred sport error", err);
      alert(err?.message || "Could not update preferred sports.");
    } finally {
      setSavingSports(false);
    }
  };

  const handleAvatarUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !isOwnProfile || !profile?.id) return;

    try {
      setUploadingAvatar(true);

      const extension = (file.name.split(".").pop() || "jpg").toLowerCase();
      const safeExtension = ["jpg", "jpeg", "png", "webp"].includes(extension)
        ? extension
        : "jpg";

      const filePath = `${profile.id}/avatar.${safeExtension}`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(filePath, file, {
          cacheControl: "3600",
          upsert: true,
        });

      if (uploadError) {
        throw uploadError;
      }

      const { data: publicData } = supabase.storage
        .from("avatars")
        .getPublicUrl(filePath);

      const publicUrl = `${publicData.publicUrl}?t=${Date.now()}`;

      const { error: profileError } = await supabase
        .from("profiles")
        .update({ avatar_url: publicUrl })
        .eq("id", profile.id);

      if (profileError) {
        throw profileError;
      }

      await loadProfilePage();
    } catch (err) {
      console.error("avatar upload error", err);
      alert(err?.message || "Avatar upload failed.");
    } finally {
      setUploadingAvatar(false);
      e.target.value = "";
    }
  };

  const isOwnProfile = user?.id === profile?.id;
  const isModerator = myProfile?.role === "moderator";

  const canSeeField = (visibilityValue) => {
    if (isOwnProfile) return true;
    if (isModerator) return true;
    if (visibilityValue === "all") return true;
    return false;
  };

  const calculateAge = (birthDate) => {
    if (!birthDate) return null;

    const today = new Date();
    const birth = new Date(birthDate);

    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();

    if (
      monthDiff < 0 ||
      (monthDiff === 0 && today.getDate() < birth.getDate())
    ) {
      age--;
    }

    return age;
  };

  const age = calculateAge(profile?.birth_date);
  const sportLabels = getSportLabels(preferredSports);

  if (loading) {
    return (
      <main style={app}>
        <div style={topBar}>
          <Link href="/" style={linkBtn}>
            Back to app
          </Link>
        </div>
        <div style={card}>Loading...</div>
      </main>
    );
  }

  if (errorText) {
    return (
      <main style={app}>
        <div style={topBar}>
          <Link href="/" style={linkBtn}>
            Back to app
          </Link>
        </div>
        <div style={card}>Error: {errorText}</div>
      </main>
    );
  }

  if (!profile) {
    return (
      <main style={app}>
        <div style={topBar}>
          <Link href="/" style={linkBtn}>
            Back to app
          </Link>
        </div>
        <div style={card}>Profile not found.</div>
      </main>
    );
  }

  return (
    <main style={app}>
      <div style={topBar}>
        <Link href="/" style={linkBtn}>
          Back to app
        </Link>
      </div>

      <section style={card}>
        <div style={profileHeader}>
          <div style={avatarWrap}>
            {profile.avatar_url && canSeeField(visibility.avatar_visibility) ? (
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

            {isOwnProfile && (
              <label style={uploadLabel}>
                {uploadingAvatar ? "Uploading..." : "Choose Photo"}
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarUpload}
                  style={{ display: "none" }}
                  disabled={uploadingAvatar}
                />
              </label>
            )}
          </div>

          <div style={{ flex: 1 }}>
            <h1 style={nameStyle}>{profile.name || "Unknown user"}</h1>
            <div style={roleBadge}>{profile.role || "user"}</div>

            {age !== null && canSeeField(visibility.age_visibility) && (
              <div style={metaLine}>🎂 {age} years old</div>
            )}

            {profile.location &&
              canSeeField(visibility.location_visibility) && (
                <div style={metaLine}>📍 {profile.location}</div>
              )}

            {profile.email && canSeeField(visibility.email_visibility) && (
              <div style={metaLine}>✉️ {profile.email}</div>
            )}

            {profile.phone && canSeeField(visibility.phone_visibility) && (
              <div style={metaLine}>📞 {profile.phone}</div>
            )}
          </div>
        </div>

        <div style={box}>
          <div style={sectionTitle}>Preferred Sports</div>

          {isOwnProfile ? (
            <>
              <div style={sportsPicker}>
                {SPORTS.map((sport) => {
                  const selected = preferredSports.includes(sport.id);

                  return (
                    <button
                      key={sport.id}
                      type="button"
                      onClick={() => togglePreferredSport(sport.id)}
                      disabled={savingSports}
                      style={selected ? sportChipSelected : sportChipButton}
                    >
                      <span style={{ marginRight: 6 }}>{sport.icon}</span>
                      {sport.label}
                    </button>
                  );
                })}
              </div>

              {savingSports ? (
                <div style={helperText}>Saving preferred sports...</div>
              ) : null}
            </>
          ) : sportLabels.length === 0 ? (
            <div style={emptyText}>No preferred sports selected.</div>
          ) : (
            <div style={sportsGrid}>
              {sportLabels.map((label) => (
                <div key={label} style={sportChip}>
                  {label}
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={box}>
          <div style={sectionTitle}>My Team</div>

          {loadingTeam ? (
            <div style={emptyText}>Loading team...</div>
          ) : teamMembers.length === 0 ? (
            <div style={emptyText}>No team members yet.</div>
          ) : (
            <div style={teamGrid}>
              {teamMembers.map((member) => (
                <Link
                  key={member.id}
                  href={`/profile/${member.id}`}
                  style={teamCard}
                >
                  {member.avatar_url ? (
                    <img
                      src={member.avatar_url}
                      alt={member.name || "User"}
                      style={teamAvatar}
                    />
                  ) : (
                    <div style={teamAvatarPlaceholder}>
                      {(member.name || "?").charAt(0).toUpperCase()}
                    </div>
                  )}

                  <div style={teamName}>{member.name || "Unknown user"}</div>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div style={box}>
          <div style={sectionTitle}>Sport Profiles</div>

          {profile.strava_url && canSeeField(visibility.strava_visibility) ? (
            <a
              href={profile.strava_url}
              target="_blank"
              rel="noreferrer"
              style={sportLink}
            >
              Strava
            </a>
          ) : null}

          {profile.garmin_url && canSeeField(visibility.garmin_visibility) ? (
            <a
              href={profile.garmin_url}
              target="_blank"
              rel="noreferrer"
              style={sportLink}
            >
              Garmin
            </a>
          ) : null}

          {profile.suunto_url && canSeeField(visibility.suunto_visibility) ? (
            <a
              href={profile.suunto_url}
              target="_blank"
              rel="noreferrer"
              style={sportLink}
            >
              Suunto
            </a>
          ) : null}

          {!profile.strava_url && !profile.garmin_url && !profile.suunto_url ? (
            <div style={emptyText}>No sport profiles added yet.</div>
          ) : null}
        </div>

        {isOwnProfile && !editing && (
          <div style={btnRow}>
            <button onClick={() => setEditing(true)} style={primaryBtn}>
              Edit Profile
            </button>

            <Link href="/settings/privacy" style={secondaryLinkBtn}>
              Privacy Settings
            </Link>
          </div>
        )}

        {isOwnProfile && editing && (
          <form onSubmit={saveProfile} style={editBox}>
            <div style={grid}>
              <div>
                <div style={label}>Name</div>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  style={field}
                />
              </div>

              <div>
                <div style={label}>Birth Date</div>
                <input
                  type="date"
                  value={form.birth_date}
                  onChange={(e) =>
                    setForm({ ...form, birth_date: e.target.value })
                  }
                  style={field}
                />
              </div>

              <div>
                <div style={label}>Location</div>
                <input
                  value={form.location}
                  onChange={(e) =>
                    setForm({ ...form, location: e.target.value })
                  }
                  style={field}
                />
              </div>

              <div>
                <div style={label}>Email Address</div>
                <input
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  style={field}
                />
              </div>

              <div>
                <div style={label}>Phone Number</div>
                <input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  style={field}
                />
              </div>

              <div>
                <div style={label}>Strava Link</div>
                <input
                  value={form.strava_url}
                  onChange={(e) =>
                    setForm({ ...form, strava_url: e.target.value })
                  }
                  style={field}
                />
              </div>

              <div>
                <div style={label}>Garmin Link</div>
                <input
                  value={form.garmin_url}
                  onChange={(e) =>
                    setForm({ ...form, garmin_url: e.target.value })
                  }
                  style={field}
                />
              </div>

              <div>
                <div style={label}>Suunto Link</div>
                <input
                  value={form.suunto_url}
                  onChange={(e) =>
                    setForm({ ...form, suunto_url: e.target.value })
                  }
                  style={field}
                />
              </div>
            </div>

            <div style={btnRow}>
              <button type="submit" style={primaryBtn} disabled={saving}>
                {saving ? "Saving..." : "Save"}
              </button>

              <button
                type="button"
                onClick={() => setEditing(false)}
                style={secondaryBtn}
              >
                Cancel
              </button>
            </div>
          </form>
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
  marginBottom: 16,
};

const linkBtn = {
  display: "inline-block",
  background: "#2a2a2a",
  color: "white",
  textDecoration: "none",
  padding: "12px 16px",
  borderRadius: 12,
};

const card = {
  background: "#111",
  border: "1px solid rgba(255,255,255,0.06)",
  borderRadius: 24,
  padding: 20,
};

const profileHeader = {
  display: "flex",
  gap: 20,
  alignItems: "center",
  marginBottom: 24,
};

const avatarWrap = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 10,
};

const avatar = {
  width: 110,
  height: 110,
  borderRadius: "50%",
  objectFit: "cover",
  objectPosition: "center",
  display: "block",
  border: "3px solid rgba(228,239,22,0.18)",
};

const avatarPlaceholder = {
  width: 110,
  height: 110,
  borderRadius: "50%",
  background: "#1f1f1f",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 42,
  fontWeight: "bold",
  color: "#e4ef16",
  border: "3px solid rgba(228,239,22,0.18)",
};

const uploadLabel = {
  display: "inline-block",
  background: "#2a2a2a",
  color: "white",
  padding: "10px 14px",
  borderRadius: 12,
  cursor: "pointer",
  fontSize: 13,
  fontWeight: "bold",
  border: "1px solid rgba(255,255,255,0.08)",
};

const nameStyle = {
  margin: 0,
  fontSize: 28,
};

const roleBadge = {
  marginTop: 8,
  display: "inline-block",
  background: "rgba(228,239,22,0.12)",
  color: "#e4ef16",
  padding: "6px 10px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: "bold",
};

const metaLine = {
  marginTop: 8,
  opacity: 0.85,
};

const box = {
  marginTop: 18,
  padding: 16,
  background: "#0b0b0b",
  border: "1px solid rgba(255,255,255,0.06)",
  borderRadius: 18,
  display: "grid",
  gap: 10,
};

const sectionTitle = {
  fontSize: 16,
  fontWeight: 700,
};

const emptyText = {
  opacity: 0.65,
};

const helperText = {
  fontSize: 13,
  opacity: 0.7,
  marginTop: 4,
};

const sportsGrid = {
  display: "flex",
  flexWrap: "wrap",
  gap: 10,
  marginTop: 4,
};

const sportsPicker = {
  display: "flex",
  flexWrap: "wrap",
  gap: 10,
  marginTop: 4,
};

const sportChip = {
  background: "#e4ef16",
  color: "black",
  border: "1px solid #e4ef16",
  padding: "8px 14px",
  borderRadius: 999,
  fontWeight: "bold",
};

const sportChipButton = {
  background: "#222",
  border: "1px solid #333",
  color: "white",
  padding: "8px 14px",
  borderRadius: 999,
  cursor: "pointer",
};

const sportChipSelected = {
  background: "#e4ef16",
  color: "black",
  border: "1px solid #e4ef16",
  padding: "8px 14px",
  borderRadius: 999,
  fontWeight: "bold",
  cursor: "pointer",
};

const teamGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))",
  gap: 12,
  marginTop: 4,
};

const teamCard = {
  background: "#151515",
  border: "1px solid rgba(255,255,255,0.05)",
  borderRadius: 16,
  padding: 12,
  textDecoration: "none",
  color: "white",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 10,
};

const teamAvatar = {
  width: 64,
  height: 64,
  borderRadius: "50%",
  objectFit: "cover",
  objectPosition: "center",
  display: "block",
};

const teamAvatarPlaceholder = {
  width: 64,
  height: 64,
  borderRadius: "50%",
  background: "#1f1f1f",
  color: "#e4ef16",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontWeight: "bold",
  fontSize: 22,
};

const teamName = {
  textAlign: "center",
  fontSize: 14,
  fontWeight: 600,
  lineHeight: 1.3,
};

const sportLink = {
  display: "inline-block",
  color: "#e4ef16",
  textDecoration: "none",
};

const btnRow = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  marginTop: 18,
};

const primaryBtn = {
  background: "#e4ef16",
  color: "black",
  border: "none",
  padding: "12px 16px",
  borderRadius: 12,
  fontWeight: "bold",
};

const secondaryBtn = {
  background: "#2a2a2a",
  color: "white",
  border: "none",
  padding: "12px 16px",
  borderRadius: 12,
};

const secondaryLinkBtn = {
  display: "inline-block",
  background: "#2a2a2a",
  color: "white",
  textDecoration: "none",
  padding: "12px 16px",
  borderRadius: 12,
};

const editBox = {
  marginTop: 20,
  padding: 16,
  background: "#0b0b0b",
  border: "1px solid rgba(255,255,255,0.06)",
  borderRadius: 18,
};

const grid = {
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
