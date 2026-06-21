// app/routes/page.js
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "../../components/AppHeader";
import BottomNav from "../../components/BottomNav";
import RouteCard from "../../components/routes/RouteCard";
import { supabase } from "../../lib/supabase";
import { hydrateRouteWithGeometry } from "../../lib/routeData";
import { getSportLabel } from "../../lib/trainingHelpers";


async function getAcceptedTeamPartnerIds(userId) {
  if (!userId) return [];

  const { data, error } = await supabase
    .from("training_partners")
    .select("requester_id,addressee_id,status")
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
    .eq("status", "accepted");

  if (error || !Array.isArray(data)) {
    console.warn("Could not load accepted team partners", error);
    return [];
  }

  return Array.from(
    new Set(
      data
        .map((row) => (row.requester_id === userId ? row.addressee_id : row.requester_id))
        .filter(Boolean)
    )
  );
}

function canViewTeamItem(item, userId, teamPartnerIds = [], profile = null) {
  if (!item || !userId) return false;

  if (item.creator_id === userId) return true;
  if (item.visibility === "public") return true;
  if (profile?.role === "admin" || profile?.role === "moderator") return true;

  if (item.visibility === "team") {
    return teamPartnerIds.includes(item.creator_id);
  }

  return false;
}

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

const RUN_WALK_ROUTE_SPORTS = new Set(["running", "trail_running", "walking"]);
const CYCLING_ROUTE_SPORTS = new Set(["road_cycling", "gravel_cycling", "mountain_biking"]);

function matchesTab(route, activeTab) {
  const sportId = String(route.sport_id || "");

  if (activeTab === "all") return true;
  if (activeTab === "my") return route._isOwnRoute;
  if (activeTab === "run_walk") return RUN_WALK_ROUTE_SPORTS.has(sportId);
  if (activeTab === "cycling") return CYCLING_ROUTE_SPORTS.has(sportId);

  return true;
}

function firstNameFromProfile(profile) {
  return profile?.first_name || String(profile?.name || "").split(" ")[0] || "Maurice";
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
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
        .select("id,name,first_name,last_name,email,avatar_url,role,onboarding_completed,blocked")
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

      const teamPartnerIds = await getAcceptedTeamPartnerIds(user.id);
      const teamCreatorFilter = teamPartnerIds.length
        ? `,and(visibility.eq.team,creator_id.in.(${teamPartnerIds.join(",")}))`
        : "";

      const { data, error } = await supabase
        .from("routes")
        .select("id,creator_id,sport_id,title,description,visibility,distance_km,elevation_gain_m,gpx_file_url,route_points,source_type,geometry_id,route_version,created_at,updated_at,route_geometries!route_geometries_route_id_fkey(id,version,source_type,geometry,point_count,distance_km,elevation_gain_m,elevation_loss_m,metadata,updated_at),creator:profiles!routes_creator_id_fkey(id,name,first_name,last_name,avatar_url)")
        .or(`visibility.eq.public,creator_id.eq.${user.id}${teamCreatorFilter}`)
        .order("updated_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(120);

      if (error) throw error;

      const visibleRoutes = (data || []).filter((route) => {
        if (!canViewTeamItem(route, user.id, teamPartnerIds, profileRow)) return false;

        // Preferred sports should not hide accessible team/eigen routes completely.
        // Sport filtering remains available through the UI.
        return true;
      });

      setRoutes(
        visibleRoutes.map((route) => ({
          ...route,
          _isOwnRoute: route.creator_id === user.id,
          _isTeamRoute: route.visibility === "team" && teamPartnerIds.includes(route.creator_id),
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

  const tabs = useMemo(
    () => [
      { id: "all", label: "All routes" },
      { id: "my", label: "My routes" },
      { id: "run_walk", label: "Run & Walk" },
      { id: "cycling", label: "Cycling" },
    ],
    []
  );

  const filteredRoutes = routes
    .filter((route) => matchesSearch(route, search))
    .filter((route) => matchesTab(route, activeTab));

  return (
    <main className="endurance-page route-feed-page training-feed-multisport-hero route-feed-multisport-layout">
      <section className="training-feed-hero-shell route-hero-shell">
        <AppHeader active="routes" />

        <section className="endurance-shell training-dashboard route-dashboard">
          <div className="training-dashboard-top">
            <div>
              <p className="training-greeting">{getGreeting()}, {firstNameFromProfile(profile)}</p>
              <p className="training-subline">
                <strong>{filteredRoutes.length}</strong> route{filteredRoutes.length === 1 ? "" : "s"} ready for your sports
              </p>
            </div>

            <Link href="/routes/new" className="training-create-compact">
              + Create route
            </Link>
          </div>
        </section>
      </section>

      <section className="endurance-shell smart-search-row premium-feed-controls route-feed-controls">
        <label className="feed-search">
          <span>⌕</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search route, place or sport..."
          />
        </label>

        <div className="premium-tabs-row route-tabs-row">
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
          </div>
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
