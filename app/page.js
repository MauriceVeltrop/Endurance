"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import TeamRequestsPanel from "../components/TeamRequestsPanel";
import EventCard from "../components/EventCard";
import EventFormModal from "../components/EventFormModal";
import { supabase } from "../lib/supabase";
import { getSportLabels } from "../lib/sports";
import { parseGpxFile, calculateRouteStats } from "../lib/gpx";
import {
  actionLinkBtn,
  app,
  authCard,
  authTabs,
  emptyCard,
  errorCard,
  fab,
  field,
  grid,
  header,
  horizontalScroll,
  loginBar,
  loginInfo,
  primaryBtn,
  logoImg,
  roleBadge,
  secondaryBtn,
  eventsSection,
} from "../lib/enduranceStyles";

const EMPTY_EVENT = {
  title: "",
  sports: [],
  distance: 10,
  date: "",
  time: "",
  location: "",
  description: "",
  gpxFile: null,
  gpx_file_path: null,
  gpx_file_url: null,
  route_points: null,
  gpx_uploaded_by: null,
  route_distance_km: null,
  elevation_gain_m: null,
};

const DISTANCE_RANGES = {
  running: { min: 1, max: 50 },
  "trail-running": { min: 1, max: 50 },
  "road-cycling": { min: 10, max: 250 },
  "mountain-biking": { min: 5, max: 120 },
  "gravel-cycling": { min: 10, max: 250 },
  walking: { min: 1, max: 40 },
  swimming: { min: 1, max: 10 },
  kayaking: { min: 1, max: 50 },
};

const ROUTE_SPORTS = [
  "running",
  "trail-running",
  "road-cycling",
  "mountain-biking",
  "gravel-cycling",
  "walking",
  "kayaking",
];

function getDistanceSportIds(sports = []) {
  return sports.filter((sportId) => DISTANCE_RANGES[sportId]);
}

function eventCanHaveRoute(sports = []) {
  return sports.some((sportId) => ROUTE_SPORTS.includes(sportId));
}

function formatDate(value) {
  if (!value) return "";
  const d = new Date(`${value}T00:00:00`);
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatTime(value) {
  if (!value) return "";
  return value.slice(0, 5);
}

function makeEventDateTime(event) {
  const timeValue = event?.time || "23:59";
  return new Date(`${event.date}T${timeValue}`);
}

function routePointsToGpx(points, title = "Endurance Route") {
  const safeTitle = title.replace(/[<>&'"]/g, "");

  const trkpts = points
    .map((p) => {
      const lat = Number(p.lat);
      const lon = Number(p.lon);
      const ele = Number.isFinite(Number(p.ele)) ? Number(p.ele) : 0;

      return `      <trkpt lat="${lat}" lon="${lon}">
        <ele>${ele}</ele>
      </trkpt>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Endurance App" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${safeTitle}</name>
  </metadata>
  <trk>
    <name>${safeTitle}</name>
    <trkseg>
${trkpts}
    </trkseg>
  </trk>
</gpx>`;
}

export default function Home() {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);

  const [events, setEvents] = useState([]);
  const [likes, setLikes] = useState([]);
  const [comments, setComments] = useState([]);
  const [participants, setParticipants] = useState([]);
  const [userSports, setUserSports] = useState([]);

  const [loading, setLoading] = useState(true);
  const [savingEvent, setSavingEvent] = useState(false);

  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(EMPTY_EVENT);

  const [commentText, setCommentText] = useState({});
  const [pageError, setPageError] = useState("");
  const [userSearchOpen, setUserSearchOpen] = useState(false);
  const [userSearchQuery, setUserSearchQuery] = useState("");
  const [userSearchResults, setUserSearchResults] = useState([]);
  const [userSearchLoading, setUserSearchLoading] = useState(false);


  const [authMode, setAuthMode] = useState("signin");
  const [authName, setAuthName] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");

  const isModerator = profile?.role === "moderator";
  const isOrganizer = profile?.role === "organizer";
  const canManageEvents = isModerator || isOrganizer;

  const currentDistanceSportIds = getDistanceSportIds(form.sports);
  const showDistance = currentDistanceSportIds.length > 0;

  const activeDistanceRange =
    DISTANCE_RANGES[currentDistanceSportIds[0]] || { min: 1, max: 50 };

  const showGpxUpload = eventCanHaveRoute(form.sports);

  const routeDistanceLocked =
    !!form.gpxFile ||
    !!form.gpx_file_url ||
    (!!form.route_points && !!form.route_distance_km);

  const eventCards = useMemo(() => {
    const now = new Date();

    if (userSports.length === 0) return [];

    return [...events]
      .filter((event) => {
        const eventSports = Array.isArray(event.sports) ? event.sports : [];
        return eventSports.some((sportId) => userSports.includes(sportId));
      })
      .filter((event) => makeEventDateTime(event) >= now)
      .sort((a, b) => makeEventDateTime(a) - makeEventDateTime(b))
      .map((event) => {
        const eventLikes = likes.filter((l) => l.event_id === event.id);
        const eventComments = comments.filter((c) => c.event_id === event.id);
        const eventParticipants = participants.filter(
          (p) => p.event_id === event.id
        );

        return {
          ...event,
          likes: eventLikes,
          comments: eventComments,
          participants: eventParticipants,
          isOwner: user?.id === event.creator_id,
          likedByMe: !!eventLikes.find((l) => l.user_id === user?.id),
          joinedByMe: !!eventParticipants.find(
            (p) => p.user_id === user?.id
          ),
          canRemoveGpx:
            !!event.gpx_file_url &&
            (isModerator || event.gpx_uploaded_by === user?.id),
        };
      });
  }, [events, likes, comments, participants, user, userSports, isModerator]);

  const removeGpxFromEvent = async (event) => {
    if (!event?.id) return;

    if (!(isModerator || event.gpx_uploaded_by === user?.id)) {
      alert("You are not allowed to remove this GPX file.");
      return;
    }

    if (!confirm("Remove GPX route from this event?")) return;

    const { error } = await supabase
      .from("events")
      .update({
        gpx_file_path: null,
        gpx_file_url: null,
        route_points: null,
        gpx_uploaded_by: null,
        route_distance_km: null,
        elevation_gain_m: null,
      })
      .eq("id", event.id);

    if (error) {
      alert(`Removing GPX failed: ${error.message}`);
      return;
    }

    if (event.gpx_file_path) {
      await supabase.storage.from("event-gpx").remove([event.gpx_file_path]);
    }

    await loadEverything();
  };

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
    if (!user?.id) {
      setProfile(null);
      setEvents([]);
      setLikes([]);
      setComments([]);
      setParticipants([]);
      setUserSports([]);
      return;
    }

    loadProfile();
    loadEverything();
  }, [user?.id]);

  const loadEverything = async () => {
    setPageError("");

    await Promise.all([
      loadEvents(),
      loadLikes(),
      loadComments(),
      loadParticipants(),
      loadUserSports(),
    ]);
  };

  const loadProfile = async () => {
    if (!user?.id) return;

    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("profile load error", error);
      setPageError(error.message);
      return;
    }

    setProfile(data);
  };

  const loadEvents = async () => {
    const { data, error } = await supabase
      .from("events")
      .select(`
        *,
        creator_profile:profiles!events_creator_id_fkey (
          id,
          name,
          email,
          role,
          avatar_url
        )
      `)
      .order("date", { ascending: true })
      .order("time", { ascending: true });

    if (error) {
      console.error("events load error", error);
      setPageError(error.message);
      return;
    }

    setEvents(data || []);
  };

  const loadLikes = async () => {
    const { data, error } = await supabase
      .from("event_likes")
      .select(`
        id,
        event_id,
        user_id,
        created_at,
        user_profile:profiles!event_likes_user_id_fkey (
          id,
          name,
          role,
          avatar_url
        )
      `);

    if (error) {
      console.error("likes load error", error);
      return;
    }

    setLikes(data || []);
  };

  const loadComments = async () => {
    const { data, error } = await supabase
      .from("event_comments")
      .select(`
        id,
        event_id,
        user_id,
        text,
        created_at,
        user_profile:profiles!event_comments_user_id_fkey (
          id,
          name,
          role,
          avatar_url
        )
      `)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("comments load error", error);
      return;
    }

    setComments(data || []);
  };

  const loadParticipants = async () => {
    const { data, error } = await supabase
      .from("event_participants")
      .select(`
        id,
        event_id,
        user_id,
        created_at,
        user_profile:profiles!event_participants_user_id_fkey (
          id,
          name,
          role,
          avatar_url
        )
      `)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("participants load error", error);
      return;
    }

    setParticipants(data || []);
  };

  const loadUserSports = async () => {
    if (!user?.id) return;

    const { data, error } = await supabase
      .from("user_sports")
      .select("sport")
      .eq("user_id", user.id);

    if (error) {
      console.error("user sports load error", error);
      return;
    }

    setUserSports((data || []).map((row) => row.sport));
  };

  const handleSignUp = async (e) => {
    e.preventDefault();

    const { error } = await supabase.auth.signUp({
      email: authEmail,
      password: authPassword,
      options: {
        data: {
          name: authName || authEmail.split("@")[0],
        },
      },
    });

    if (error) {
      alert(`Sign up failed: ${error.message}`);
      return;
    }

    alert("Account created. You can now sign in.");
    setAuthMode("signin");
  };

  const handleSignIn = async (e) => {
    e.preventDefault();

    const { error } = await supabase.auth.signInWithPassword({
      email: authEmail,
      password: authPassword,
    });

    if (error) {
      alert(`Sign in failed: ${error.message}`);
      return;
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  const openNew = () => {
    setEditId(null);
    setForm(EMPTY_EVENT);
    setOpen(true);
  };

  const openEdit = (event) => {
    setEditId(event.id);

    setForm({
      title: event.title || "",
      sports: Array.isArray(event.sports) ? event.sports : [],
      distance: event.distance || 10,
      date: event.date || "",
      time: event.time || "",
      location: event.location || "",
      description: event.description || "",
      gpxFile: null,
      gpx_file_path: event.gpx_file_path || null,
      gpx_file_url: event.gpx_file_url || null,
      route_points: event.route_points || null,
      gpx_uploaded_by: event.gpx_uploaded_by || null,
      route_distance_km: event.route_distance_km || null,
      elevation_gain_m: event.elevation_gain_m || null,
    });

    setOpen(true);
  };

  const closeModal = () => {
    setOpen(false);
    setEditId(null);
    setForm(EMPTY_EVENT);
  };

  const toggleSportInForm = (sportId) => {
    const alreadySelected = form.sports.includes(sportId);

    if (alreadySelected) {
      const nextSports = form.sports.filter((id) => id !== sportId);
      const nextDistanceSports = getDistanceSportIds(nextSports);
      const nextRange =
        DISTANCE_RANGES[nextDistanceSports[0]] || { min: 1, max: 50 };

      setForm({
        ...form,
        sports: nextSports,
        distance: Math.min(Number(form.distance || 0), nextRange.max),
      });

      return;
    }

    const nextSports = [...form.sports, sportId];
    const nextDistanceSports = getDistanceSportIds(nextSports);
    const nextRange =
      DISTANCE_RANGES[nextDistanceSports[0]] || { min: 1, max: 50 };

    setForm({
      ...form,
      sports: nextSports,
      distance:
        Number(form.distance || 0) < nextRange.min
          ? nextRange.min
          : Number(form.distance || 0),
    });
  };

  const saveEvent = async (e) => {
    e.preventDefault();

    if (!form.title || !form.date || !form.time || !form.location) {
      alert("Please fill in all required fields.");
      return;
    }

    if (form.sports.length === 0) {
      alert("Please select at least one sport.");
      return;
    }

    if (!user?.id) {
      alert("You must be signed in.");
      return;
    }

    setSavingEvent(true);

    let gpxFilePath = form.gpx_file_path || null;
    let gpxFileUrl = form.gpx_file_url || null;
    let routePoints = form.route_points || null;
    let gpxUploadedBy = form.gpx_uploaded_by || null;
    let routeDistanceKm = form.route_distance_km || null;
    let elevationGainM = form.elevation_gain_m || null;
    let finalDistance = showDistance ? Number(form.distance) : null;

    if (form.gpxFile) {
      const fileName = form.gpxFile.name.toLowerCase();

      if (!fileName.endsWith(".gpx")) {
        setSavingEvent(false);
        alert("Only .gpx files are allowed.");
        return;
      }

      routePoints = await parseGpxFile(form.gpxFile);

      if (!routePoints.length) {
        setSavingEvent(false);
        alert("No route points found in this GPX file.");
        return;
      }

      const routeStats = calculateRouteStats(routePoints);
      const roundedRouteDistance = Number(routeStats.distanceKm.toFixed(2));

      const safeFileName = form.gpxFile.name.replace(/[^a-zA-Z0-9.-]/g, "_");
      const filePath = `${user.id}/${Date.now()}-${safeFileName}`;

      const { error: uploadError } = await supabase.storage
        .from("event-gpx")
        .upload(filePath, form.gpxFile, {
          cacheControl: "3600",
          upsert: false,
          contentType: "application/gpx+xml",
        });

      if (uploadError) {
        setSavingEvent(false);
        alert(`GPX upload failed: ${uploadError.message}`);
        return;
      }

      const { data: publicData } = supabase.storage
        .from("event-gpx")
        .getPublicUrl(filePath);

      gpxFilePath = filePath;
      gpxFileUrl = publicData.publicUrl;
      gpxUploadedBy = user.id;
      routeDistanceKm = roundedRouteDistance;
      elevationGainM = routeStats.elevationGain;
      finalDistance = roundedRouteDistance;
    } else if (form.route_points && form.route_distance_km) {
      finalDistance = Number(Number(form.route_distance_km).toFixed(2));
      routeDistanceKm = Number(Number(form.route_distance_km).toFixed(2));

      if (!gpxFileUrl && Array.isArray(form.route_points)) {
        const gpxText = routePointsToGpx(
          form.route_points,
          form.title || "Endurance Route"
        );

        const safeTitle = (form.title || "endurance-route")
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)/g, "");

        const filePath = `${user.id}/${Date.now()}-${safeTitle}.gpx`;

        const gpxBlob = new Blob([gpxText], {
          type: "application/gpx+xml",
        });

        const { error: uploadError } = await supabase.storage
          .from("event-gpx")
          .upload(filePath, gpxBlob, {
            cacheControl: "3600",
            upsert: false,
            contentType: "application/gpx+xml",
          });

        if (uploadError) {
          setSavingEvent(false);
          alert(`Generated GPX upload failed: ${uploadError.message}`);
          return;
        }

        const { data: publicData } = supabase.storage
          .from("event-gpx")
          .getPublicUrl(filePath);

        gpxFilePath = filePath;
        gpxFileUrl = publicData.publicUrl;
        gpxUploadedBy = user.id;
      }
    }


const payload = {
      title: form.title,
      sports: form.sports,
      distance: finalDistance,
      date: form.date,
      time: form.time,
      location: form.location,
      description: form.description,
      gpx_file_path: gpxFilePath,
      gpx_file_url: gpxFileUrl,
      route_points: routePoints,
      gpx_uploaded_by: gpxUploadedBy,
      route_distance_km: routeDistanceKm,
      elevation_gain_m: elevationGainM,
    };

    const result = editId
      ? await supabase.from("events").update(payload).eq("id", editId)
      : await supabase.from("events").insert({
          creator_id: user.id,
          ...payload,
        });

    if (result.error) {
      setSavingEvent(false);
      alert(`Saving failed: ${result.error.message}`);
      return;
    }

    await loadEverything();
    setSavingEvent(false);
    closeModal();
  };

  const deleteEvent = async (id) => {
    if (!confirm("Delete this event?")) return;

    const { error } = await supabase.from("events").delete().eq("id", id);

    if (error) {
      alert(`Delete failed: ${error.message}`);
      return;
    }

    await loadEverything();
  };

  const toggleParticipation = async (event) => {
    if (!user?.id) {
      alert("You must be signed in.");
      return;
    }

    if (event.joinedByMe) {
      const { error } = await supabase
        .from("event_participants")
        .delete()
        .eq("event_id", event.id)
        .eq("user_id", user.id);

      if (error) {
        alert(`Leaving event failed: ${error.message}`);
        return;
      }
    } else {
      const { error } = await supabase.from("event_participants").insert({
        event_id: event.id,
        user_id: user.id,
      });

      if (error) {
        alert(`Joining event failed: ${error.message}`);
        return;
      }
    }

    await loadParticipants();
  };

  const toggleLike = async (event) => {
    if (!user?.id) {
      alert("You must be signed in.");
      return;
    }

    if (event.likedByMe) {
      const { error } = await supabase
        .from("event_likes")
        .delete()
        .eq("event_id", event.id)
        .eq("user_id", user.id);

      if (error) {
        alert(`Removing like failed: ${error.message}`);
        return;
      }
    } else {
      const { error } = await supabase.from("event_likes").insert({
        event_id: event.id,
        user_id: user.id,
      });

      if (error) {
        alert(`Liking event failed: ${error.message}`);
        return;
      }
    }

    await loadLikes();
  };

  const postComment = async (eventId) => {
    if (!user?.id) {
      alert("You must be signed in.");
      return;
    }

    const text = (commentText[eventId] || "").trim();

    if (!text) return;

    const { error } = await supabase.from("event_comments").insert({
      event_id: eventId,
      user_id: user.id,
      text,
    });

    if (error) {
      alert(`Posting comment failed: ${error.message}`);
      return;
    }

    setCommentText((prev) => ({ ...prev, [eventId]: "" }));
    await loadComments();
  };

  const deleteComment = async (commentId) => {
    const { error } = await supabase
      .from("event_comments")
      .delete()
      .eq("id", commentId);

    if (error) {
      alert(`Deleting comment failed: ${error.message}`);
      return;
    }

    await loadComments();
  };

  const searchUsers = async (query) => {
    const cleanQuery = String(query || "").trim();
    const safeQuery = cleanQuery.replaceAll(",", " ");

    setUserSearchQuery(query);

    if (cleanQuery.length < 2) {
      setUserSearchResults([]);
      setUserSearchLoading(false);
      return;
    }

    setUserSearchLoading(true);

    const { data, error } = await supabase
      .from("profiles")
      .select("id, name, email, location, avatar_url, role")
      .or(
        `name.ilike.%${safeQuery}%,email.ilike.%${safeQuery}%,location.ilike.%${safeQuery}%`
      )
      .order("name", { ascending: true })
      .limit(12);

    if (error) {
      console.error("User search failed:", error);
      setUserSearchResults([]);
      setUserSearchLoading(false);
      return;
    }

    setUserSearchResults(data || []);
    setUserSearchLoading(false);
  };

  const downloadIcs = (event) => {
    const escapeIcsText = (value = "") =>
      String(value)
        .replaceAll("\\", "\\\\")
        .replaceAll("\n", "\\n")
        .replaceAll(",", "\\,")
        .replaceAll(";", "\\;");

    const safeDate = String(event?.date || "").trim();
    const safeTime = String(event?.time || "09:00").slice(0, 5);

    if (!safeDate) {
      alert("This event has no date.");
      return;
    }

    const start = `${safeDate.replaceAll("-", "")}T${safeTime.replace(":", "")}00`;

    const endDate = new Date(`${safeDate}T${safeTime}:00`);
    endDate.setHours(endDate.getHours() + 1);

    const yyyy = endDate.getFullYear();
    const mm = String(endDate.getMonth() + 1).padStart(2, "0");
    const dd = String(endDate.getDate()).padStart(2, "0");
    const hh = String(endDate.getHours()).padStart(2, "0");
    const mi = String(endDate.getMinutes()).padStart(2, "0");
    const end = `${yyyy}${mm}${dd}T${hh}${mi}00`;

    const sportText = getSportLabels(event.sports || []).join(" • ");
    const description = [
      sportText ? `${sportText} training via Endurance` : "Training via Endurance",
      event.description?.trim() ? event.description.trim() : "",
    ]
      .filter(Boolean)
      .join("\\n\\n");

    const uid = `${event.id || Date.now()}@endurance-app`;
    const fileName = `${
      String(event.title || "endurance-event")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || "endurance-event"
    }.ics`;

    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Endurance//Event Calendar//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "BEGIN:VEVENT",
      `UID:${uid}`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").split(".")[0]}Z`,
      `SUMMARY:${escapeIcsText(event.title || "Endurance Event")}`,
      `DTSTART:${start}`,
      `DTEND:${end}`,
      `LOCATION:${escapeIcsText(event.location || "")}`,
      `DESCRIPTION:${escapeIcsText(description)}`,
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");

    const blob = new Blob([ics], {
      type: "text/calendar;charset=utf-8",
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = fileName;
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const openMaps = (location) => {
    const q = encodeURIComponent(location);
    window.open(
      `https://www.google.com/maps/search/?api=1&query=${q}`,
      "_blank"
    );
  };

  if (loading) {
    return (
      <main style={app}>
        <div style={emptyCard}>Loading...</div>
      </main>
    );
  }

  if (!session) {
    const authHeroStyle = {
      ...authCard,
      position: "relative",
      overflow: "hidden",
      padding: 0,
      borderRadius: 30,
      border: "1px solid rgba(255,255,255,0.10)",
      boxShadow: "0 28px 90px rgba(0,0,0,0.62)",
      background:
        "radial-gradient(circle at 82% 10%, rgba(228,239,22,0.22), transparent 36%), linear-gradient(180deg, rgba(18,18,18,0.98), rgba(5,5,5,0.98))",
    };

    const authPanelStyle = {
      position: "relative",
      zIndex: 2,
      display: "grid",
      gap: 18,
      padding: "26px 24px 24px",
    };

    const authKickerStyle = {
      color: "#e4ef16",
      fontSize: 13,
      fontWeight: 950,
      letterSpacing: "0.12em",
      textTransform: "uppercase",
    };

    const authTitleStyle = {
      margin: 0,
      color: "white",
      fontSize: "clamp(32px, 9vw, 52px)",
      lineHeight: 0.95,
      letterSpacing: "-0.06em",
      fontWeight: 1000,
      maxWidth: 520,
    };

    const authTextStyle = {
      margin: 0,
      color: "rgba(255,255,255,0.72)",
      fontSize: 16,
      lineHeight: 1.45,
      maxWidth: 560,
    };

    const authNoticeStyle = {
      borderRadius: 20,
      padding: "14px 16px",
      background: "rgba(228,239,22,0.10)",
      border: "1px solid rgba(228,239,22,0.22)",
      color: "rgba(255,255,255,0.88)",
      fontSize: 14,
      lineHeight: 1.35,
    };

    const authFormStyle = {
      ...grid,
      gap: 14,
    };

    const professionalFieldStyle = {
      ...field,
      background: "rgba(255,255,255,0.07)",
      border: "1px solid rgba(255,255,255,0.13)",
      borderRadius: 18,
      minHeight: 56,
      fontSize: 16,
    };

    const authPrimaryStyle = {
      ...primaryBtn,
      minHeight: 56,
      borderRadius: 18,
      fontSize: 17,
      fontWeight: 950,
      boxShadow: "0 16px 38px rgba(228,239,22,0.20)",
    };

    const authSecondaryStyle = {
      ...secondaryBtn,
      minHeight: 48,
      borderRadius: 16,
      fontWeight: 850,
    };

    return (
      <main
        style={{
          ...app,
          minHeight: "100svh",
          background:
            "radial-gradient(circle at 70% 0%, rgba(228,239,22,0.12), transparent 30%), #000",
        }}
      >
        <header style={{ ...header, paddingTop: 34, marginBottom: 18 }}>
          <img src="/logo-endurance.png" alt="Endurance" style={logoImg} />
        </header>

        <section style={authHeroStyle}>
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              inset: 0,
              zIndex: 0,
              backgroundImage: "url('/images/runner-bg.png')",
              backgroundSize: "cover",
              backgroundPosition: "right center",
              backgroundRepeat: "no-repeat",
              opacity: 0.38,
              filter: "saturate(1.1) contrast(1.08)",
            }}
          />

          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              inset: 0,
              zIndex: 1,
              background:
                "linear-gradient(90deg, rgba(5,5,5,0.98) 0%, rgba(5,5,5,0.90) 48%, rgba(5,5,5,0.40) 100%)",
            }}
          />

          <div style={authPanelStyle}>
            <div style={authKickerStyle}>Endurance Community</div>

            <h1 style={authTitleStyle}>
              Train together.
              <br />
              Go further.
            </h1>

            <p style={authTextStyle}>
              Sign in to join local endurance events, connect with training partners,
              download routes and add sessions to your calendar.
            </p>

            <div style={authNoticeStyle}>
              <strong>Invite-only access.</strong> New registrations are temporarily
              closed while the platform is being prepared for the first community.
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                style={primaryBtn}
                onClick={() => setAuthMode("signin")}
                type="button"
              >
                Sign In
              </button>

              <button
                style={{ ...secondaryBtn, display: "none" }}
                onClick={() => setAuthMode("signup")}
                type="button"
                aria-hidden="true"
                tabIndex={-1}
              >
                Create Account
              </button>
            </div>

            <form onSubmit={handleSignIn} style={authFormStyle}>
              <input
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                placeholder="Email address"
                type="email"
                autoComplete="email"
                style={professionalFieldStyle}
              />

              <input
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                placeholder="Password"
                type="password"
                autoComplete="current-password"
                style={professionalFieldStyle}
              />

              <button type="submit" style={authPrimaryStyle}>
                Sign In
              </button>
            </form>

            <div
              style={{
                display: "grid",
                gap: 10,
                gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                marginTop: 4,
              }}
            >
              {[
                ["Events", "Join local sessions"],
                ["Routes", "GPX-ready training"],
                ["Team Up", "Find training partners"],
              ].map(([title, body]) => (
                <div
                  key={title}
                  style={{
                    padding: 12,
                    borderRadius: 18,
                    background: "rgba(255,255,255,0.055)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    minWidth: 0,
                  }}
                >
                  <div
                    style={{
                      color: "#e4ef16",
                      fontSize: 13,
                      fontWeight: 950,
                      marginBottom: 4,
                    }}
                  >
                    {title}
                  </div>
                  <div
                    style={{
                      color: "rgba(255,255,255,0.58)",
                      fontSize: 12,
                      lineHeight: 1.25,
                    }}
                  >
                    {body}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main style={app}>
      <header
        style={{
          ...header,
          position: "relative",
          display: "grid",
          gap: 18,
          paddingTop: 28,
          marginBottom: 18,
        }}
      >
        <div
          style={{
            position: "relative",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            minHeight: 92,
          }}
        >
          <img src="/logo-endurance.png" alt="Endurance" style={logoImg} />

          <button
            type="button"
            onClick={() => {
              setUserSearchOpen(true);
              setUserSearchQuery("");
              setUserSearchResults([]);
            }}
            aria-label="Search users"
            title="Search users"
            style={{
              position: "absolute",
              top: 12,
              right: 4,
              width: 46,
              height: 46,
              borderRadius: 16,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background:
                "linear-gradient(145deg, rgba(255,255,255,0.10), rgba(255,255,255,0.035))",
              backdropFilter: "blur(10px)",
              border: "1px solid rgba(228,239,22,0.42)",
              boxShadow:
                "0 0 18px rgba(228,239,22,0.22), 0 14px 34px rgba(0,0,0,0.55)",
              cursor: "pointer",
            }}
          >
            <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="#e4ef16" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="7.5" />
              <line x1="16.5" y1="16.5" x2="21" y2="21" />
            </svg>
          </button>
        </div>

        <section
          style={{
            ...loginBar,
            margin: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 14,
            borderRadius: 26,
            background:
              "linear-gradient(135deg, rgba(255,255,255,0.075), rgba(255,255,255,0.035))",
            border: "1px solid rgba(255,255,255,0.10)",
            boxShadow: "0 20px 55px rgba(0,0,0,0.38)",
          }}
        >
          <div
            style={{
              ...loginInfo,
              display: "flex",
              alignItems: "center",
              gap: 12,
              minWidth: 0,
              flex: "1 1 auto",
            }}
          >
            <Link
              href={`/profile/${user.id}`}
              style={{
                width: 48,
                height: 48,
                borderRadius: "50%",
                overflow: "hidden",
                display: "grid",
                placeItems: "center",
                textDecoration: "none",
                background:
                  "linear-gradient(135deg, rgba(228,239,22,0.95), rgba(255,255,255,0.20))",
                color: "#050505",
                fontWeight: 1000,
                flex: "0 0 auto",
                border: "2px solid rgba(228,239,22,0.80)",
              }}
            >
              {profile?.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt={profile?.name || "Profile"}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              ) : (
                String(profile?.name || user?.email || "?")
                  .replace(/@.*/, "")
                  .slice(0, 2)
                  .toUpperCase()
              )}
            </Link>

            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  color: "rgba(255,255,255,0.58)",
                  fontSize: 12,
                  fontWeight: 750,
                  letterSpacing: "0.03em",
                  textTransform: "uppercase",
                  marginBottom: 3,
                }}
              >
                Signed in
              </div>

              <div
                style={{
                  color: "white",
                  fontSize: 18,
                  fontWeight: 950,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  maxWidth: 230,
                }}
              >
                {profile?.name || user?.email}
              </div>
            </div>

            <div style={{ ...roleBadge, flex: "0 0 auto" }}>
              {profile?.role || "user"}
            </div>
          </div>

          <div
            style={{
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              justifyContent: "flex-end",
              flex: "0 0 auto",
            }}
          >
            <Link href={`/profile/${user.id}`} style={actionLinkBtn}>
              Profile
            </Link>

            {isModerator && (
              <Link href="/admin" style={actionLinkBtn}>
                Admin
              </Link>
            )}

            <button onClick={handleSignOut} style={secondaryBtn}>
              Sign Out
            </button>
          </div>
        </section>
      </header>

      {user?.id && <TeamRequestsPanel userId={user.id} />}
      {userSearchOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 2000,
            background: "rgba(0,0,0,0.74)",
            backdropFilter: "blur(12px)",
            padding: 18,
            display: "grid",
            alignItems: "start",
            justifyItems: "center",
            overflowY: "auto",
          }}
          onClick={() => setUserSearchOpen(false)}
        >
          <div
            style={{
              width: "min(720px, 100%)",
              marginTop: 22,
              borderRadius: 30,
              background:
                "radial-gradient(circle at 84% 0%, rgba(228,239,22,0.16), transparent 34%), linear-gradient(180deg, rgba(24,24,24,0.98), rgba(6,6,6,0.98))",
              border: "1px solid rgba(255,255,255,0.12)",
              boxShadow: "0 30px 95px rgba(0,0,0,0.70)",
              overflow: "hidden",
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div
              style={{
                padding: 18,
                display: "flex",
                gap: 10,
                alignItems: "center",
                borderBottom: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <div
                style={{
                  width: 46,
                  height: 46,
                  borderRadius: 16,
                  display: "grid",
                  placeItems: "center",
                  background: "rgba(228,239,22,0.14)",
                  border: "1px solid rgba(228,239,22,0.24)",
                  flex: "0 0 auto",
                }}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#e4ef16" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="7.5" />
                  <line x1="16.5" y1="16.5" x2="21" y2="21" />
                </svg>
              </div>

              <input
                value={userSearchQuery}
                onChange={(event) => searchUsers(event.target.value)}
                placeholder="Search users by name, email or city..."
                autoFocus
                style={{
                  ...field,
                  flex: "1 1 auto",
                  minWidth: 0,
                  margin: 0,
                  background: "rgba(255,255,255,0.075)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: 18,
                  minHeight: 52,
                }}
              />

              <button
                type="button"
                onClick={() => setUserSearchOpen(false)}
                style={{
                  ...secondaryBtn,
                  width: 46,
                  height: 46,
                  padding: 0,
                  borderRadius: 16,
                  flex: "0 0 auto",
                  fontSize: 18,
                }}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: 18 }}>
              {userSearchQuery.trim().length < 2 ? (
                <div style={{ color: "rgba(255,255,255,0.58)", fontSize: 15, lineHeight: 1.45, padding: "12px 4px" }}>
                  Type at least 2 characters to search for users.
                </div>
              ) : userSearchLoading ? (
                <div style={{ color: "rgba(255,255,255,0.72)", fontSize: 15, padding: "12px 4px" }}>
                  Searching...
                </div>
              ) : userSearchResults.length === 0 ? (
                <div style={{ color: "rgba(255,255,255,0.58)", fontSize: 15, padding: "12px 4px" }}>
                  No users found.
                </div>
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  {userSearchResults.map((foundUser) => (
                    <Link
                      key={foundUser.id}
                      href={`/profile/${foundUser.id}`}
                      onClick={() => setUserSearchOpen(false)}
                      style={{
                        display: "flex",
                        gap: 12,
                        alignItems: "center",
                        padding: 12,
                        borderRadius: 20,
                        background: "rgba(255,255,255,0.055)",
                        border: "1px solid rgba(255,255,255,0.08)",
                        textDecoration: "none",
                        color: "white",
                      }}
                    >
                      <div
                        style={{
                          width: 52,
                          height: 52,
                          borderRadius: "50%",
                          overflow: "hidden",
                          display: "grid",
                          placeItems: "center",
                          background:
                            "linear-gradient(135deg, rgba(228,239,22,0.95), rgba(255,255,255,0.15))",
                          color: "#050505",
                          fontWeight: 1000,
                          flex: "0 0 auto",
                          border: "2px solid rgba(228,239,22,0.65)",
                        }}
                      >
                        {foundUser.avatar_url ? (
                          <img src={foundUser.avatar_url} alt={foundUser.name || "user"} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        ) : (
                          String(foundUser.name || foundUser.email || "?")
                            .replace(/@.*/, "")
                            .slice(0, 2)
                            .toUpperCase()
                        )}
                      </div>

                      <div style={{ minWidth: 0, flex: "1 1 auto" }}>
                        <div style={{ fontWeight: 950, fontSize: 16, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {foundUser.name || foundUser.email || "Unknown user"}
                        </div>

                        <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 13, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {[foundUser.location, foundUser.role].filter(Boolean).join(" • ")}
                        </div>
                      </div>

                      <div style={{ color: "#e4ef16", fontWeight: 950, fontSize: 20 }}>
                        ↗
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}


      {pageError ? (
        <div style={errorCard}>
          Could not load part of the app: {pageError}
        </div>
      ) : null}

      {open && (
        <EventFormModal
          editId={editId}
          form={form}
          setForm={setForm}
          saveEvent={saveEvent}
          closeModal={closeModal}
          savingEvent={savingEvent}
          showDistance={showDistance}
          activeDistanceRange={activeDistanceRange}
          showGpxUpload={showGpxUpload}
          toggleSportInForm={toggleSportInForm}
          distanceLocked={routeDistanceLocked}
          distanceLockText={
            routeDistanceLocked
              ? "Distance is calculated from the route."
              : ""
          }
          userRole={profile?.role || "user"}
        />
      )}

      <section style={eventsSection}>
        {eventCards.length === 0 ? (
          <div style={emptyCard}>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
              No upcoming events
            </div>
            <div style={{ opacity: 0.7 }}>
              {userSports.length === 0
                ? "Select your preferred sports in your profile to see matching events."
                : "No upcoming events match your preferred sports yet."}
            </div>
          </div>
        ) : (
          <div style={horizontalScroll}>
            {eventCards.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                user={user}
                profile={profile}
                isModerator={isModerator}
                formatDate={formatDate}
                formatTime={formatTime}
                openMaps={openMaps}
                removeGpxFromEvent={removeGpxFromEvent}
                toggleLike={toggleLike}
                commentText={commentText}
                setCommentText={setCommentText}
                postComment={postComment}
                deleteComment={deleteComment}
                toggleParticipation={toggleParticipation}
                downloadIcs={downloadIcs}
                openEdit={openEdit}
                deleteEvent={deleteEvent}
              />
            ))}
          </div>
        )}
      </section>

      {canManageEvents && (
        <button onClick={openNew} style={fab}>
          +
        </button>
      )}
    </main>
  );
            }



    



