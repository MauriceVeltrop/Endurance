"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AppHeader from "../../../components/AppHeader";
import BottomNav from "../../../components/BottomNav";
import { supabase } from "../../../lib/supabase";

function formatDate(value) {
  if (!value) return "";
  try {
    return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
  } catch {
    return "";
  }
}

function formatDuration(seconds) {
  if (!seconds) return "—";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function formatLoad(value) {
  const number = Number(value || 0);
  if (!number) return "—";
  return number >= 1000 ? `${Math.round(number / 100) / 10}k kg` : `${Math.round(number)} kg`;
}

function setSignature(set) {
  const reps = set?.reps || "?";
  const weight = set?.weight_kg === null || set?.weight_kg === undefined || set?.weight_kg === "" ? "open" : `${set.weight_kg}kg`;
  return `${reps} @ ${weight}`;
}

function compactSetSummary(sets = []) {
  if (!sets.length) return "No completed sets";
  const groups = [];
  sets.forEach((set) => {
    const signature = setSignature(set);
    const last = groups[groups.length - 1];
    if (last?.signature === signature) last.count += 1;
    else groups.push({ signature, count: 1 });
  });
  return groups.map((group) => `${group.count}x ${group.signature}`).join("   ");
}

function groupSetsByExercise(sets = []) {
  const map = new Map();
  sets.filter((set) => set.completed).forEach((set) => {
    const key = `${set.exercise_position}-${set.exercise_name}`;
    if (!map.has(key)) map.set(key, { name: set.exercise_name, equipment: set.equipment, sets: [] });
    map.get(key).sets.push(set);
  });
  return Array.from(map.values());
}

export default function WorkoutHistoryPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [profile, setProfile] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [setsBySession, setSetsBySession] = useState({});
  const [prs, setPrs] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    loadHistory();
  }, []);

  async function loadHistory() {
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
        .select("id,name,first_name,last_name,email,avatar_url,role,onboarding_completed,blocked")
        .eq("id", user.id)
        .maybeSingle();
      if (profileError) throw profileError;
      if (!profileRow?.onboarding_completed) {
        router.replace("/onboarding");
        return;
      }
      setProfile(profileRow);

      const [{ data: sessionRows, error: sessionError }, { data: prRows }, { count: notificationCount }, { count: inviteCount }] = await Promise.all([
        supabase
          .from("workout_sessions")
          .select("id,workout_id,user_id,started_at,completed_at,duration_seconds,summary,created_at,workouts(id,title,sport_id)")
          .eq("user_id", user.id)
          .order("completed_at", { ascending: false, nullsFirst: false })
          .limit(30),
        supabase
          .from("exercise_prs")
          .select("id,exercise_name,equipment,best_weight_kg,best_reps,best_volume,achieved_at")
          .eq("user_id", user.id)
          .order("updated_at", { ascending: false })
          .limit(8),
        supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", user.id).is("read_at", null),
        supabase.from("training_invites").select("id", { count: "exact", head: true }).eq("invitee_id", user.id).eq("status", "pending"),
      ]);
      if (sessionError) throw sessionError;

      const ids = (sessionRows || []).map((session) => session.id);
      let grouped = {};
      if (ids.length) {
        const { data: setRows, error: setsError } = await supabase
          .from("workout_session_sets")
          .select("id,session_id,exercise_position,set_number,exercise_name,equipment,reps,weight_kg,completed,is_pr")
          .in("session_id", ids)
          .order("exercise_position")
          .order("set_number");
        if (setsError) throw setsError;
        grouped = (setRows || []).reduce((acc, set) => {
          acc[set.session_id] = acc[set.session_id] || [];
          acc[set.session_id].push(set);
          return acc;
        }, {});
      }

      setSessions(sessionRows || []);
      setSetsBySession(grouped);
      setPrs(prRows || []);
      setUnreadCount((notificationCount || 0) + (inviteCount || 0));
    } catch (error) {
      console.error("Workout history error", error);
      setMessage(error?.message || "Could not load workout history. Did you run the workout history SQL migration?");
    } finally {
      setLoading(false);
    }
  }

  const completedMessage = useMemo(() => {
    const prs = Number(searchParams?.get("prs") || 0);
    if (!searchParams?.get("completed")) return "";
    return prs > 0 ? `Workout saved. ${prs} new PR${prs === 1 ? "" : "s"}.` : "Workout saved.";
  }, [searchParams]);

  return (
    <main className="endurance-page workout-history-page">
      <AppHeader active="workouts" />
      <section className="endurance-shell workout-premium-hero endurance-card">
        <div className="workout-premium-hero-main">
          <div className="workout-premium-kicker"><span>Progress</span><span>Strength</span></div>
          <h1>Workout History</h1>
          <p className="workout-premium-description">Track completed workouts, total volume and exercise progress.</p>
        </div>
        <div className="workout-premium-stat-grid">
          <div><span>Sessions</span><strong>{sessions.length}</strong></div>
          <div><span>PRs</span><strong>{prs.length}</strong></div>
          <div><span>Last</span><strong>{sessions[0] ? formatDate(sessions[0].completed_at || sessions[0].created_at).split(",")[0] : "—"}</strong></div>
          <div><span>Volume</span><strong>{formatLoad(sessions.reduce((sum, session) => sum + Number(session?.summary?.total_volume_kg || 0), 0))}</strong></div>
        </div>
      </section>

      {completedMessage || message ? <section className="endurance-shell route-detail-message">{completedMessage || message}</section> : null}

      <section className="endurance-shell workout-premium-secondary-grid">
        <article className="endurance-card workout-compact-card">
          <div className="workout-plan-header mini"><div><p className="eyebrow">Personal records</p><h2>Best lifts</h2></div></div>
          {prs.length ? (
            <div className="workout-pr-list">
              {prs.map((pr) => (
                <Link href={`/workouts/exercises/${encodeURIComponent(pr.exercise_name)}`} key={pr.id} className="workout-pr-row">
                  <span><strong>{pr.exercise_name}</strong><small>{pr.equipment || "Strength"}</small></span>
                  <b>{pr.best_reps || "?"} @ {pr.best_weight_kg || "?"}kg</b>
                </Link>
              ))}
            </div>
          ) : <p className="route-detail-muted">Complete a workout to start collecting PRs.</p>}
        </article>
      </section>

      <section className="endurance-shell workout-plan-card endurance-card">
        <div className="workout-plan-header"><div><p className="eyebrow">Completed sessions</p><h2>Recent workouts</h2></div><span>{sessions.length}</span></div>
        {loading ? <p className="route-detail-muted">Loading history...</p> : null}
        {!loading && !sessions.length ? <p className="route-detail-muted">No completed workouts yet.</p> : null}
        <div className="workout-history-list">
          {sessions.map((session) => {
            const setRows = setsBySession[session.id] || [];
            const exerciseGroups = groupSetsByExercise(setRows);
            return (
              <article key={session.id} className="workout-history-card">
                <div className="workout-history-top">
                  <div>
                    <strong>{session.workouts?.title || "Workout"}</strong>
                    <small>{formatDate(session.completed_at || session.created_at)}</small>
                  </div>
                  <div className="workout-history-metrics">
                    <span>{session.summary?.completed_sets || setRows.filter((set) => set.completed).length} sets</span>
                    <span>{formatLoad(session.summary?.total_volume_kg)}</span>
                    <span>{formatDuration(session.duration_seconds)}</span>
                  </div>
                </div>
                <div className="workout-history-exercises">
                  {exerciseGroups.map((exercise, index) => (
                    <Link href={`/workouts/exercises/${encodeURIComponent(exercise.name)}`} key={`${exercise.name}-${index}`}>
                      <strong>{exercise.name}</strong>
                      <span>{compactSetSummary(exercise.sets)}</span>
                    </Link>
                  ))}
                </div>
              </article>
            );
          })}
        </div>
      </section>
      <BottomNav unreadCount={unreadCount} />
    </main>
  );
}
