"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import AppHeader from "../../../components/AppHeader";
import ProfileHero from "../../../components/profile/ProfileHero";
import ProfileTrainingList from "../../../components/profile/ProfileTrainingList";
import { supabase } from "../../../lib/supabase";
import { getSportLabel } from "../../../lib/trainingHelpers";

export default function PublicProfilePage() {
  const params = useParams();
  const router = useRouter();
  const profileId = Array.isArray(params?.id) ? params.id[0] : params?.id;

  const [viewer, setViewer] = useState(null);
  const [profile, setProfile] = useState(null);
  const [sports, setSports] = useState([]);
  const [createdTrainings, setCreatedTrainings] = useState([]);
  const [joinedTrainings, setJoinedTrainings] = useState([]);
  const [partnerStatus, setPartnerStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const isOwnProfile = viewer?.id && profile?.id && viewer.id === profile.id;

  useEffect(() => {
    loadProfile();
  }, [profileId]);

  const stats = useMemo(() => ({
    created: createdTrainings.length,
    joined: joinedTrainings.length,
  }), [createdTrainings.length, joinedTrainings.length]);

  async function loadProfile() {
    if (!profileId) return;

    setLoading(true);
    setMessage("");

    try {
      const { data: authData } = await supabase.auth.getUser();
      const user = authData?.user || null;
      setViewer(user);

      if (!user?.id) {
        router.replace("/login");
        return;
      }

      const { data: profileRow, error: profileError } = await supabase
        .from("profiles")
        .select("id,name,email,avatar_url,location,role,blocked,created_at,first_name,last_name")
        .eq("id", profileId)
        .maybeSingle();

      if (profileError) throw profileError;
      if (!profileRow) {
        setMessage("Profile not found.");
        return;
      }

      setProfile(profileRow);

      const { data: sportRows } = await supabase
        .from("user_sports")
        .select("sport_id")
        .eq("user_id", profileId);

      setSports((sportRows || []).map((row) => row.sport_id).filter(Boolean));

      const now = new Date().toISOString();

      const { data: createdRows } = await supabase
        .from("training_sessions")
        .select("id,title,sports,visibility,starts_at,final_starts_at,flexible_date,flexible_start_time,flexible_end_time,start_location,created_at")
        .eq("creator_id", profileId)
        .or(`starts_at.gte.${now},starts_at.is.null`)
        .order("starts_at", { ascending: true, nullsFirst: false })
        .limit(6);

      setCreatedTrainings(createdRows || []);

      const { data: participantRows } = await supabase
        .from("session_participants")
        .select("session_id")
        .eq("user_id", profileId)
        .limit(20);

      const joinedIds = (participantRows || []).map((row) => row.session_id).filter(Boolean);

      if (joinedIds.length) {
        const { data: joinedRows } = await supabase
          .from("training_sessions")
          .select("id,title,sports,visibility,starts_at,final_starts_at,flexible_date,flexible_start_time,flexible_end_time,start_location,created_at")
          .in("id", joinedIds)
          .order("starts_at", { ascending: true, nullsFirst: false })
          .limit(6);

        setJoinedTrainings(joinedRows || []);
      } else {
        setJoinedTrainings([]);
      }

      if (user.id !== profileId) {
        const { data: relationRows } = await supabase
          .from("training_partners")
          .select("id,requester_id,addressee_id,status")
          .or(`and(requester_id.eq.${user.id},addressee_id.eq.${profileId}),and(requester_id.eq.${profileId},addressee_id.eq.${user.id})`)
          .limit(1);

        setPartnerStatus(relationRows?.[0]?.status || "");
      }
    } catch (error) {
      console.error("Profile load error", error);
      setMessage(error?.message || "Could not load profile.");
    } finally {
      setLoading(false);
    }
  }

  async function sendTeamUpRequest() {
    if (!viewer?.id || !profile?.id || viewer.id === profile.id) return;

    setMessage("");

    try {
      const { error } = await supabase.from("training_partners").insert({
        requester_id: viewer.id,
        addressee_id: profile.id,
        status: "pending",
      });

      if (error) throw error;

      setPartnerStatus("pending");
      setMessage("Team Up request sent.");
    } catch (error) {
      console.error("Team Up request error", error);
      setMessage(error?.message || "Could not send Team Up request.");
    }
  }

  return (
    <main style={styles.page}>
      <section style={styles.shell}>
        <AppHeader profile={isOwnProfile ? profile : null} compact />

        <button type="button" onClick={() => router.back()} style={styles.backButton}>
          ← Back
        </button>

        {loading ? (
          <section style={styles.stateCard}>Loading profile...</section>
        ) : null}

        {message ? <section style={styles.message}>{message}</section> : null}

        {!loading && profile ? (
          <>
            <ProfileHero
              profile={profile}
              sports={sports}
              stats={stats}
              isOwnProfile={isOwnProfile}
              onEditProfile={() => router.push("/onboarding?edit=1")}
            />

            <section style={styles.actionCard}>
              <div>
                <div style={styles.kicker}>Social training</div>
                <h2 style={styles.actionTitle}>Train together</h2>
                <p style={styles.actionText}>
                  Team Up keeps Endurance personal: trusted training partners, invitations and safer sessions.
                </p>
              </div>

              {isOwnProfile ? (
                <button type="button" onClick={() => router.push("/team")} style={styles.primaryButton}>
                  Open Team
                </button>
              ) : partnerStatus === "accepted" ? (
                <button type="button" onClick={() => router.push("/team")} style={styles.secondaryButton}>
                  Team Up partner
                </button>
              ) : partnerStatus === "pending" ? (
                <button type="button" disabled style={styles.secondaryButton}>
                  Request pending
                </button>
              ) : (
                <button type="button" onClick={sendTeamUpRequest} style={styles.primaryButton}>
                  Team Up
                </button>
              )}
            </section>

            {sports.length ? (
              <section style={styles.sportsCard}>
                <div style={styles.kicker}>Preferred sports</div>
                <div style={styles.sportList}>
                  {sports.map((sport) => (
                    <span key={sport} style={styles.sportBadge}>{getSportLabel(sport)}</span>
                  ))}
                </div>
              </section>
            ) : null}

            <ProfileTrainingList
              title="Created"
              trainings={createdTrainings}
              emptyText="No upcoming created trainings yet."
              onOpen={(id) => router.push(`/trainings/${id}`)}
            />

            <ProfileTrainingList
              title="Joined"
              trainings={joinedTrainings}
              emptyText="No joined trainings yet."
              onOpen={(id) => router.push(`/trainings/${id}`)}
            />
          </>
        ) : null}
      </section>
    </main>
  );
}

const glass = "linear-gradient(145deg, rgba(255,255,255,0.10), rgba(255,255,255,0.04))";

const styles = {
  page: {
    minHeight: "100vh",
    background:
      "radial-gradient(circle at top right, rgba(228,239,22,0.12), transparent 30%), linear-gradient(180deg, #07100b 0%, #050505 65%, #020202 100%)",
    color: "white",
    padding: "16px 12px 56px",
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },
  shell: {
    width: "100%",
    maxWidth: 980,
    margin: "0 auto",
    display: "grid",
    gap: 16,
  },
  backButton: {
    width: "fit-content",
    minHeight: 42,
    borderRadius: 999,
    border: "1px solid rgba(228,239,22,0.22)",
    background: "rgba(228,239,22,0.08)",
    color: "#e4ef16",
    fontWeight: 950,
    padding: "0 14px",
    cursor: "pointer",
  },
  stateCard: {
    borderRadius: 28,
    padding: 20,
    background: glass,
    border: "1px solid rgba(255,255,255,0.12)",
  },
  message: {
    borderRadius: 22,
    padding: 14,
    background: "rgba(228,239,22,0.09)",
    border: "1px solid rgba(228,239,22,0.18)",
    color: "rgba(255,255,255,0.84)",
    fontWeight: 850,
  },
  actionCard: {
    borderRadius: 30,
    padding: 18,
    background: glass,
    border: "1px solid rgba(255,255,255,0.12)",
    display: "grid",
    gap: 14,
  },
  kicker: {
    color: "#e4ef16",
    fontSize: 12,
    fontWeight: 950,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
  },
  actionTitle: {
    margin: "4px 0 6px",
    fontSize: 28,
    letterSpacing: "-0.055em",
  },
  actionText: {
    margin: 0,
    color: "rgba(255,255,255,0.66)",
    lineHeight: 1.5,
  },
  primaryButton: {
    minHeight: 48,
    borderRadius: 999,
    border: 0,
    background: "#e4ef16",
    color: "#101406",
    fontWeight: 950,
    padding: "0 18px",
    cursor: "pointer",
    width: "fit-content",
  },
  secondaryButton: {
    minHeight: 48,
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.08)",
    color: "white",
    fontWeight: 950,
    padding: "0 18px",
    cursor: "pointer",
    width: "fit-content",
  },
  sportsCard: {
    borderRadius: 30,
    padding: 18,
    background: glass,
    border: "1px solid rgba(255,255,255,0.12)",
    display: "grid",
    gap: 12,
  },
  sportList: {
    display: "flex",
    flexWrap: "wrap",
    gap: 9,
  },
  sportBadge: {
    borderRadius: 999,
    padding: "9px 12px",
    background: "rgba(228,239,22,0.12)",
    border: "1px solid rgba(228,239,22,0.22)",
    color: "#e4ef16",
    fontWeight: 900,
    fontSize: 13,
  },
};
