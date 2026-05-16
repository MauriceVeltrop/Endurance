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
  const [knownRelationIds, setKnownRelationIds] = useState(new Set());
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    loadTeam();
  }, []);

  async function loadTeam() {
    setLoading(true);
    setNotice("");

    try {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData?.user;

      if (!user?.id) {
        router.replace("/login");
        return;
      }

      const { data: profileRow, error: profileError } = await supabase
        .from("profiles")
        .select("id,name,email,avatar_url,role,onboarding_completed")
        .eq("id", user.id)
        .maybeSingle();

      if (profileError) throw profileError;

      if (!profileRow?.onboarding_completed) {
        router.replace("/onboarding");
        return;
      }

      setProfile(profileRow);

      const { data: rows, error: relationError } = await supabase
        .from("training_partners")
        .select("*")
        .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
        .order("created_at", { ascending: false });

      if (relationError) throw relationError;

      const relations = rows || [];
      const relationUserIds = [
        ...new Set(relations.flatMap((row) => [row.requester_id, row.addressee_id])),
      ].filter(Boolean);

      let peopleMap = {};

      if (relationUserIds.length) {
        const { data: people } = await supabase
          .from("profiles")
          .select("id,name,first_name,last_name,email,avatar_url,location,role")
          .in("id", relationUserIds);

        peopleMap = Object.fromEntries((people || []).map((person) => [person.id, person]));
      }

      const accepted = [];
      const incomingRows = [];
      const outgoingRows = [];
      const knownIds = new Set([user.id]);

      for (const row of relations) {
        const otherId = row.requester_id === user.id ? row.addressee_id : row.requester_id;
        const other = peopleMap[otherId];
        knownIds.add(otherId);

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
      setKnownRelationIds(knownIds);
    } catch (error) {
      console.error("Team load error", error);
      setNotice(error?.message || "Could not load Team page.");
    } finally {
      setLoading(false);
    }
  }

  async function searchPeople(event) {
    event?.preventDefault?.();

    if (!profile?.id) return;

    const query = searchTerm.trim();

    if (query.length < 2) {
      setSearchResults([]);
      setNotice("Type at least 2 characters to search.");
      return;
    }

    setSearching(true);
    setNotice("");

    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id,name,first_name,last_name,email,avatar_url,location,role,onboarding_completed,blocked")
        .or(`name.ilike.%${query}%,first_name.ilike.%${query}%,last_name.ilike.%${query}%,email.ilike.%${query}%`)
        .eq("onboarding_completed", true)
        .eq("blocked", false)
        .limit(20);

      if (error) throw error;

      setSearchResults(
        (data || []).filter((person) => person.id !== profile.id)
      );
    } catch (error) {
      console.error("Profile search error", error);
      setNotice(error?.message || "Could not search users.");
    } finally {
      setSearching(false);
    }
  }

  async function sendTeamUpRequest(personId) {
    if (!profile?.id || !personId || busyId) return;

    setBusyId(personId);
    setNotice("");

    try {
      const { error } = await supabase
        .from("training_partners")
        .insert({
          requester_id: profile.id,
          addressee_id: personId,
          status: "pending",
        });

      if (error) throw error;

      setNotice("Team Up request sent.");
      setSearchResults((current) => current.filter((person) => person.id !== personId));
      await loadTeam();
    } catch (error) {
      console.error("Team Up request error", error);
      setNotice(error?.message || "Could not send Team Up request.");
    } finally {
      setBusyId("");
    }
  }

  async function respond(id, status) {
    setBusyId(id);
    setNotice("");

    try {
      const { error } = await supabase
        .from("training_partners")
        .update({ status })
        .eq("id", id);

      if (error) throw error;

      setNotice(status === "accepted" ? "Team Up request accepted." : "Team Up request rejected.");
      await loadTeam();
    } catch (error) {
      console.error("Team request update error", error);
      setNotice(error?.message || "Could not update Team Up request.");
    } finally {
      setBusyId("");
    }
  }

  async function removePartner(id) {
    setBusyId(id);
    setNotice("");

    try {
      const { error } = await supabase
        .from("training_partners")
        .delete()
        .eq("id", id);

      if (error) throw error;

      setNotice("Training partner removed.");
      await loadTeam();
    } catch (error) {
      console.error("Remove partner error", error);
      setNotice(error?.message || "Could not remove training partner.");
    } finally {
      setBusyId("");
    }
  }

  const availableSearchResults = useMemo(() => {
    return searchResults.filter((person) => !knownRelationIds.has(person.id));
  }, [searchResults, knownRelationIds]);

  return (
    <main style={styles.page}>
      <section style={styles.shell}>
        <AppHeader profile={profile} compact />

        <header style={styles.header}>
          <div style={styles.kicker}>Team</div>
          <h1 style={styles.title}>Find training partners</h1>
          <p style={styles.subtitle}>
            Team Up with people first. Then invite them to real training sessions.
          </p>
        </header>

        {notice ? <section style={styles.notice}>{notice}</section> : null}

        <section style={styles.stats}>
          <button type="button" style={styles.statCard}>
            <span>Partners</span>
            <strong>{partners.length}</strong>
          </button>

          <button type="button" style={incoming.length ? styles.statHot : styles.statCard}>
            <span>Incoming</span>
            <strong>{incoming.length}</strong>
          </button>

          <button type="button" style={styles.statCard}>
            <span>Outgoing</span>
            <strong>{outgoing.length}</strong>
          </button>
        </section>

        <section style={styles.searchCard}>
          <div>
            <div style={styles.kicker}>Search</div>
            <h2 style={styles.sectionTitle}>Add someone to your Team</h2>
            <p style={styles.muted}>Search by name or email. Requests appear in their Inbox and Team page.</p>
          </div>

          <form onSubmit={searchPeople} style={styles.searchRow}>
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search athlete..."
              style={styles.searchInput}
            />

            <button type="submit" disabled={searching} style={styles.primaryButton}>
              {searching ? "Searching..." : "Search"}
            </button>
          </form>

          {availableSearchResults.length ? (
            <div style={styles.grid}>
              {availableSearchResults.map((person) => (
                <article key={person.id} style={styles.personCard}>
                  <div style={styles.personRow}>
                    {person.avatar_url ? (
                      <img src={person.avatar_url} alt="" style={styles.avatar} />
                    ) : (
                      <div style={styles.avatarFallback}>{initials(person)}</div>
                    )}

                    <div style={styles.personText}>
                      <strong>{displayName(person)}</strong>
                      <span>{person.location || person.role || "Endurance member"}</span>
                    </div>
                  </div>

                  <div style={styles.actions}>
                    <button type="button" onClick={() => router.push(`/profile/${person.id}`)} style={styles.secondaryButton}>
                      Profile
                    </button>

                    <button
                      type="button"
                      onClick={() => sendTeamUpRequest(person.id)}
                      disabled={busyId === person.id}
                      style={styles.primaryButton}
                    >
                      Team Up
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : searchResults.length ? (
            <p style={styles.muted}>Only existing Team Up relations were found.</p>
          ) : null}
        </section>

        {loading ? (
          <section style={styles.card}>Loading Team...</section>
        ) : (
          <>
            <section style={styles.section}>
              <h2 style={styles.sectionTitle}>Your training partners</h2>

              {partners.length ? (
                <div style={styles.grid}>
                  {partners.map((item) => (
                    <article key={item.id} style={styles.personCard}>
                      <div style={styles.personRow}>
                        {item.other?.avatar_url ? (
                          <img src={item.other.avatar_url} alt="" style={styles.avatar} />
                        ) : (
                          <div style={styles.avatarFallback}>{initials(item.other)}</div>
                        )}

                        <div style={styles.personText}>
                          <strong>{displayName(item.other)}</strong>
                          <span>{item.other?.location || "Training partner"}</span>
                        </div>
                      </div>

                      <div style={styles.actions}>
                        <button type="button" onClick={() => router.push(`/profile/${item.other.id}`)} style={styles.secondaryButton}>
                          Profile
                        </button>

                        <button type="button" onClick={() => router.push("/trainings/new")} style={styles.primaryButton}>
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
                <section style={styles.card}>No training partners yet. Search above to Team Up.</section>
              )}
            </section>

            <section style={styles.section}>
              <h2 style={styles.sectionTitle}>Incoming requests</h2>

              {incoming.length ? (
                <div style={styles.grid}>
                  {incoming.map((item) => (
                    <article key={item.id} style={styles.requestCard}>
                      <div style={styles.personRow}>
                        {item.other?.avatar_url ? (
                          <img src={item.other.avatar_url} alt="" style={styles.avatar} />
                        ) : (
                          <div style={styles.avatarFallback}>{initials(item.other)}</div>
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
                <section style={styles.card}>No incoming Team Up requests.</section>
              )}
            </section>

            <section style={styles.section}>
              <h2 style={styles.sectionTitle}>Outgoing requests</h2>

              {outgoing.length ? (
                <div style={styles.grid}>
                  {outgoing.map((item) => (
                    <article key={item.id} style={styles.card}>
                      Waiting for {displayName(item.other)}
                    </article>
                  ))}
                </div>
              ) : (
                <section style={styles.card}>No pending outgoing requests.</section>
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
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    overflowX: "hidden",
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
    color: "white",
    display: "grid",
    alignContent: "space-between",
    textAlign: "left",
  },
  statHot: {
    minHeight: 84,
    borderRadius: 24,
    padding: 14,
    background: "rgba(228,239,22,0.13)",
    border: "1px solid rgba(228,239,22,0.28)",
    color: "white",
    display: "grid",
    alignContent: "space-between",
    textAlign: "left",
    boxShadow: "0 0 34px rgba(228,239,22,0.10)",
  },
  searchCard: {
    borderRadius: 30,
    padding: 18,
    background:
      "linear-gradient(145deg, rgba(228,239,22,0.12), rgba(255,255,255,0.045))",
    border: "1px solid rgba(228,239,22,0.24)",
    display: "grid",
    gap: 14,
  },
  searchRow: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) auto",
    gap: 10,
  },
  searchInput: {
    width: "100%",
    minHeight: 48,
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(0,0,0,0.22)",
    color: "white",
    padding: "0 14px",
    boxSizing: "border-box",
    outline: "none",
    fontSize: 15,
  },
  section: {
    display: "grid",
    gap: 12,
  },
  sectionTitle: {
    margin: 0,
    fontSize: 28,
    letterSpacing: "-0.05em",
  },
  muted: {
    margin: 0,
    color: "rgba(255,255,255,0.66)",
    lineHeight: 1.45,
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
  personCard: {
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
