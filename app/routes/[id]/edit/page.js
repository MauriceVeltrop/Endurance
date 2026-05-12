"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import AppHeader from "../../../../components/AppHeader";
import { supabase } from "../../../../lib/supabase";
import { sportOptions } from "../../../../lib/sportsConfig";
import { getSportLabel } from "../../../../lib/trainingHelpers";
import { getTrainingHeroImage } from "../../../../lib/sportImages";
import { parseGpxText, formatRoutePointSummary } from "../../../../lib/gpxUtils";
import { makeSvgPolyline } from "../../../../lib/routePreview";

const routeSports = sportOptions.filter((sport) => sport.route);

export default function EditRoutePage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id;

  const [profile, setProfile] = useState(null);
  const [allowedSportIds, setAllowedSportIds] = useState([]);
  const [originalRoute, setOriginalRoute] = useState(null);
  const [checking, setChecking] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({
    sport_id: "",
    title: "",
    description: "",
    visibility: "public",
    distance_km: "",
    elevation_gain_m: "",
    gpx_file_url: "",
    route_points: null,
  });

  const availableSports = useMemo(() => {
    if (profile?.role === "admin" || profile?.role === "moderator") return routeSports;
    return routeSports.filter((sport) => allowedSportIds.includes(sport.id));
  }, [allowedSportIds, profile?.role]);

  const selectedSport = availableSports.find((sport) => sport.id === form.sport_id);
  const hero = getTrainingHeroImage(null, form.sport_id);
  const previewPolyline = useMemo(() => makeSvgPolyline(form.route_points, 320, 220, 18), [form.route_points]);
  const canEdit = Boolean(profile?.id && originalRoute?.creator_id === profile.id);

  const loadRoute = async () => {
    if (!id) return;
    setChecking(true);
    setMessage("");

    try {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData?.user;

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

      const { data: sportRows, error: sportError } = await supabase
        .from("user_sports")
        .select("sport_id")
        .eq("user_id", user.id);

      if (sportError) throw sportError;

      const allowed = (sportRows || []).map((row) => row.sport_id).filter(Boolean);
      setAllowedSportIds(allowed);

      const { data: route, error: routeError } = await supabase
        .from("routes")
        .select("id,creator_id,sport_id,title,description,visibility,distance_km,elevation_gain_m,gpx_file_url,route_points")
        .eq("id", id)
        .maybeSingle();

      if (routeError) throw routeError;

      if (!route) {
        setMessage("Route not found.");
        return;
      }

      setOriginalRoute(route);

      if (route.creator_id !== user.id) {
        setMessage("You can only edit routes you created.");
      }

      setForm({
        sport_id: route.sport_id || "",
        title: route.title || "",
        description: route.description || "",
        visibility: route.visibility || "public",
        distance_km: route.distance_km ?? "",
        elevation_gain_m: route.elevation_gain_m ?? "",
        gpx_file_url: route.gpx_file_url || "",
        route_points: route.route_points || null,
      });
    } catch (err) {
      console.error("Route edit load error", err);
      setMessage(err?.message || "Could not load route.");
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    loadRoute();
  }, [id]);


  const importGpxFile = async (file) => {
    if (!file) return;

    setMessage("");

    try {
      const text = await file.text();
      const parsed = parseGpxText(text);

      setForm((current) => ({
        ...current,
        route_points: parsed,
        distance_km: parsed.distance_km || current.distance_km,
        elevation_gain_m: parsed.elevation_gain_m || current.elevation_gain_m,
      }));

      setMessage(
        `GPX imported: ${parsed.point_count} points · ${parsed.distance_km} km · ${parsed.elevation_gain_m} m elevation`
      );
    } catch (err) {
      console.error("GPX import error", err);
      setMessage(err?.message || "Could not import GPX.");
    }
  };

  const updateForm = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const saveRoute = async (event) => {
    event.preventDefault();
    setMessage("");

    if (!canEdit) return setMessage("You can only edit routes you created.");
    if (!form.sport_id) return setMessage("Choose a route sport.");
    if (!form.title.trim()) return setMessage("Route title is required.");

    try {
      setSaving(true);

      const { error } = await supabase
        .from("routes")
        .update({
          sport_id: form.sport_id,
          title: form.title.trim(),
          description: form.description.trim(),
          visibility: form.visibility,
          distance_km: form.distance_km ? Number(form.distance_km) : null,
          elevation_gain_m: form.elevation_gain_m ? Number(form.elevation_gain_m) : null,
          gpx_file_url: form.gpx_file_url.trim() || null,
          route_points: form.route_points || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("creator_id", profile.id);

      if (error) throw error;

      setMessage("Route updated.");
      router.push(`/routes/${id}`);
    } catch (err) {
      console.error("Route update error", err);
      setMessage(err?.message || "Could not update route.");
    } finally {
      setSaving(false);
    }
  };

  const deleteRoute = async () => {
    setMessage("");

    if (!canEdit) return setMessage("You can only delete routes you created.");
    const confirmed = window.confirm("Delete this route? Training sessions using it may lose the route connection.");
    if (!confirmed) return;

    try {
      setDeleting(true);

      const { error } = await supabase
        .from("routes")
        .delete()
        .eq("id", id)
        .eq("creator_id", profile.id);

      if (error) throw error;

      router.push("/routes");
    } catch (err) {
      console.error("Route delete error", err);
      setMessage(err?.message || "Could not delete route. It may still be connected to training sessions.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <main style={styles.page}>
      <section style={styles.shell}>
        <AppHeader profile={profile} compact />

        <Link href={id ? `/routes/${id}` : "/routes"} style={styles.backLink}>
          ← Back to route
        </Link>

        <header style={styles.header}>
          <div style={styles.kicker}>Edit Route</div>
          <h1 style={styles.title}>Refine this route.</h1>
          <p style={styles.subtitle}>
            Update sport, visibility, distance, elevation and GPX reference. Route point editing comes next.
          </p>
        </header>

        <section style={styles.previewCard}>
          <div
            style={{
              ...styles.previewImage,
              ...(hero?.src
                ? {
                    backgroundImage: `url("${hero.src}")`,
                    backgroundSize: "cover",
                    backgroundPosition: hero.position || "center center",
                  }
                : {}),
            }}
          >
            <div style={styles.previewOverlay} />
            {previewPolyline ? (
              <svg viewBox="0 0 320 220" preserveAspectRatio="xMidYMid meet" style={styles.routeSvg}>
                <polyline points={previewPolyline} fill="none" stroke="rgba(0,0,0,0.58)" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
                <polyline points={previewPolyline} fill="none" stroke="#e4ef16" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : null}
          </div>
          <div style={styles.previewBody}>
            <span style={styles.sportBadge}>{selectedSport?.label || getSportLabel(form.sport_id) || "Route sport"}</span>
            <h2 style={styles.previewTitle}>{form.title || "Route"}</h2>
            <p style={styles.previewText}>
              {form.distance_km ? `${form.distance_km} km` : "Distance not set"} ·{" "}
              {form.elevation_gain_m ? `${form.elevation_gain_m} m elevation` : "Elevation not set"}
            </p>
          </div>
        </section>

        {message ? <section style={styles.message}>{message}</section> : null}

        {checking ? (
          <section style={styles.formCard}>
            <h2>Loading route...</h2>
          </section>
        ) : (
          <form onSubmit={saveRoute} style={styles.formCard}>
            <label style={styles.field}>
              <span>Sport</span>
              <select
                value={form.sport_id}
                onChange={(event) => updateForm("sport_id", event.target.value)}
                style={styles.input}
                disabled={!canEdit}
              >
                <option value="">Choose sport</option>
                {availableSports.map((sport) => (
                  <option key={sport.id} value={sport.id}>{sport.label}</option>
                ))}
              </select>
            </label>

            <label style={styles.field}>
              <span>Route title</span>
              <input value={form.title} onChange={(event) => updateForm("title", event.target.value)} style={styles.input} disabled={!canEdit} />
            </label>

            <label style={{ ...styles.field, gridColumn: "1 / -1" }}>
              <span>Description</span>
              <textarea
                value={form.description}
                onChange={(event) => updateForm("description", event.target.value)}
                placeholder="Route notes, surface, terrain, start point..."
                style={{ ...styles.input, minHeight: 110, paddingTop: 12 }}
                disabled={!canEdit}
              />
            </label>

            <label style={styles.field}>
              <span>Visibility</span>
              <select value={form.visibility} onChange={(event) => updateForm("visibility", event.target.value)} style={styles.input} disabled={!canEdit}>
                <option value="public">Public</option>
                <option value="team">Team</option>
                <option value="private">Private</option>
                <option value="selected">Selected people</option>
                <option value="group">Group</option>
              </select>
            </label>

            <label style={styles.field}>
              <span>Distance km</span>
              <input type="number" step="0.1" min="0" value={form.distance_km} onChange={(event) => updateForm("distance_km", event.target.value)} style={styles.input} disabled={!canEdit} />
            </label>

            <label style={styles.field}>
              <span>Elevation gain m</span>
              <input type="number" step="1" min="0" value={form.elevation_gain_m} onChange={(event) => updateForm("elevation_gain_m", event.target.value)} style={styles.input} disabled={!canEdit} />
            </label>

            <label style={styles.field}>
              <span>GPX file URL</span>
              <input value={form.gpx_file_url} onChange={(event) => updateForm("gpx_file_url", event.target.value)} placeholder="Optional external GPX link" style={styles.input} disabled={!canEdit} />
            </label>

            <section style={styles.gpxBox}>
              <div>
                <strong>Import GPX file</strong>
                <p>{formatRoutePointSummary(form.route_points)}</p>
              </div>
              <input
                type="file"
                accept=".gpx,application/gpx+xml,application/xml,text/xml"
                onChange={(event) => importGpxFile(event.target.files?.[0])}
                style={styles.fileInput}
                disabled={!canEdit}
              />
            </section>

            <div style={styles.nextBox}>
              <strong>Next route phase</strong>
              <p>
                Route points, GPX parsing and drag-to-edit will be layered on top of this editable route foundation.
              </p>
            </div>

            <button type="submit" disabled={saving || !canEdit} style={styles.saveButton}>
              {saving ? "Saving..." : "Save route"}
            </button>

            <button type="button" disabled={deleting || !canEdit} onClick={deleteRoute} style={styles.deleteButton}>
              {deleting ? "Deleting..." : "Delete route"}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}

const baseButton = { border: 0, cursor: "pointer", fontWeight: 950 };
const glass = "linear-gradient(145deg, rgba(255,255,255,0.105), rgba(255,255,255,0.045))";

const styles = {
  page: {
    minHeight: "100vh",
    background: "radial-gradient(circle at top right, rgba(228,239,22,0.12), transparent 30%), linear-gradient(180deg, #07100b 0%, #050505 65%, #020202 100%)",
    color: "white",
    padding: "18px 16px 42px",
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    overflowX: "hidden",
  },
  shell: { width: "100%", maxWidth: 960, margin: "0 auto", display: "grid", gap: 18, overflow: "hidden" },
  backLink: { width: "fit-content", color: "#e4ef16", textDecoration: "none", fontWeight: 950, border: "1px solid rgba(228,239,22,0.24)", borderRadius: 999, padding: "10px 14px", background: "rgba(228,239,22,0.08)" },
  header: { display: "grid", gap: 8 },
  kicker: { color: "#e4ef16", fontSize: 13, fontWeight: 950, letterSpacing: "0.14em", textTransform: "uppercase" },
  title: { margin: 0, fontSize: "clamp(38px, 10vw, 66px)", lineHeight: 0.96, letterSpacing: "-0.065em" },
  subtitle: { margin: 0, color: "rgba(255,255,255,0.68)", lineHeight: 1.5, maxWidth: 620 },
  previewCard: { overflow: "hidden", borderRadius: 32, background: glass, border: "1px solid rgba(255,255,255,0.14)", boxShadow: "0 24px 70px rgba(0,0,0,0.30)" },
  previewImage: { position: "relative", height: 220, background: "radial-gradient(circle at 78% 18%, rgba(228,239,22,0.16), transparent 34%), linear-gradient(145deg, #151915, #060706)" },
  previewOverlay: { position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(0,0,0,0.08), rgba(0,0,0,0.62))" },
  routeSvg: { position: "absolute", inset: 0, width: "100%", height: "100%", padding: 14, boxSizing: "border-box", filter: "drop-shadow(0 12px 28px rgba(228,239,22,0.20))" },
  previewBody: { padding: 20, display: "grid", gap: 10 },
  sportBadge: { display: "inline-flex", width: "fit-content", borderRadius: 999, padding: "8px 12px", background: "rgba(228,239,22,0.12)", border: "1px solid rgba(228,239,22,0.28)", color: "#e4ef16", fontWeight: 950 },
  previewTitle: { margin: 0, fontSize: 32, letterSpacing: "-0.055em" },
  previewText: { margin: 0, color: "rgba(255,255,255,0.66)" },
  message: { borderRadius: 24, padding: 16, background: "rgba(228,239,22,0.10)", border: "1px solid rgba(228,239,22,0.20)", color: "#e4ef16", fontWeight: 850 },
  formCard: { borderRadius: 30, padding: 20, background: glass, border: "1px solid rgba(255,255,255,0.13)", display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 },
  field: { display: "grid", gap: 7, color: "rgba(255,255,255,0.68)", fontSize: 13, fontWeight: 850 },
  input: { width: "100%", minHeight: 48, borderRadius: 16, border: "1px solid rgba(255,255,255,0.13)", background: "rgba(0,0,0,0.22)", color: "white", padding: "0 12px", boxSizing: "border-box", outline: "none", fontSize: 15 },
  gpxBox: { gridColumn: "1 / -1", padding: 16, borderRadius: 22, background: "rgba(255,255,255,0.055)", border: "1px solid rgba(255,255,255,0.10)", display: "grid", gap: 10, color: "rgba(255,255,255,0.74)", lineHeight: 1.45 },
  fileInput: { width: "100%", color: "rgba(255,255,255,0.72)" },
  nextBox: { gridColumn: "1 / -1", padding: 16, borderRadius: 22, background: "rgba(228,239,22,0.08)", border: "1px solid rgba(228,239,22,0.16)", color: "rgba(255,255,255,0.74)", lineHeight: 1.45 },
  saveButton: { ...baseButton, gridColumn: "1 / -1", minHeight: 52, borderRadius: 999, background: "#e4ef16", color: "#101406", fontSize: 16 },
  deleteButton: { ...baseButton, gridColumn: "1 / -1", minHeight: 48, borderRadius: 999, background: "rgba(120,20,20,0.40)", border: "1px solid rgba(255,80,80,0.24)", color: "white", fontSize: 15 },
};
