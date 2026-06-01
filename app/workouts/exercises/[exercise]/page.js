"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import AppHeader from "../../../../components/AppHeader";
import BottomNav from "../../../../components/BottomNav";
import { supabase } from "../../../../lib/supabase";

function formatDate(value) {
  if (!value) return "";
  try {
    return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
  } catch {
    return "";
  }
}

function formatLoad(value) {
  const number = Number(value || 0);
  if (!number) return "—";
  return number >= 1000 ? `${Math.round(number / 100) / 10}k kg` : `${Math.round(number)} kg`;
}

function compactSetSummary(sets = []) {
  if (!sets.length) return "No completed sets";
  const groups = [];
  sets.forEach((set) => {
    const reps = set?.reps || "?";
    const weight = set?.weight_kg === null || set?.weight_kg === undefined || set?.weight_kg === "" ? "open" : `${set.weight_kg}kg`;
    const signature = `${reps} @ ${weight}`;
    const last = groups[groups.length - 1];
    if (last?.signature === signature) last.count += 1;
    else groups.push({ signature, count: 1 });
  });
  return groups.map((group) => `${group.count}x ${group.signature}`).join("   ");
}

function bestSet(sets = []) {
  return sets.reduce((best, set) => {
    const weight = Number(set.weight_kg || 0);
    const reps = Number(set.reps || 0);
    const volume = weight * reps;
    const bestVolume = Number(best?.weight_kg || 0) * Number(best?.reps || 0);
    if (!best || weight > Number(best.weight_kg || 0) || volume > bestVolume) return set;
    return best;
  }, null);
}

export default function ExerciseHistoryPage() {
  const params = useParams();
  const router = useRouter();
  const exerciseName = decodeURIComponent(params?.exercise || "Exercise");

  const [rows, setRows] = useState([]);
  const [pr, setPr] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    loadExerciseHistory();
  }, [exerciseName]);

  async function loadExerciseHistory() {
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
        .select("id,onboarding_completed")
        .eq("id", user.id)
        .maybeSingle();
      if (profileError) throw profileError;
      if (!profileRow?.onboarding_completed) {
        router.replace("/onboarding");
        return;
      }

      const [{ data: sessionRows, error: historyError }, { data: prRow }, { count: notificationCount }, { count: inviteCount }] = await Promise.all([
        supabase
          .from("workout_sessions")
          .select("id,workout_id,user_id,completed_at,created_at,summary,workouts(id,title),workout_session_sets(id,exercise_name,equipment,reps,weight_kg,completed,set_number,exercise_position,is_pr)")
          .eq("user_id", user.id)
          .order("completed_at", { ascending: false, nullsFirst: false })
          .limit(50),
        supabase
          .from("exercise_prs")
          .select("id,exercise_name,equipment,best_weight_kg,best_reps,best_volume,achieved_at")
          .eq("user_id", user.id)
          .eq("exercise_name", exerciseName)
          .maybeSingle(),
        supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", user.id).is("read_at", null),
        supabase.from("training_invites").select("id", { count: "exact", head: true }).eq("invitee_id", user.id).eq("status", "pending"),
      ]);
      if (historyError) throw historyError;

      const filtered = (sessionRows || [])
        .map((session) => ({
          ...session,
          exerciseSets: (session.workout_session_sets || [])
            .filter((set) => set.completed && set.exercise_name === exerciseName)
            .sort((a, b) => a.set_number - b.set_number),
        }))
        .filter((session) => session.exerciseSets.length);

      setRows(filtered);
      setPr(prRow || null);
      setUnreadCount((notificationCount || 0) + (inviteCount || 0));
    } catch (error) {
      console.error("Exercise history error", error);
      setMessage(error?.message || "Could not load exercise history.");
    } finally {
      setLoading(false);
    }
  }

  const stats = useMemo(() => {
    const allSets = rows.flatMap((session) => session.exerciseSets || []);
    const best = bestSet(allSets);
    const totalVolume = allSets.reduce((sum, set) => sum + Number(set.reps || 0) * Number(set.weight_kg || 0), 0);
    return { allSets, best, totalVolume };
  }, [rows]);

  return (
    <main className="endurance-page workout-history-page exercise-history-page">
      <AppHeader active="workouts" />
      <section className="endurance-shell workout-premium-hero endurance-card">
        <div className="workout-premium-hero-main">
          <Link href="/workouts/history" className="route-detail-back">← Workout history</Link>
          <div className="workout-premium-kicker"><span>Exercise progress</span></div>
          <h1>{exerciseName}</h1>
          <p className="workout-premium-description">All completed sets and progress for this exercise.</p>
        </div>
        <div className="workout-premium-stat-grid">
          <div><span>Sessions</span><strong>{rows.length}</strong></div>
          <div><span>Sets</span><strong>{stats.allSets.length}</strong></div>
          <div><span>Best</span><strong>{pr ? `${pr.best_reps} @ ${pr.best_weight_kg}kg` : stats.best ? `${stats.best.reps} @ ${stats.best.weight_kg}kg` : "—"}</strong></div>
          <div><span>Volume</span><strong>{formatLoad(stats.totalVolume)}</strong></div>
        </div>
      </section>

      {message ? <section className="endurance-shell route-detail-message">{message}</section> : null}

      <section className="endurance-shell workout-plan-card endurance-card">
        <div className="workout-plan-header"><div><p className="eyebrow">History</p><h2>Completed sets</h2></div><span>{rows.length}</span></div>
        {loading ? <p className="route-detail-muted">Loading exercise history...</p> : null}
        {!loading && !rows.length ? <p className="route-detail-muted">No completed sets yet.</p> : null}
        <div className="workout-history-list">
          {rows.map((session) => (
            <article key={session.id} className="workout-history-card compact">
              <div className="workout-history-top">
                <div>
                  <strong>{session.workouts?.title || "Workout"}</strong>
                  <small>{formatDate(session.completed_at || session.created_at)}</small>
                </div>
                <div className="workout-history-metrics"><span>{compactSetSummary(session.exerciseSets)}</span></div>
              </div>
            </article>
          ))}
        </div>
      </section>
      <BottomNav unreadCount={unreadCount} />
    </main>
  );
}
