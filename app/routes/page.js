// app/routes/page.js
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "../../components/AppHeader";
import BottomNav from "../../components/BottomNav";
import RouteCard from "../../components/routes/RouteCard";
import { supabase } from "../../lib/supabase";
import { getSportLabel } from "../../lib/trainingHelpers";

function matchesSearch(route, search) {
  if (!search) return true;

  const haystack = [
    route.title,
    route.description,
    route.visibility,
    route.sport_id,
    getSportLabel(route.sport_id),
    route.distance_km,
    route.elevation_gain_m,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(search.toLowerCase());
}

function matchesTab(route, activeTab) {
  if (activeTab === "all") return true;
  if (activeTab === "my") return route._isOwnRoute;
  if (activeTab === "public") return route.visibility === "public";
  if (activeTab === "trail") return String(route.sport_id || "").includes("trail");
  return route.sport_id === activeTab;
}

export default function RoutesPage() {
  const router = useRouter();

  const [profile, setProfile] = useState(null);
  const [routes, setRoutes] = useState([]);
  const [preferredSportIds, setPreferredSportIds] = useState([]);
  const [activeTab, setActiveTab] = useState("all");
  const [search, setSearch] = useState("");
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  async function loadRoutes() {
    setLoading(true);
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

      if (profileRow?.blocked) {
        setProfile(profileRow);
        setRoutes([]);
        setMessage("Your account is blocked. Contact an administrator.");
        return;
      }

      setProfile(profileRow);

      const { data: sportRows, error: sportError } = await supabase
        .from("user_sports")
        .select("sport_id")
        .eq("user_id", user.id);

      if (sportError) throw sportError;

      const allowedSports = (sportRows || []).map((row) => row.sport_id).filter(Boolean);
      setPreferredSportIds(allowedSports);

      const { data, error } = await supabase
        .from("routes")
        .select("id,creator_id,sport_id,title,description,visibility,distance_km,elevation_gain_m,gpx_file_url,route_points,created_at,updated_at")
        .or(`visibility.eq.public,creator_id.eq.${user.id}`)
        .order("updated_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(80);

      if (error) throw error;

      const visibleRoutes =
        profileRow?.role === "admin" || profileRow?.role === "moderator"
          ? data || []
          : (data || []).filter((route) => allowedSports.includes(route.sport_id) || route.creator_id === user.id);

      setRoutes(
        visibleRoutes.map((route) => ({
          ...route,
          _isOwnRoute: route.creator_id === user.id,
        }))
      );

      const [{ count: notificationCount }, { count: inviteCount }] = await Promise.all([
        supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", user.id).is("read_at", null),
        supabase.from("training_invites").select("id", { count: "exact", head: true }).eq("invitee_id", user.id).eq("status", "pending"),
      ]);
      setUnreadCount((notificationCount || 0) + (inviteCount || 0));
    } catch (err) {
      console.error("Routes load error", err);
      setMessage(err?.message || "Could not load routes.");
      setRoutes([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRoutes();
  }, []);

  const mappedCount = routes.filter((route) => route.gpx_file_url || route.route_points).length;
  const ownRouteCount = routes.filter((route) => route._isOwnRoute).length;
  const trailRouteCount = routes.filter((route) => String(route.sport_id || "").includes("trail")).length;

  const tabs = useMemo(() => {
    const sportTabs = preferredSportIds.slice(0, 2).map((sportId) => ({
      id: sportId,
      label: getSportLabel(sportId),
    }));

    return [
      { id: "all", label: "All routes" },
      { id: "my", label: "My routes" },
      { id: "public", label: "Public" },
      { id: "trail", label: "Trail Running" },
      ...sportTabs,
    ];
  }, [preferredSportIds]);

  const filteredRoutes = routes
    .filter((route) => matchesSearch(route, search))
    .filter((route) => matchesTab(route, activeTab));

  return (
    <main className="endurance-page route-feed-page">
      <AppHeader active="routes" />

      <section className="endurance-shell training-hero endurance-card route-feed-hero">
        <div>
          <p className="eyebrow">Route feed</p>
          <h1>
            Find your next
            <br />
            route<span>.</span>
          </h1>
          <p>
            Browse saved routes on real map previews, filtered by your preferred sports and ready to become training sessions.
          </p>
        </div>
        <Link href="/routes/new" className="hero-create-button">
          + Create route
        </Link>
      </section>

      <section className="endurance-shell metric-grid route-feed-metrics">
        <div className="metric-card highlight">
          <span>◇</span>
          <strong>{loading ? "…" : routes.length}</strong>
          <div>
            <b>Routes</b>
            <p>Available for your sports.</p>
          </div>
        </div>

        <div className="metric-card">
          <span>🧭</span>
          <strong>{loading ? "…" : mappedCount}</strong>
          <div>
            <b>Mapped</b>
            <p>GPX or route points.</p>
          </div>
        </div>

        <div className="metric-card">
          <span>👤</span>
          <strong>{loading ? "…" : ownRouteCount}</strong>
          <div>
            <b>Your routes</b>
            <p>Created by you.</p>
          </div>
        </div>

        <div className="metric-card">
          <span>⛰</span>
          <strong>{loading ? "…" : trailRouteCount}</strong>
          <div>
            <b>Trail</b>
            <p>Off-road focused.</p>
          </div>
        </div>
      </section>

      <section className="endurance-shell feed-filter-card endurance-card route-filter-card">
        <p className="eyebrow">Smart route feed</p>
        <h2>Your route library</h2>

        <label className="feed-search">
          <span>⌕</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search route, place or sport..."
          />
        </label>

        <div className="training-tabs route-tabs">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={activeTab === tab.id ? "active" : ""}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
          <button type="button" className="route-filter-icon" aria-label="Filters">
            ⟡
          </button>
        </div>
      </section>

      <section className="endurance-shell training-feed-stack route-feed-stack">
        {loading && <div className="endurance-card notification-empty">Loading routes...</div>}

        {!loading && message ? (
          <div className="endurance-card notification-empty">
            <h2>Could not load routes</h2>
            <p>{message}</p>
            <button type="button" className="primary-action" onClick={loadRoutes}>
              Try again
            </button>
          </div>
        ) : null}

        {!loading &&
          !message &&
          filteredRoutes.map((route) => <RouteCard key={route.id} route={route} />)}

        {!loading && !message && !filteredRoutes.length ? (
          <div className="endurance-card notification-empty">
            <h2>No routes found</h2>
            <p>Create a route or change your filters.</p>
            <Link href="/routes/new" className="primary-action">
              Create route
            </Link>
          </div>
        ) : null}
      </section>

      <BottomNav unreadCount={unreadCount} />
    </main>
  );
}
