"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "../../components/AppHeader";
import { supabase } from "../../lib/supabase";

export default function ProfilePage() {
  const router = useRouter();

  const [profile, setProfile] = useState(null);
  const [sports, setSports] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProfile();
  }, []);

  const initials = useMemo(() => {
    const value = profile?.name || "E";

    return value
      .split(" ")
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  }, [profile?.name]);

  async function loadProfile() {
    try {
      const { data: authData } = await supabase.auth.getUser();
      const user = authData?.user;

      if (!user?.id) {
        router.replace("/login");
        return;
      }

      const { data: profileRow } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();

      setProfile(profileRow || null);

      const { data: sportRows } = await supabase
        .from("user_sports")
        .select("sport_id")
        .eq("user_id", user.id);

      setSports((sportRows || []).map((row) => row.sport_id));
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <main style={styles.page}>
        <section style={styles.shell}>
          <AppHeader profile={profile} />
          <section style={styles.loadingCard}>Loading profile...</section>
        </section>
      </main>
    );
  }

  return (
    <main style={styles.page}>
      <section style={styles.shell}>
        <AppHeader profile={profile} />

        <section style={styles.hero}>
          <div style={styles.heroGlow} />

          <div style={styles.heroContent}>
            <div style={styles.avatarWrap}>
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt="" style={styles.avatar} />
              ) : (
                <div style={styles.avatarFallback}>{initials}</div>
              )}
            </div>

            <div style={styles.profileMeta}>
              <div style={styles.kicker}>Verified athlete</div>

              <h1 style={styles.name}>
                {profile?.name || "Endurance athlete"}
              </h1>

              <p style={styles.subtitle}>
                {profile?.location || "Location not set"}
              </p>

              <div style={styles.badges}>
                <div style={styles.badge}>
                  {profile?.role || "user"}
                </div>

                <div style={styles.badge}>
                  {sports.length} sports
                </div>
              </div>
            </div>
          </div>
        </section>

        <section style={styles.grid}>
          <article style={styles.card}>
            <div style={styles.cardKicker}>Profile</div>
            <h2 style={styles.cardTitle}>Personal info</h2>

            <div style={styles.infoGrid}>
              <div style={styles.infoItem}>
                <span>Email</span>
                <strong>{profile?.email || "Not set"}</strong>
              </div>

              <div style={styles.infoItem}>
                <span>Location</span>
                <strong>{profile?.location || "Not set"}</strong>
              </div>

              <div style={styles.infoItem}>
                <span>Birth date</span>
                <strong>{profile?.birth_date || "Not set"}</strong>
              </div>

              <div style={styles.infoItem}>
                <span>Status</span>
                <strong>{profile?.blocked ? "Blocked" : "Active"}</strong>
              </div>
            </div>

            <button
              type="button"
              onClick={() => router.push("/onboarding")}
              style={styles.primaryButton}
            >
              Edit profile
            </button>
          </article>

          <article style={styles.card}>
            <div style={styles.cardKicker}>Sports</div>
            <h2 style={styles.cardTitle}>Preferred sports</h2>

            {sports.length ? (
              <div style={styles.sportList}>
                {sports.map((sport) => (
                  <div key={sport} style={styles.sportBadge}>
                    {sport.replaceAll("-", " ")}
                  </div>
                ))}
              </div>
            ) : (
              <p style={styles.emptyText}>
                No preferred sports selected yet.
              </p>
            )}
          </article>

          <article style={styles.card}>
            <div style={styles.cardKicker}>Community</div>
            <h2 style={styles.cardTitle}>Endurance network</h2>

            <p style={styles.communityText}>
              Build your trusted training network through Team Up requests,
              private sessions and verified athlete profiles.
            </p>

            <div style={styles.communityButtons}>
              <button
                type="button"
                onClick={() => router.push("/team")}
                style={styles.primaryButton}
              >
                Open Team
              </button>

              <button
                type="button"
                onClick={() => router.push("/trainings")}
                style={styles.secondaryButton}
              >
                Trainings
              </button>
            </div>
          </article>
        </section>
      </section>
    </main>
  );
}

const glass =
  "linear-gradient(145deg, rgba(255,255,255,0.10), rgba(255,255,255,0.04))";

const styles = {
  page: {
    minHeight: "100vh",
    background:
      "radial-gradient(circle at top right, rgba(228,239,22,0.12), transparent 30%), linear-gradient(180deg, #07100b 0%, #050505 65%, #020202 100%)",
    color: "white",
    padding: "18px 16px 60px",
    fontFamily:
      "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },

  shell: {
    width: "100%",
    maxWidth: 980,
    margin: "0 auto",
    display: "grid",
    gap: 18,
  },

  loadingCard: {
    borderRadius: 30,
    padding: 24,
    background: glass,
    border: "1px solid rgba(255,255,255,0.12)",
  },

  hero: {
    position: "relative",
    overflow: "hidden",
    borderRadius: 38,
    background:
      "radial-gradient(circle at top right, rgba(228,239,22,0.16), transparent 34%), linear-gradient(145deg, #121712, #060706)",
    border: "1px solid rgba(255,255,255,0.10)",
    boxShadow: "0 30px 90px rgba(0,0,0,0.34)",
  },

  heroGlow: {
    position: "absolute",
    inset: 0,
    background:
      "radial-gradient(circle at 80% 18%, rgba(228,239,22,0.18), transparent 26%)",
  },

  heroContent: {
    position: "relative",
    zIndex: 2,
    padding: 28,
    display: "grid",
    gap: 20,
    justifyItems: "center",
    textAlign: "center",
  },

  avatarWrap: {
    width: 128,
    height: 128,
    borderRadius: 999,
    overflow: "hidden",
    border: "2px solid rgba(228,239,22,0.30)",
    boxShadow: "0 16px 40px rgba(228,239,22,0.12)",
  },

  avatar: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
  },

  avatarFallback: {
    width: "100%",
    height: "100%",
    display: "grid",
    placeItems: "center",
    background: "rgba(228,239,22,0.14)",
    color: "#e4ef16",
    fontWeight: 950,
    fontSize: 38,
  },

  profileMeta: {
    display: "grid",
    gap: 10,
  },

  kicker: {
    color: "#e4ef16",
    fontSize: 12,
    fontWeight: 950,
    letterSpacing: "0.16em",
    textTransform: "uppercase",
  },

  name: {
    margin: 0,
    fontSize: "clamp(40px, 10vw, 72px)",
    lineHeight: 0.92,
    letterSpacing: "-0.08em",
  },

  subtitle: {
    margin: 0,
    color: "rgba(255,255,255,0.66)",
  },

  badges: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    justifyContent: "center",
  },

  badge: {
    borderRadius: 999,
    padding: "9px 14px",
    background: "rgba(255,255,255,0.08)",
    border: "1px solid rgba(255,255,255,0.12)",
    fontWeight: 900,
    textTransform: "capitalize",
  },

  grid: {
    display: "grid",
    gap: 18,
  },

  card: {
    borderRadius: 32,
    padding: 22,
    background: glass,
    border: "1px solid rgba(255,255,255,0.12)",
    display: "grid",
    gap: 18,
  },

  cardKicker: {
    color: "#e4ef16",
    fontSize: 12,
    fontWeight: 950,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
  },

  cardTitle: {
    margin: 0,
    fontSize: 28,
    letterSpacing: "-0.05em",
  },

  infoGrid: {
    display: "grid",
    gap: 12,
  },

  infoItem: {
    minHeight: 68,
    borderRadius: 20,
    padding: 14,
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.08)",
    display: "grid",
    gap: 4,
    color: "rgba(255,255,255,0.66)",
  },

  sportList: {
    display: "flex",
    flexWrap: "wrap",
    gap: 10,
  },

  sportBadge: {
    borderRadius: 999,
    padding: "10px 14px",
    background: "rgba(228,239,22,0.12)",
    border: "1px solid rgba(228,239,22,0.22)",
    color: "#e4ef16",
    fontWeight: 900,
    textTransform: "capitalize",
  },

  emptyText: {
    margin: 0,
    color: "rgba(255,255,255,0.66)",
  },

  communityText: {
    margin: 0,
    color: "rgba(255,255,255,0.68)",
    lineHeight: 1.55,
  },

  communityButtons: {
    display: "flex",
    gap: 12,
    flexWrap: "wrap",
  },

  primaryButton: {
    minHeight: 50,
    borderRadius: 999,
    border: 0,
    background: "#e4ef16",
    color: "#101406",
    fontWeight: 950,
    padding: "0 18px",
    cursor: "pointer",
  },

  secondaryButton: {
    minHeight: 50,
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.08)",
    color: "white",
    fontWeight: 950,
    padding: "0 18px",
    cursor: "pointer",
  },
};
