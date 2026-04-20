"use client";

import { useEffect, useState, useCallback } from "react";
import Cropper from "react-easy-crop";
import { supabase } from "../../../lib/supabase";

export default function ProfilePage({ params }) {
  const profileId = params.id;

  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [mijnProfiel, setMijnProfiel] = useState(null);
  const [profiel, setProfiel] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    naam: "",
    woonplaats: "",
    email: "",
    telefoonnummer: "",
    strava_url: "",
    garmin_url: "",
    suunto_url: "",
  });

  const [cropModalOpen, setCropModalOpen] = useState(false);
  const [imageSrc, setImageSrc] = useState(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);

  useEffect(() => {
    const init = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      setSession(session);
      setUser(session?.user ?? null);
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
    laadProfiel();
  }, [profileId]);

  useEffect(() => {
    if (user?.id) {
      laadMijnProfiel();
    } else {
      setMijnProfiel(null);
    }
  }, [user?.id]);

  const laadProfiel = async () => {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", profileId)
      .single();

    if (error) {
      console.error("profiel laden fout", error);
      return;
    }

    setProfiel(data);
    setForm({
      naam: data.naam || "",
      woonplaats: data.woonplaats || "",
      email: data.email || "",
      telefoonnummer: data.telefoonnummer || "",
      strava_url: data.strava_url || "",
      garmin_url: data.garmin_url || "",
      suunto_url: data.suunto_url || "",
    });
  };

  const laadMijnProfiel = async () => {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (error) {
      console.error("eigen profiel laden fout", error);
      return;
    }

    setMijnProfiel(data);
  };

const isEigenProfiel = user?.id === profiel?.id;
  const isModerator = mijnProfiel?.role === "moderator";

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
      canvas.toBlob(
        (blob) => resolve(blob),
        "image/jpeg",
        0.92
      );
    });
  };

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!isEigenProfiel && !isModerator) {
      alert("Je mag deze profielfoto niet wijzigen.");
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
    if (!imageSrc || !croppedAreaPixels || !profiel?.id) return;

    setUploadingAvatar(true);

    try {
      const croppedBlob = await getCroppedImgBlob(imageSrc, croppedAreaPixels);

      if (!croppedBlob) {
        setUploadingAvatar(false);
        alert("Kon de afbeelding niet verwerken.");
        return;
      }

      const filePath = `${profiel.id}/avatar.jpg`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(filePath, croppedBlob, {
          cacheControl: "3600",
          upsert: true,
          contentType: "image/jpeg",
        });

      if (uploadError) {
        setUploadingAvatar(false);
        alert(`Upload mislukt: ${uploadError.message}`);
        return;
      }

      const { data } = supabase.storage.from("avatars").getPublicUrl(filePath);
      const publicUrl = `${data.publicUrl}?t=${Date.now()}`;

      const { error: updateError } = await supabase
        .from("profiles")
        .update({ avatar_url: publicUrl })
        .eq("id", profiel.id);

      if (updateError) {
        setUploadingAvatar(false);
        alert(`Opslaan profielfoto mislukt: ${updateError.message}`);
        return;
      }

      setCropModalOpen(false);
      setImageSrc(null);
      await laadProfiel();
      await laadMijnProfiel();
      alert("Profielfoto bijgewerkt");
    } catch (err) {
      console.error(err);
      alert("Er ging iets mis bij het bijsnijden van de foto.");
    }

    setUploadingAvatar(false);
  };


  const opslaanProfiel = async (e) => {
    e.preventDefault();

    const { error } = await supabase
      .from("profiles")
      .update({
        naam: form.naam,
        woonplaats: form.woonplaats,
        email: form.email,
        telefoonnummer: form.telefoonnummer,
        strava_url: form.strava_url,
        garmin_url: form.garmin_url,
        suunto_url: form.suunto_url,
      })
      .eq("id", profiel.id);

    if (error) {
      alert(`Opslaan mislukt: ${error.message}`);
      return;
    }

    alert("Profiel opgeslagen");
    setEditing(false);
    await laadProfiel();
    await laadMijnProfiel();
  };

  if (loading) {
    return (
      <main style={app}>
        <div style={card}>Laden...</div>
      </main>
    );
  }

  if (!profiel) {
    return (
      <main style={app}>
        <div style={card}>Profiel niet gevonden.</div>
      </main>
    );
  }

  return (
    <main style={app}>
      <div style={topBar}>
        <a href="/" style={linkBtn}>
          Terug naar app
        </a>
      </div>

      <section style={card}>
        <div style={profileHeader}>
          <div style={avatarWrap}>
            <div style={avatarRing}>
              {profiel.avatar_url ? (
                <img
                  src={profiel.avatar_url}
                  alt={profiel.naam}
                  style={avatar}
                />
              ) : (
                <div style={avatarPlaceholder}>
                  {(profiel.naam || "?").charAt(0).toUpperCase()}
                </div>
              )}
            </div>

            {(isEigenProfiel || isModerator) && (
              <div style={uploadWrap}>
                <label style={uploadLabel}>
                  {uploadingAvatar ? "Uploaden..." : "Foto kiezen"}
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
            <h1 style={name}>{profiel.naam || "Onbekend"}</h1>
            <div style={roleBadge}>{profiel.role || "gebruiker"}</div>

            {profiel.woonplaats && (
              <div style={metaLine}>📍 {profiel.woonplaats}</div>
            )}

            {profiel.email && (
              <div style={metaLine}>✉️ {profiel.email}</div>
            )}

            {profiel.telefoonnummer && (
              <div style={metaLine}>📞 {profiel.telefoonnummer}</div>
            )}
          </div>
        </div>

        <div style={linksBox}>
          <div style={sectionTitle}>Sportprofielen</div>

          {profiel.strava_url ? (
            <a href={profiel.strava_url} target="_blank" rel="noreferrer" style={sportLink}>
              Strava
            </a>
          ) : null}

          {profiel.garmin_url ? (
            <a href={profiel.garmin_url} target="_blank" rel="noreferrer" style={sportLink}>
              Garmin
            </a>
          ) : null}

          {profiel.suunto_url ? (
            <a href={profiel.suunto_url} target="_blank" rel="noreferrer" style={sportLink}>
              Suunto
            </a>
          ) : null}

          {!profiel.strava_url && !profiel.garmin_url && !profiel.suunto_url && (
            <div style={emptyText}>Nog geen sportprofielen toegevoegd.</div>
          )}
        </div>

{(isEigenProfiel || isModerator) && !editing && (
          <div style={btnRow}>
            <button onClick={() => setEditing(true)} style={primaryBtn}>
              Profiel bewerken
            </button>
          </div>
        )}

        {editing && (
          <form onSubmit={opslaanProfiel} style={editBox}>
            <div style={grid}>
              <div>
                <div style={label}>Naam</div>
                <input
                  value={form.naam}
                  onChange={(e) => setForm({ ...form, naam: e.target.value })}
                  style={veld}
                />
              </div>

              <div>
                <div style={label}>Woonplaats</div>
                <input
                  value={form.woonplaats}
                  onChange={(e) => setForm({ ...form, woonplaats: e.target.value })}
                  style={veld}
                />
              </div>

              <div>
                <div style={label}>Mailadres</div>
                <input
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  style={veld}
                />
              </div>

              <div>
                <div style={label}>Telefoonnummer</div>
                <input
                  value={form.telefoonnummer}
                  onChange={(e) => setForm({ ...form, telefoonnummer: e.target.value })}
                  style={veld}
                />
              </div>

              <div>
                <div style={label}>Strava link</div>
                <input
                  value={form.strava_url}
                  onChange={(e) => setForm({ ...form, strava_url: e.target.value })}
                  style={veld}
                />
              </div>

              <div>
                <div style={label}>Garmin link</div>
                <input
                  value={form.garmin_url}
                  onChange={(e) => setForm({ ...form, garmin_url: e.target.value })}
                  style={veld}
                />
              </div>

              <div>
                <div style={label}>Suunto link</div>
                <input
                  value={form.suunto_url}
                  onChange={(e) => setForm({ ...form, suunto_url: e.target.value })}
                  style={veld}
                />
              </div>
            </div>

            <div style={btnRow}>
              <button type="submit" style={primaryBtn}>
                Opslaan
              </button>

              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setForm({
                    naam: profiel.naam || "",
                    woonplaats: profiel.woonplaats || "",
                    email: profiel.email || "",
                    telefoonnummer: profiel.telefoonnummer || "",
                    strava_url: profiel.strava_url || "",
                    garmin_url: profiel.garmin_url || "",
                    suunto_url: profiel.suunto_url || "",
                  });
                }}
                style={secondaryBtn}
              >
                Annuleren
              </button>
            </div>
          </form>
        )}
      </section>

      {cropModalOpen && imageSrc && (
        <div style={cropOverlay}>
          <div style={cropModal}>
            <div style={cropTitle}>Profielfoto bijsnijden</div>

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
                disabled={uploadingAvatar}
              >
                {uploadingAvatar ? "Opslaan..." : "Gebruik deze foto"}
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
                Annuleren
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

const name = {
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

const veld = {
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

const linkBtn = {
  display: "inline-block",
  background: "#2a2a2a",
  color: "white",
  textDecoration: "none",
  padding: "12px 16px",
  borderRadius: 12,
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
  
