"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "../../components/AppHeader";
import { supabase } from "../../lib/supabase";

function displayName(person) {
  return person?.name || [person?.first_name, person?.last_name].filter(Boolean).join(" ") || person?.email || "Endurance user";
}

function initials(person) {
  return displayName(person)
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export default function TeamPage() {
  const router = useRouter();

  const [profile, setProfile] = useState(null);
  const [partners, setPartners] = useState([]);
  const [incoming, setIncoming] = useState([]);
  const [outgoing, setOutgoing] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    loadTeam();
  }, []);

  async function loadTeam() {
    setLoading(true);

    try {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData?.user;

      if (!user?.id) {
        router.replace("/login");
        return;
      }

      const { data: profileRow } = await supabase
        .from("profiles")
        .select("id,name,email,avatar_url,role,onboarding_completed")
        .eq("id", user.id)
        .maybeSingle();

      if (!profileRow?.onboarding_completed) {
        router.replace("/onboarding");
        return;
      }

      setProfile(profileRow);

      const { data: rows } = await supabase
        .from("training_partners")
        .select("*")
        .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
        .order("created_at", { ascending: false });

      const partnerRows = rows || [];

      const ids = [
        ...new Set(
          partnerRows.flatMap((row) => [row.requester_id, row.addressee_id])
        ),
      ].filter(Boolean);

      let peopleMap = {};

      if (ids.length) {
        const { data: people } = await supabase
          .from("profiles")
          .select("id,name,first_name,last_name,email,avatar_url,location,role")
          .in("id", ids);

        peopleMap = Object.fromEntries((people || []).map((person) => [person.id, person]));
      }

      const accepted = [];
      const incomingRows = [];
      const outgoingRows = [];

      for (const row of partnerRows) {
        const otherId =
          row.requester_id === user.id ? row.addressee_id : row.requester_id;

        const other = peopleMap[otherId];

        if (row.status === "accepted") {
          accepted.push({ ...row, other });
        } else if (row.status === "pending") {
          if (row.addressee_id === user.id) {
            incomingRows.push({ ...row, other });
          } else {
            outgoingRows.push({ ...row, other });
          }
        }
      }

      setPartners(accepted);
      setIncoming(incomingRows);
      setOutgoing(outgoingRows);
    } catch (error) {
      console.error(error);
      setNotice("Could not load Team page.");
    } finally {
      setLoading(false);
    }
  }

  async function respond(id, status) {
    setBusyId(id);

    try {
      const { error } = await supabase
        .from("training_partners")
        .update({ status })
        .eq("id", id);

      if (error) throw error;

      setNotice(
        status === "accepted"
          ? "Team Up request accepted."
          : "Team Up request rejected."
      );

      await loadTeam();
    } catch (error) {
      console.error(error);
      setNotice("Could not update Team Up request.");
    } finally {
      setBusyId("");
    }
  }

  async function removePartner(id) {
    setBusyId(id);

    try {
      const { error } = await supabase
        .from("training_partners")
        .delete()
        .eq("id", id);

      if (error) throw error;

      setNotice("Training partner removed.");
      await loadTeam();
    } catch (error) {
      console.error(error);
      setNotice("Could not remove training partner.");
    } finally {
      setBusyId("");
    }
  }

  return (
    <main style={styles.page}>
      <section style={styles.shell}>
        <AppHeader profile={profile} compact />

        <header style={styles.header}>
          <div style={styles.kicker}>Team</div>
          <h1 style={styles.title}>Train together</h1>
          <p style={styles.subtitle}>
            Your Team Up connections, requests and future training partners.
          </p>
        </header>

        {notice ? <section style={styles.notice}>{notice}</section> : null}

        <section style={styles.stats}>
          <div style={styles.statCard}>
            <span>Partners</span>
            <strong>{partners.length}</strong>
          </div>

          <div style={styles.statCard}>
            <span>Incoming</span>
            <strong>{incoming.length}</strong>
          </div>

          <div style={styles.statCard}>
            <span>Outgoing</span>
            <strong>{outgoing.length}</strong>
          </div>
        </section>

        {loading ? (
          <section style={styles.card}>Loading Team...</section>
        ) : (
          <>
            <section style={styles.section}>
              <div style={styles.sectionHeader}>
                <h2 style={styles.sectionTitle}>Your training partners</h2>
              </div>

              {partners.length ? (
                <div style={styles.grid}>
                  {partners.map((item) => (
                    <article key={item.id} style={styles.partnerCard}>
                      <div style={styles.personRow}>
                        {item.other?.avatar_url ? (
                          <img src={item.other.avatar_url} alt="" style={styles.avatar} />
                        ) : (
                          <div style={styles.avatarFallback}>
                            {initials(item.other)}
                          </div>
                        )}

                        <div style={styles.personText}>
                          <strong>{displayName(item.other)}</strong>
                          <span>{item.other?.location || "Endurance member"}</span>
                        </div>
                      </div>

                      <div style={styles.actions}>
                        <button
                          type="button"
                          onClick={() => router.push(`/profile/${item.other.id}`)}
                          style={styles.secondaryButton}
                        >
                          Profile
                        </button>

                        <button
                          type="button"
                          onClick={() => router.push("/trainings/new")}
                          style={styles.primaryButton}
                        >
                          Invite to training
                        </button>

                        <button
                          type="button"
                          disabled={busyId === item.id}
                          onClick={() => removePartner(item.id)}
                          style={styles.dangerButton}
                        >
                          Remove
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <section style={styles.card}>
                  No training partners yet.
                </section>
              )}
            </section>

            <section style={styles.section}>
              <div style={styles.sectionHeader}>
                <h2 style={styles.sectionTitle}>Incoming requests</h2>
              </div>

              {incoming.length ? (
                <div style={styles.grid}>
                  {incoming.map((item) => (
                    <article key={item.id} style={styles.requestCard}>
                      <div style={styles.personRow}>
                        {item.other?.avatar_url ? (
                          <img src={item.other.avatar_url} alt="" style={styles.avatar} />
                        ) : (
                          <div style={styles.avatarFallback}>
                            {initials(item.other)}
                          </div>
                        )}

                        <div style={styles.personText}>
                          <strong>{displayName(item.other)}</strong>
                          <span>wants to Team Up</span>
                        </div>
                      </div>

                      <div style={styles.actions}>
                        <button
                          type="button"
                          disabled={busyId === item.id}
                          onClick={() => respond(item.id, "accepted")}
                          style={styles.primaryButton}
                        >
                          Accept
                        </button>

                        <button
                          type="button"
                          disabled={busyId === item.id}
                          onClick={() => respond(item.id, "rejected")}
                          style={styles.dangerButton}
                        >
                          Reject
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <section style={styles.card}>
                  No incoming Team Up requests.
                </section>
              )}
            </section>

            <section style={styles.section}>
              <div style={styles.sectionHeader}>
                <h2 style={styles.sectionTitle}>Outgoing requests</h2>
              </div>

              {outgoing.length ? (
                <div style={styles.grid}>
                  {outgoing.map((item) => (
                    <article key={item.id} style={styles.card}>
                      Waiting for {displayName(item.other)}
                    </article>
                  ))}
                </div>
              ) : (
                <section style={styles.card}>
                  No pending outgoing requests.
                </section>
              )}
            </section>
          </>
        )}
      </section>
    </main>
  );
}

const glass =
  "linear-gradient(145deg, rgba(255,255,255,0.105), rgba(255,255,255,0.045))";

const styles = {
  page: {
    minHeight: "100vh",
    background:
      "radial-gradient(circle at top right, rgba(228,239,22,0.12), transparent 30%), linear-gradient(180deg, #07100b 0%, #050505 65%, #020202 100%)",
    color: "white",
    padding: "18px 16px 44px",
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
  header: {
    display: "grid",
    gap: 10,
  },
  kicker: {
    color: "#e4ef16",
    fontSize: 13,
    fontWeight: 950,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
  },
  title: {
    margin: 0,
    fontSize: "clamp(42px, 12vw, 72px)",
    lineHeight: 0.92,
    letterSpacing: "-0.07em",
  },
  subtitle: {
    margin: 0,
    color: "rgba(255,255,255,0.68)",
    lineHeight: 1.5,
  },
  notice: {
    borderRadius: 20,
    padding: 14,
    background: "rgba(228,239,22,0.10)",
    border: "1px solid rgba(228,239,22,0.18)",
    color: "#e4ef16",
    fontWeight: 850,
  },
  stats: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0,1fr))",
    gap: 10,
  },
  statCard: {
    minHeight: 84,
    borderRadius: 24,
    padding: 14,
    background: glass,
    border: "1px solid rgba(255,255,255,0.12)",
    display: "grid",
    alignContent: "space-between",
  },
  section: {
    display: "grid",
    gap: 12,
  },
  sectionHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sectionTitle: {
    margin: 0,
    fontSize: 28,
    letterSpacing: "-0.05em",
  },
  grid: {
    display: "grid",
    gap: 12,
  },
  card: {
    borderRadius: 28,
    padding: 18,
    background: glass,
    border: "1px solid rgba(255,255,255,0.13)",
  },
  requestCard: {
    borderRadius: 28,
    padding: 18,
    background:
      "linear-gradient(145deg, rgba(228,239,22,0.13), rgba(255,255,255,0.045))",
    border: "1px solid rgba(228,239,22,0.25)",
    display: "grid",
    gap: 14,
  },
  partnerCard: {
    borderRadius: 28,
    padding: 18,
    background: glass,
    border: "1px solid rgba(255,255,255,0.13)",
    display: "grid",
    gap: 14,
  },
  personRow: {
    display: "grid",
    gridTemplateColumns: "54px minmax(0,1fr)",
    gap: 12,
    alignItems: "center",
  },
  avatar: {
    width: 54,
    height: 54,
    borderRadius: 999,
    objectFit: "cover",
  },
  avatarFallback: {
    width: 54,
    height: 54,
    borderRadius: 999,
    background: "rgba(228,239,22,0.12)",
    border: "1px solid rgba(228,239,22,0.22)",
    display: "grid",
    placeItems: "center",
    color: "#e4ef16",
    fontWeight: 950,
  },
  personText: {
    display: "grid",
    gap: 4,
    minWidth: 0,
  },
  actions: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
  },
  primaryButton: {
    minHeight: 42,
    borderRadius: 999,
    border: 0,
    background: "#e4ef16",
    color: "#101406",
    padding: "0 14px",
    fontWeight: 950,
    cursor: "pointer",
  },
  secondaryButton: {
    minHeight: 42,
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.08)",
    color: "white",
    padding: "0 14px",
    fontWeight: 950,
    cursor: "pointer",
  },
  dangerButton: {
    minHeight: 42,
    borderRadius: 999,
    border: "1px solid rgba(255,90,90,0.18)",
    background: "rgba(255,70,70,0.10)",
    color: "#ffb4b4",
    padding: "0 14px",
    fontWeight: 950,
    cursor: "pointer",
  },
};
