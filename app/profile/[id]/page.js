"use client";

import Link from "next/link";
import { useEffect, useState, useCallback } from "react";
import Cropper from "react-easy-crop";
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

export default function ProfilePage({ params }) {
  const profileId = params.id;

  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [myProfile, setMyProfile] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const [editing, setEditing] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [partnerLoading, setPartnerLoading] = useState(false);

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

  const [visibility, setVisibility] = useState(DEFAULT_VISIBILITY);
  const [visibilityForm, setVisibilityForm] = useState(DEFAULT_VISIBILITY);

  const [partnerRow, setPartnerRow] = useState(null);

  const [cropModalOpen, setCropModalOpen] = useState(false);
  const [imageSrc, setImageSrc] = useState(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);

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
    loadProfile();
  }, [profileId]);

  useEffect(() => {
    if (user?.id) {
      loadMyProfile();
    } else {
      setMyProfile(null);
    }
  }, [user?.id]);

  useEffect(() => {
    if (user?.id && profileId && user.id !== profileId) {
      loadPartnerStatus();
    } else {
      setPartnerRow(null);
    }
  }, [user?.id, profileId]);

  const loadProfile = async () => {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", profileId)
      .single();

    if (error) {
      console.error("profile load error", error);
      return;
    }

    setProfile(data);
    setForm({
      name: data.name || "",
      location: data.location || "",
      email: data.email || "",
      phone: data.phone || "",
      strava_url: data.strava_url || "",
      garmin_url: data.garmin_url || "",
      suunto_url: data.suunto_url || "",
      birth_date: data.birth_date || "",
    });

    const { data: visData, error: visError } = await supabase
      .from("profile_visibility_settings")
      .select("*")
      .eq("user_id", profileId)
      .maybeSingle();

    if (visError) {
      console.error("visibility load error", visError);
    }

    const nextVisibility = visData
      ? {
          avatar_visibility:
            visData.avatar_visibility || DEFAULT_VISIBILITY.avatar_visibility,
          location_visibility:
            visData.location_visibility ||
            DEFAULT_VISIBILITY.location_visibility,
          email_visibility:
            visData.email_visibility || DEFAULT_VISIBILITY.email_visibility,
          phone_visibility:
            visData.phone_visibility || DEFAULT_VISIBILITY.phone_visibility,
          strava_visibility:
            visData.strava_visibility || DEFAULT_VISIBILITY.strava_visibility,
          garmin_visibility:
            visData.garmin_visibility || DEFAULT_VISIBILITY.garmin_visibility,
          suunto_visibility:
            visData.suunto_visibility || DEFAULT_VISIBILITY.suunto_visibility,
          age_visibility:
            visData.age_visibility || DEFAULT_VISIBILITY.age_visibility,
        }
      : DEFAULT_VISIBILITY;

    setVisibility(nextVisibility);
    setVisibilityForm(nextVisibility);
  };

  const loadMyProfile = async () => {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (error) {
      console.error("my profile load error", error);
      return;
    }

    setMyProfile(data);
  };




const loadPartnerStatus = async () => {
    setPartnerLoading(true);

    const { data, error } = await supabase
      .from("training_partners")
      .select("*")
      .or(
        `and(requester_id.eq.${user.id},addressee_id.eq.${profileId}),and(requester_id.eq.${profileId},addressee_id.eq.${user.id})`
      )
      .maybeSingle();

    setPartnerLoading(false);

    if (error) {
      console.error("partner status load error", error);
      return;
    }

    setPartnerRow(data || null);
  };

  const sendPartnerRequest = async () => {
    const { error } = await supabase.from("training_partners").insert({
      requester_id: user.id,
      addressee_id: profileId,
      status: "pending",
    });

    if (error) {
      alert(`Sending request failed: ${error.message}`);
      return;
    }

    await loadPartnerStatus();
  };

  const acceptPartnerRequest = async () => {
    if (!partnerRow?.id) return;

    const { error } = await supabase
      .from("training_partners")
      .update({
        status: "accepted",
        responded_at: new Date().toISOString(),
      })
      .eq("id", partnerRow.id);

    if (error) {
      alert(`Accept failed: ${error.message}`);
      return;
    }

    await loadPartnerStatus();
  };

  const rejectPartnerRequest = async () => {
    if (!partnerRow?.id) return;

    const { error } = await supabase
      .from("training_partners")
      .update({
        status: "rejected",
        responded_at: new Date().toISOString(),
      })
      .eq("id", partnerRow.id);

    if (error) {
      alert(`Reject failed: ${error.message}`);
      return;
    }

    await loadPartnerStatus();
  };

  const removePartner = async () => {
    if (!partnerRow?.id) return;
    if (!confirm("Remove Training Partner?")) return;

    const { error } = await supabase
      .from("training_partners")
      .delete()
      .eq("id", partnerRow.id);

    if (error) {
      alert(`Remove failed: ${error.message}`);
      return;
    }

    await loadPartnerStatus();
  };

  const onCropComplete = useCallback((_croppedArea, croppedPixels) => {
    setCroppedAreaPixels(croppedPixels);
  }, []);

  const readFile = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.addEventListener("load", () => resolve(reader.result));
      reader.addEventListener("error", reject);
      reader.readAsDataURL(file);
    });

  const createImage = (url) =>
    new Promise((resolve, reject) => {
      const image = new Image();
      image.addEventListener("load", () => resolve(image));
      image.addEventListener("error", reject);
      image.setAttribute("crossOrigin", "anonymous");
      image.src = url;
    });

  const getCroppedImgBlob = async (imageSrcValue, pixelCrop) => {
    const image = await createImage(imageSrcValue);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    canvas.width = pixelCrop.width;
    canvas.height = pixelCrop.height;

    ctx.drawImage(
      image,
      pixelCrop.x,
      pixelCrop.y,
      pixelCrop.width,
      pixelCrop.height,
      0,
      0,
      pixelCrop.width,
      pixelCrop.height
    );

    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.92);
    });
  };


const isOwnProfile = user?.id === profile?.id;
  const isModerator = myProfile?.role === "moderator";
  const isPartner =
    partnerRow?.status === "accepted" &&
    (partnerRow?.requester_id === user?.id ||
      partnerRow?.addressee_id === user?.id);

  const canSeeField = (visibilityValue) => {
    if (isOwnProfile) return true;
    if (isModerator) return true;
    if (!visibilityValue) return false;
    if (visibilityValue === "all") return true;
    if (visibilityValue === "partners" && isPartner) return true;
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

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!isOwnProfile) {
      alert("You can only change your own profile photo.");
      return;
    }

    const imageDataUrl = await readFile(file);
    setImageSrc(imageDataUrl);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCropModalOpen(true);
    e.target.value = "";
  };

  const uploadCroppedAvatar = async () => {
    if (!imageSrc || !croppedAreaPixels || !profile?.id) return;

    setUploadingAvatar(true);

    try {
      const croppedBlob = await getCroppedImgBlob(imageSrc, croppedAreaPixels);

      if (!croppedBlob) {
        setUploadingAvatar(false);
        alert("Could not process the image.");
        return;
      }

      const filePath = `${profile.id}/avatar.jpg`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(filePath, croppedBlob, {
          cacheControl: "3600",
          upsert: true,
          contentType: "image/jpeg",
        });

      if (uploadError) {
        setUploadingAvatar(false);
        alert(`Upload failed: ${uploadError.message}`);
        return;
      }

      const { data } = supabase.storage.from("avatars").getPublicUrl(filePath);
      const publicUrl = `${data.publicUrl}?t=${Date.now()}`;

      const { error: updateError } = await supabase
        .from("profiles")
        .update({ avatar_url: publicUrl })
        .eq("id", profile.id);

      if (updateError) {
        setUploadingAvatar(false);
        alert(`Saving profile photo failed: ${updateError.message}`);
        return;
      }

      setCropModalOpen(false);
      setImageSrc(null);
      await loadProfile();
      await loadMyProfile();
      alert("Profile photo updated");
    } catch (err) {
      console.error(err);
      alert("Something went wrong while cropping the image.");
    }

    setUploadingAvatar(false);
  };

  const saveProfile = async (e) => {
    e.preventDefault();

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
      alert(`Saving failed: ${error.message}`);
      return;
    }

    alert("Profile saved");
    setEditing(false);
    await loadProfile();
    await loadMyProfile();
  };



if (loading) {
    return (
      <main style={app}>
        <div style={card}>Loading...</div>
      </main>
    );
  }

  if (!profile) {
    return (
      <main style={app}>
        <div style={card}>Profile not found.</div>
      </main>
    );
  }

  return (
    <main style={app}>
      <div style={topBar}>
        <a href="/" style={linkBtn}>
          Back to app
        </a>
      </div>

      <section style={card}>
        <div style={profileHeader}>
          <div style={avatarWrap}>
            <div style={avatarRing}>
              {profile.avatar_url && canSeeField(visibility?.avatar_visibility) ? (
                <img
                  src={profile.avatar_url}
                  alt={profile.name}
                  style={avatar}
                />
              ) : (
                <div style={avatarPlaceholder}>
                  {(profile.name || "?").charAt(0).toUpperCase()}
                </div>
              )}
            </div>

            {isOwnProfile && (
              <div style={uploadWrap}>
                <label style={uploadLabel}>
                  {uploadingAvatar ? "Uploading..." : "Choose photo"}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileSelect}
                    style={{ display: "none" }}
                    disabled={uploadingAvatar}
                  />
                </label>
              </div>
            )}
          </div>

          <div style={{ flex: 1 }}>
            <h1 style={nameStyle}>{profile.name || "Unknown"}</h1>
            <div style={roleBadge}>{profile.role || "user"}</div>

            {age !== null && canSeeField(visibility?.age_visibility) && (
              <div style={metaLine}>🎂 {age} years old</div>
            )}

            {profile.location &&
              canSeeField(visibility?.location_visibility) && (
                <div style={metaLine}>📍 {profile.location}</div>
              )}

            {profile.email && canSeeField(visibility?.email_visibility) && (
              <div style={metaLine}>✉️ {profile.email}</div>
            )}

            {profile.phone && canSeeField(visibility?.phone_visibility) && (
              <div style={metaLine}>📞 {profile.phone}</div>
            )}
          </div>
        </div>

        {!isOwnProfile && session && (
          <div style={partnerBox}>
            {partnerLoading ? (
              <div style={emptyText}>Loading status...</div>
            ) : !partnerRow ? (
              <button onClick={sendPartnerRequest} style={teamUpBtn}>
                🤝 Team Up
              </button>
            ) : partnerRow.status === "pending" &&
              partnerRow.requester_id === user.id ? (
              <div style={statusPill}>⏳ Request Sent</div>
            ) : partnerRow.status === "pending" &&
              partnerRow.addressee_id === user.id ? (
              <div style={btnRow}>
                <button onClick={acceptPartnerRequest} style={teamAcceptBtn}>
                  ⚡ Accept Team Up
                </button>
                <button onClick={rejectPartnerRequest} style={secondaryBtn}>
                  Reject
                </button>
              </div>
            ) : partnerRow.status === "accepted" ? (
              <div style={btnRow}>
                <div style={statusPill}>🤝 Training Partners</div>
                <button onClick={removePartner} style={secondaryBtn}>
                  Remove
                </button>
              </div>
            ) : partnerRow.status === "rejected" ? (
              <button onClick={sendPartnerRequest} style={teamUpBtn}>
                🤝 Team Up Again
              </button>
            ) : (
              <div style={emptyText}>No action available.</div>
            )}
          </div>
        )}

        <div style={linksBox}>
          <div style={sectionTitle}>Sport Profiles</div>

          {profile.strava_url && canSeeField(visibility?.strava_visibility) ? (
            <a
              href={profile.strava_url}
              target="_blank"
              rel="noreferrer"
              style={sportLink}
            >
              Strava
            </a>
          ) : null}

          {profile.garmin_url && canSeeField(visibility?.garmin_visibility) ? (
            <a
              href={profile.garmin_url}
              target="_blank"
              rel="noreferrer"
              style={sportLink}
            >
              Garmin
            </a>
          ) : null}

          {profile.suunto_url && canSeeField(visibility?.suunto_visibility) ? (
            <a
              href={profile.suunto_url}
              target="_blank"
              rel="noreferrer"
              style={sportLink}
            >
              Suunto
            </a>
          ) : null}

          {!(
            (profile.strava_url && canSeeField(visibility?.strava_visibility)) ||
            (profile.garmin_url && canSeeField(visibility?.garmin_visibility)) ||
            (profile.suunto_url && canSeeField(visibility?.suunto_visibility))
          ) && <div style={emptyText}>No visible sport profiles.</div>}
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

        {editing && (
          <form onSubmit={saveProfile} style={editBox}>
            <div style={grid}>
              <div>
                <div style={label}>Name</div>
                <input
                  value={form.name}
                  onChange={(e) =>
                    setForm({ ...form, name: e.target.value })
                  }
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
                  onChange={(e) =>
                    setForm({ ...form, email: e.target.value })
                  }
                  style={field}
                />
              </div>

              <div>
                <div style={label}>Phone Number</div>
                <input
                  value={form.phone}
                  onChange={(e) =>
                    setForm({ ...form, phone: e.target.value })
                  }
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
              <button type="submit" style={primaryBtn}>
                Save
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

      {cropModalOpen && imageSrc && (
        <div style={cropOverlay}>
          <div style={cropModal}>
            <div style={cropTitle}>Crop Profile Photo</div>

            <div style={cropAreaWrap}>
              <Cropper
                image={imageSrc}
                crop={crop}
                zoom={zoom}
                aspect={1}
                cropShape="rect"
                showGrid={false}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
              />
            </div>

            <div style={zoomWrap}>
              <div style={label}>Zoom</div>
              <input
                type="range"
                min={1}
                max={3}
                step={0.01}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                style={{ width: "100%" }}
              />
            </div>



<div style={btnRow}>
              <button
                type="button"
                onClick={uploadCroppedAvatar}
                style={primaryBtn}
              >
                {uploadingAvatar ? "Saving..." : "Use This Photo"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setCropModalOpen(false);
                  setImageSrc(null);
                  setZoom(1);
                  setCrop({ x: 0, y: 0 });
                }}
                style={secondaryBtn}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
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
  flexShrink: 0,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 10,
};

const avatarRing = {
  width: 118,
  height: 118,
  borderRadius: "50%",
  padding: 4,
  background:
    "linear-gradient(135deg, rgba(228,239,22,0.55), rgba(228,239,22,0.12))",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const avatar = {
  width: 110,
  height: 110,
  borderRadius: "50%",
  objectFit: "cover",
  objectPosition: "center",
  display: "block",
  border: "3px solid rgba(228,239,22,0.35)",
  boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
  background: "#111",
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
  boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
};

const uploadWrap = {
  marginTop: 2,
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
  opacity: 0.8,
};

const partnerBox = {
  marginTop: 18,
  marginBottom: 18,
  padding: 16,
  background: "#0b0b0b",
  border: "1px solid rgba(255,255,255,0.06)",
  borderRadius: 18,
};

const statusPill = {
  display: "inline-block",
  background: "rgba(228,239,22,0.12)",
  color: "#e4ef16",
  padding: "10px 14px",
  borderRadius: 12,
  fontWeight: "bold",
};

const linksBox = {
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

const sportLink = {
  display: "inline-block",
  color: "#e4ef16",
  textDecoration: "none",
};

const emptyText = {
  opacity: 0.65,
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

const btnRow = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  marginTop: 16,
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

const linkBtn = {
  display: "inline-block",
  background: "#2a2a2a",
  color: "white",
  textDecoration: "none",
  padding: "12px 16px",
  borderRadius: 12,
};

const teamUpBtn = {
  background: "linear-gradient(135deg,#2563eb,#06b6d4)",
  color: "white",
  border: "none",
  padding: "12px 18px",
  borderRadius: 14,
  fontWeight: "bold",
  boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
};

const teamAcceptBtn = {
  background: "linear-gradient(135deg,#2563eb,#06b6d4)",
  color: "white",
  border: "none",
  padding: "12px 18px",
  borderRadius: 14,
  fontWeight: "bold",
  boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
};

const cropOverlay = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.8)",
  zIndex: 50,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 16,
};

const cropModal = {
  width: "100%",
  maxWidth: 420,
  background: "#111",
  borderRadius: 24,
  padding: 16,
  border: "1px solid rgba(255,255,255,0.08)",
};

const cropTitle = {
  fontSize: 20,
  fontWeight: 700,
  marginBottom: 12,
};

const cropAreaWrap = {
  position: "relative",
  width: "100%",
  height: 320,
  background: "#000",
  borderRadius: 18,
  overflow: "hidden",
};

const zoomWrap = {
  marginTop: 16,
};


           
  

