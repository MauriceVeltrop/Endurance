// app/trainings/page.js
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import AppHeader from "../../components/AppHeader";
import BottomNav from "../../components/BottomNav";
import TrainingCard from "../../components/trainings/TrainingCard";
import TrainingFilters from "../../components/trainings/TrainingFilters";
import FlexibleSessionCard from "../../components/trainings/FlexibleSessionCard";
import { getSportLabel } from "../../lib/trainingHelpers";
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function getTrainingReferenceTime(training) {
  if (training.final_starts_at) return new Date(training.final_starts_at).getTime();
  if (training.starts_at) return new Date(training.starts_at).getTime();

  if (training.planning_type === "flexible" && training.flexible_date) {
    const time = training.flexible_end_time || training.flexible_start_time || "23:59:59";
    return new Date(`${training.flexible_date}T${time}`).getTime();
  }

  return null;
}

function isNotOlderThanOneDay(training, nowMs = Date.now()) {
  const referenceTime = getTrainingReferenceTime(training);
  if (!referenceTime || Number.isNaN(referenceTime)) return true;
  return referenceTime >= nowMs - ONE_DAY_MS;
}

function matchesSearch(training, search) {
  if (!search) return true;
  const haystack = [
    training.title,
    training.description,
    training.start_location,
    Array.isArray(training.sports) ? training.sports.join(" ") : training.sports,
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(search.toLowerCase());
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




function FilterChip({ active, disabled = false, children, onClick }) {
  return (
    <button
      type="button"
      className={active ? "active" : ""}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export default function TrainingsPage() {
  const router = useRouter();
  const [trainings, setTrainings] = useState([]);
  const [participantsBySession, setParticipantsBySession] = useState({});
  const [ownershipFilter, setOwnershipFilter] = useState("all");
  const [sportFilter, setSportFilter] = useState("all");
  const [planningFilter, setPlanningFilter] = useState("upcoming");
  const [search, setSearch] = useState("");
  const [unreadCount, setUnreadCount] = useState(0);
  const [profile, setProfile] = useState(null);
  const [preferredSports, setPreferredSports] = useState([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);

    const { data: authData } = await supabase.auth.getUser();
    const user = authData?.user;

    if (!user?.id) {
      setLoading(false);
      router.replace("/login");
      return;
    }

    const { data: profileRow, error: profileError } = await supabase
      .from("profiles")
      .select("id,name,first_name,last_name,onboarding_completed,blocked")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      console.error("Profile check failed", profileError);
    }

    setProfile(profileRow || null);

    if (profileRow?.blocked) {
      await supabase.auth.signOut();
      setLoading(false);
      router.replace("/login?blocked=1");
      return;
    }

    if (!profileRow?.onboarding_completed) {
      setLoading(false);
      router.replace("/onboarding");
      return;
    }

    const { data: preferredRows } = await supabase
      .from("user_sports")
      .select("sport_id")
      .eq("user_id", user.id);

    const preferredIds = (preferredRows || [])
      .map((row) => row.sport_id)
      .filter(Boolean);

    setPreferredSports(preferredIds);

    const { data: sessions } = await supabase
      .from("training_sessions")
      .select("*")
      .order("starts_at", { ascending: true, nullsFirst: false })
      .limit(80);

    const preferredSet = new Set(preferredIds);
    const sessionRows = (sessions || [])
      .filter((session) => isNotOlderThanOneDay(session))
      .filter((session) => {
        if (!preferredSet.size) return true;
        const sessionSports = Array.isArray(session.sports) ? session.sports : [session.sports].filter(Boolean);
        return sessionSports.some((sportId) => preferredSet.has(sportId));
      });

    setTrainings(sessionRows);

    const ids = sessionRows.map((session) => session.id);
    if (ids.length) {
      const { data: participants } = await supabase
        .from("session_participants")
        .select("id,session_id,user_id,profiles(id,name,first_name,last_name,avatar_url)")
        .in("session_id", ids);

      const grouped = {};
      (participants || []).forEach((participant) => {
        grouped[participant.session_id] ||= [];
        grouped[participant.session_id].push(participant);
      });
      setParticipantsBySession(grouped);
    }

    if (user) {
      const [{ count: notificationCount }, { count: inviteCount }] = await Promise.all([
        supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", user.id).is("read_at", null),
        supabase.from("training_invites").select("id", { count: "exact", head: true }).eq("invitee_id", user.id).eq("status", "pending"),
      ]);
      setUnreadCount((notificationCount || 0) + (inviteCount || 0));
    }

    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const now = Date.now();

  const currentUserId = profile?.id;

  const filtered = trainings
    .filter((training) => matchesSearch(training, search))
    .filter((training) => {
      if (ownershipFilter === "my") return training.creator_id === currentUserId;
      if (ownershipFilter === "team") return training.visibility === "team" || training.visibility === "selected";
      if (ownershipFilter === "groups") return Boolean(training.group_id);
      return true;
    })
    .filter((training) => {
      if (sportFilter === "all") return true;
      const sessionSports = Array.isArray(training.sports) ? training.sports : [training.sports].filter(Boolean);
      return sessionSports.includes(sportFilter);
    })
    .filter((training) => {
      if (planningFilter === "flexible") return training.planning_type === "flexible";
      if (planningFilter === "upcoming") return training.planning_type !== "flexible" || Boolean(training.final_starts_at);
      return true;
    });

  const needsDecision = trainings.find((training) => training.planning_type === "flexible" && !training.final_starts_at);
  const startingSoon = trainings.filter((training) => {
    const value = training.final_starts_at || training.starts_at;
    if (!value) return false;
    const time = new Date(value).getTime();
    return time >= now && time <= now + 72 * 60 * 60 * 1000;
  }).length;

  const prepared = trainings.filter((training) => training.route_id || training.workout_id).length;
  const teamSessions = trainings.filter((training) => training.visibility === "team" || training.visibility === "selected").length;

  const matchingSessions = filtered.length;

  return (
    <main className="endurance-page training-feed-redesign training-feed-compact-final training-feed-premium-home training-feed-multisport-hero">
      <section className="training-feed-hero-shell">
        <AppHeader active="trainings" />

        <section className="endurance-shell training-dashboard">
        <div className="training-dashboard-top">
          <div>
            <p className="training-greeting">{getGreeting()}, {firstNameFromProfile(profile)}</p>
            <p className="training-subline">
              <strong>{matchingSessions}</strong> matching session{matchingSessions === 1 ? "" : "s"} near you
            </p>
          </div>

          <Link href="/trainings/new" className="training-create-compact">
            + Create training
          </Link>
        </div>
        </section>
      </section>

      <section className="endurance-shell smart-search-row premium-feed-controls training-filter-system">
        <TrainingFilters value={search} onChange={setSearch} />

        <div className="training-filter-group" aria-label="Training ownership filters">
          <FilterChip active={ownershipFilter === "all"} onClick={() => setOwnershipFilter("all")}>
            All
          </FilterChip>
          <FilterChip active={ownershipFilter === "my"} onClick={() => setOwnershipFilter("my")}>
            My
          </FilterChip>
          <FilterChip active={ownershipFilter === "team"} onClick={() => setOwnershipFilter("team")}>
            Team
          </FilterChip>
          <FilterChip active={ownershipFilter === "groups"} onClick={() => setOwnershipFilter("groups")}>
            Groups
          </FilterChip>
        </div>

        <div className="training-filter-group sport-filter-group" aria-label="Preferred sport filters">
          <FilterChip active={sportFilter === "all"} onClick={() => setSportFilter("all")}>
            All Sports
          </FilterChip>
          {preferredSports.map((sportId) => (
            <FilterChip
              key={sportId}
              active={sportFilter === sportId}
              onClick={() => setSportFilter(sportId)}
            >
              {getSportLabel(sportId)}
            </FilterChip>
          ))}
        </div>

        <div className="training-filter-group compact-filter-group" aria-label="Planning filters">
          <FilterChip active={planningFilter === "upcoming"} onClick={() => setPlanningFilter("upcoming")}>
            Upcoming
          </FilterChip>
          <FilterChip active={planningFilter === "flexible"} onClick={() => setPlanningFilter("flexible")}>
            Flexible
          </FilterChip>
        </div>
      </section>

      <section className="endurance-shell training-feed-stack visual-feed-stack">
        {loading && <div className="endurance-card notification-empty">Loading training feed...</div>}

        {!loading && needsDecision && planningFilter !== "flexible" && (
          <FlexibleSessionCard
            training={needsDecision}
            participants={participantsBySession[needsDecision.id] || []}
          />
        )}

        {!loading &&
          filtered.map((training) => (
            <TrainingCard
              key={training.id}
              training={training}
              participants={participantsBySession[training.id] || []}
            />
          ))}

        {!loading && !filtered.length && (
          <div className="endurance-card notification-empty redesigned-empty-state">
            <h2>No sessions found</h2>
            <p>Create the first session for your preferred sports or adjust the filters.</p>
            <Link href="/trainings/new" className="primary-action">Create training</Link>
          </div>
        )}
      </section>

      <BottomNav unreadCount={unreadCount} />
    </main>
  );
}

