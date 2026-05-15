"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "../../components/AppHeader";
import { supabase } from "../../lib/supabase";

export default function TeamPage() {
  const router = useRouter();

  const [profile, setProfile] = useState(null);
  const [partners, setPartners] = useState([]);
  const [incoming, setIncoming] = useState([]);
  const [outgoing, setOutgoing] = useState([]);
  const [trainingInvites, setTrainingInvites] = useState([]);
  const [searchText, setSearchText] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [message, setMessage] = useState("");

  const totalOpenRequests = incoming.length + outgoing.length;

  const allKnownUserIds = useMemo(() => {
    const ids = new Set();

    [...partners, ...incoming, ...outgoing].forEach((relation) => {
      ids.add(relation.requester_id);
      ids.add(relation.addressee_id);
    });

    if (profile?.id) ids.add(profile.id);

    return ids;
  }, [partners, incoming, outgoing, profile?.id]);

  const loadTeam = async () => {
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
        setMessage("Your account is blocked. Contact an administrator.");
        return;
      }

      setProfile(profileRow);

      const { data: relationRows, error: relationError } = await supabase
        .from("training_partners")
        .select("id,requester_id,addressee_id,status,created_at")
        .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
        .order("created_at", { ascending: false });

      if (relationError) throw relationError;

      const rows = relationRows || [];
      const userIds = [...new Set(rows.flatMap((row) => [row.requester_id, row.addressee_id]).filter(Boolean))];

      let profileMap = {};

      if (userIds.length) {
        const { data: profileRows, error: profileListError } = await supabase
          .from("profiles")
          .select("id,name,first_name,last_name,email,avatar_url,role,location")
          .in("id", userIds);

        if (profileListError) {
          console.warn("Team profiles skipped", profileListError);
        } else {
          profileMap = Object.fromEntries((profileRows || []).map((item) => [item.id, item]));
        }
      }

      const withProfiles = rows.map((row) => ({
        ...row,
        requester: profileMap[row.requester_id] || null,
        addressee: profileMap[row.addressee_id] || null,
      }));

      setPartners(withProfiles.filter((row) => row.status === "accepted"));
      setIncoming(withProfiles.filter((row) => row.status === "pending" && row.addressee_id === user.id));
      setOutgoing(withProfiles.filter((row) => row.status === "pending" && row.requester_id === user.id));

      const { data: inviteRows, error: inviteError } = await supabase
        .from("training_invites")
        .select("id,session_id,inviter_id,invitee_id,created_at")
        .eq("invitee_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20);

      if (inviteError) {
        console.warn("Training invites skipped", inviteError);
        setTrainingInvites([]);
      } else {
        const rows = inviteRows || [];
        const sessionIds = rows.map((row) => row.session_id).filter(Boolean);
        const inviterIds = rows.map((row) => row.inviter_id).filter(Boolean);

        let sessionMap = {};
        let inviterMap = {};

        if (sessionIds.length) {
          const { data: sessions, error: sessionsError } = await supabase
            .from("training_sessions")
            .select("id,title,sports,starts_at,final_starts_at,flexible_date,planning_type,start_location")
            .in("id", sessionIds);

          if (sessionsError) {
            console.warn("Invited trainings skipped", sessionsError);
          } else {
            sessionMap = Object.fromEntries((sessions || []).map((session) => [session.id, session]));
          }
        }

        if (inviterIds.length) {
          const { data: inviters, error: invitersError } = await supabase
            .from("profiles")
            .select("id,name,first_name,last_name,avatar_url,role")
            .in("id", inviterIds);

          if (invitersError) {
            console.warn("Invite profiles skipped", invitersError);
          } else {
            inviterMap = Object.fromEntries((inviters || []).map((person) => [person.id, person]));
          }
        }

        setTrainingInvites(
          rows
            .map((row) => ({
              ...row,
              training: sessionMap[row.session_id] || null,
              inviter: inviterMap[row.inviter_id] || null,
            }))
            .filter((row) => row.training)
        );
      }
    } catch (err) {
      console.error("Team load error", err);
      setMessage(err?.message || "Could not load your team.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTeam();
  }, []);

  const searchPeople = async (event) => {
    event.preventDefault();
    setMessage("");

    const query = searchText.trim();

    if (query.length < 2) {
      setMessage("Type at least 2 characters.");
      return;
    }

    try {
      setSearching(true);

      const escaped = query.replaceAll("%", "").replaceAll("_", "");
      const { data, error } = await supabase
        .from("profiles")
        .select("id,name,first_name,last_name,email,avatar_url,role,location")
        .or(`name.ilike.%${escaped}%,email.ilike.%${escaped}%,first_name.ilike.%${escaped}%,last_name.ilike.%${escaped}%`)
        .limit(12);

      if (error) throw error;

      setResults((data || []).filter((person) => !allKnownUserIds.has(person.id)));
    } catch (err) {
      console.error("Team search error", err);
      setMessage(err?.message || "Could not search people.");
    } finally {
      setSearching(false);
    }
  };

  const sendRequest = async (personId) => {
    setMessage("");

    if (!profile?.id) return;

    try {
      setBusyId(personId);

      const { error } = await supabase.from("training_partners").insert({
        requester_id: profile.id,
        addressee_id: personId,
        status: "pending",
      });

      if (error) throw error;

      setMessage("Team Up request sent.");
      setResults((current) => current.filter((person) => person.id !== personId));
      await loadTeam();
    } catch (err) {
      console.error("Send request error", err);
      setMessage(err?.message || "Could not send Team Up request.");
    } finally {
      setBusyId("");
    }
  };

  const updateRequest = async (relationId, status) => {
    setMessage("");

    try {
      setBusyId(relationId);

      const { error } = await supabase
        .from("training_partners")
        .update({ status })
        .eq("id", relationId)
        .eq("addressee_id", profile.id);

      if (error) throw error;

      setMessage(status === "accepted" ? "Training partner accepted." : "Request rejected.");
      await loadTeam();
    } catch (err) {
      console.error("Update request error", err);
      setMessage(err?.message || "Could not update request.");
    } finally {
      setBusyId("");
    }
  };

  const removePartner = async (relationId) => {
    setMessage("");

    try {
      setBusyId(relationId);

      const { error } = await supabase
        .from("training_partners")
        .delete()
        .eq("id", relationId);

      if (error) throw error;

      setMessage("Training partner removed.");
      await loadTeam();
    } catch (err) {
      console.error("Remove partner error", err);
      setMessage(err?.message || "Could not remove training partner.");
    } finally {
      setBusyId("");
    }
  };

  const acceptTrainingInvite = async (invite) => {
    if (!profile?.id || !invite?.session_id) return;

    setMessage("");

    try {
      setBusyId(invite.id);

      const { data: existingParticipant, error: existingParticipantError } = await supabase
        .from("session_participants")
        .select("id")
        .eq("session_id", invite.session_id)
        .eq("user_id", profile.id)
        .maybeSingle();

      if (existingParticipantError) throw existingParticipantError;

      if (!existingParticipant?.id) {
        const { error: participantError } = await supabase
          .from("session_participants")
          .insert({
            session_id: invite.session_id,
            user_id: profile.id,
          });

        if (participantError) throw participantError;
      }

      const { error: inviteDeleteError } = await supabase
        .from("training_invites")
        .delete()
        .eq("id", invite.id)
        .eq("invitee_id", profile.id);

      if (inviteDeleteError) throw inviteDeleteError;

      setMessage("Training invite accepted. You joined the session.");
      await loadTeam();
    } catch (err) {
      console.error("Accept training invite error", err);
      setMessage(err?.message || "Could not accept training invite.");
    } finally {
      setBusyId("");
    }
  };

  const declineTrainingInvite = async (invite) => {
    if (!profile?.id || !invite?.id) return;

    setMessage("");

    try {
      setBusyId(invite.id);

      const { error } = await supabase
        .from("training_invites")
        .delete()
        .eq("id", invite.id)
        .eq("invitee_id", profile.id);

      if (error) throw error;

      setMessage("Training invite declined.");
      await loadTeam();
    } catch (err) {
      console.error("Decline training invite error", err);
      setMessage(err?.message || "Could not decline training invite.");
    } finally {
      setBusyId("");
    }
  };

  const getOtherProfile = (relation) => {
    if (!profile?.id) return null;
    return relation.requester_id === profile.id ? relation.addressee : relation.requester;
  };

  const displayTrainingTime = (training) => {
    if (!training) return "Time not set";

    const start = training.final_starts_at || training.starts_at;
    if (start) {
      return new Date(start).toLocaleString([], {
        weekday: "short",
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
    }

    if (training.flexible_date) {
      return `Flexible · ${training.flexible_date}`;
    }

    return "Time not set";
  };

  const displayName = (person) => {
    if (!person) return "Endurance user";
    return person.name || [person.first_name, person.last_name].filter(Boolean).join(" ") || person.email || "Endurance user";
  };

  const initials = (person) => {
    return displayName(person)
      .split(" ")
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  };

  const PersonAvatar = ({ person }) => {
    if (person?.avatar_url) {
      return <img src={person.avatar_url} alt="" style={styles.avatar} />;
    }

    return <div style={styles.initials}>{initials(person)}</div>;
  };

  return (
    <main style={styles.page}>
      <section style={styles.shell}>
        <AppHeader profile={profile} compact />

        <header style={styles.header}>
          <div style={styles.kicker}>Team Up</div>
          <div style={styles.titleRow}>
            <h1 style={styles.title}>Build your team.</h1>
            <button type="button" onClick={() => router.push("/trainings")} style={styles.primaryButton}>
              Trainings
            </button>
          </div>
          <p style={styles.subtitle}>
            Training partners are the foundation for team-only sessions, invites and trusted profile visibility.
          </p>
        </header>

        <section style={styles.statsGrid}>
          <div style={styles.statCard}>
            <span style={styles.statLabel}>Partners</span>
            <strong style={styles.statValue}>{loading ? "…" : partners.length}</strong>
            <span style={styles.statHint}>accepted</span>
          </div>
          <div style={styles.statCard}>
            <span style={styles.statLabel}>Requests</span>
            <strong style={styles.statValue}>{loading ? "…" : totalOpenRequests}</strong>
            <span style={styles.statHint}>open</span>
          </div>
        </section>

        {message ? <section style={styles.message}>{message}</section> : null}

        <section style={styles.panel}>
          <div style={styles.panelHeader}>
            <div>
              <div style={styles.panelKicker}>Training invites</div>
              <h2 style={styles.panelTitle}>Invited sessions</h2>
            </div>

            <span style={styles.countBadge}>{trainingInvites.length}</span>
          </div>

          {trainingInvites.length ? (
            <div style={styles.list}>
              {trainingInvites.map((invite) => {
                const inviter = invite.inviter;
                const training = invite.training;

                return (
                  <div key={invite.id} style={styles.trainingInviteCard}>
                    <div style={styles.trainingInviteIcon}>⚡</div>

                    <div style={styles.personText}>
                      <strong>{training.title}</strong>
                      <span>{displayTrainingTime(training)}</span>
                      <span>
                        Invited by {displayName(inviter)}
                        {training.start_location ? ` · ${training.start_location}` : ""}
                      </span>
                    </div>

                    <div style={styles.buttonGroup}>
                      <button
                        type="button"
                        onClick={() => acceptTrainingInvite(invite)}
                        disabled={busyId === invite.id}
                        style={styles.smallPrimaryButton}
                      >
                        Join
                      </button>

                      <button
                        type="button"
                        onClick={() => declineTrainingInvite(invite)}
                        disabled={busyId === invite.id}
                        style={styles.smallGhostButton}
                      >
                        Decline
                      </button>

                      <button
                        type="button"
                        onClick={() => router.push(`/trainings/${training.id}`)}
                        style={styles.smallGhostButton}
                      >
                        Open
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p style={styles.panelText}>No training invites yet.</p>
          )}
        </section>

        <section style={styles.panel}>
          <div style={styles.panelHeader}>
            <div>
              <div style={styles.panelKicker}>Find people</div>
              <h2 style={styles.panelTitle}>Send a Team Up request</h2>
            </div>
          </div>

          <form onSubmit={searchPeople} style={styles.searchRow}>
            <input
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="Search by name or email"
              style={styles.input}
            />
            <button type="submit" disabled={searching} style={styles.searchButton}>
              {searching ? "Searching..." : "Search"}
            </button>
          </form>

          {results.length ? (
            <div style={styles.list}>
              {results.map((person) => (
                <div key={person.id} style={styles.personCard}>
                  <PersonAvatar person={person} />
                  <div style={styles.personText}>
                    <strong>{displayName(person)}</strong>
                    <span>{person.location || person.role || "Endurance user"}</span>
                  </div>
                  <div style={styles.buttonGroup}>
                    <button
                      type="button"
                      onClick={() => router.push(`/profile/${person.id}`)}
                      style={styles.smallGhostButton}
                    >
                      Profile
                    </button>

                    <button
                      type="button"
                      onClick={() => sendRequest(person.id)}
                      disabled={busyId === person.id}
                      style={styles.smallPrimaryButton}
                    >
                      Team Up
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </section>

        <section style={styles.panel}>
          <div style={styles.panelHeader}>
            <div>
              <div style={styles.panelKicker}>Incoming</div>
              <h2 style={styles.panelTitle}>Team requests</h2>
            </div>
          </div>

          {incoming.length ? (
            <div style={styles.list}>
              {incoming.map((relation) => {
                const person = relation.requester;

                return (
                  <div key={relation.id} style={styles.personCard}>
                    <PersonAvatar person={person} />
                    <div style={styles.personText}>
                      <strong>{displayName(person)}</strong>
                      <span>wants to Team Up</span>
                    </div>
                    <div style={styles.buttonGroup}>
                      <button
                        type="button"
                        onClick={() => router.push(`/profile/${person?.id}`)}
                        style={styles.smallGhostButton}
                      >
                        Profile
                      </button>

                      <button
                        type="button"
                        onClick={() => updateRequest(relation.id, "accepted")}
                        disabled={busyId === relation.id}
                        style={styles.smallPrimaryButton}
                      >
                        Accept
                      </button>
                      <button
                        type="button"
                        onClick={() => updateRequest(relation.id, "rejected")}
                        disabled={busyId === relation.id}
                        style={styles.smallGhostButton}
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p style={styles.panelText}>No incoming requests.</p>
          )}
        </section>

        <section style={styles.panel}>
          <div style={styles.panelHeader}>
            <div>
              <div style={styles.panelKicker}>My Team</div>
              <h2 style={styles.panelTitle}>Training partners</h2>
            </div>
          </div>

          {partners.length ? (
            <div style={styles.list}>
              {partners.map((relation) => {
                const person = getOtherProfile(relation);

                return (
                  <div key={relation.id} style={styles.personCard}>
                    <PersonAvatar person={person} />
                    <div style={styles.personText}>
                      <strong>{displayName(person)}</strong>
                      <span>{person?.location || person?.role || "Training partner"}</span>
                    </div>
                    <div style={styles.buttonGroup}>
                      <button
                        type="button"
                        onClick={() => router.push(`/profile/${person?.id}`)}
                        style={styles.smallGhostButton}
                      >
                        Profile
                      </button>

                      <button
                        type="button"
                        onClick={() => removePartner(relation.id)}
                        disabled={busyId === relation.id}
                        style={styles.smallGhostButton}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p style={styles.panelText}>No training partners yet. Search for someone to Team Up.</p>
          )}
        </section>

        {outgoing.length ? (
          <section style={styles.panel}>
            <div style={styles.panelHeader}>
              <div>
                <div style={styles.panelKicker}>Sent</div>
                <h2 style={styles.panelTitle}>Pending requests</h2>
              </div>
            </div>

            <div style={styles.list}>
              {outgoing.map((relation) => {
                const person = relation.addressee;

                return (
                  <div key={relation.id} style={styles.personCard}>
                    <PersonAvatar person={person} />
                    <div style={styles.personText}>
                      <strong>{displayName(person)}</strong>
                      <span>Waiting for response</span>
                    </div>
                    <div style={styles.buttonGroup}>
                      <button
                        type="button"
                        onClick={() => router.push(`/profile/${person?.id}`)}
                        style={styles.smallGhostButton}
                      >
                        Profile
                      </button>

                      <button
                        type="button"
                        onClick={() => removePartner(relation.id)}
                        disabled={busyId === relation.id}
                        style={styles.smallGhostButton}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}
      </section>
    </main>
  );
}

const glass = "linear-gradient(145deg, rgba(255,255,255,0.105), rgba(255,255,255,0.045))";

const styles = {
  page: {
    minHeight: "100vh",
    background:
      "radial-gradient(circle at top right, rgba(228,239,22,0.12), transparent 30%), linear-gradient(180deg, #07100b 0%, #050505 65%, #020202 100%)",
    color: "white",
    padding: "18px 16px 42px",
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    overflowX: "hidden",
  },
  shell: { width: "100%", maxWidth: 960, margin: "0 auto", display: "grid", gap: 18 },
  header: { display: "grid", gap: 10 },
  kicker: { color: "#e4ef16", fontSize: 13, fontWeight: 950, letterSpacing: "0.14em", textTransform: "uppercase" },
  titleRow: { display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", alignItems: "end", gap: 12 },
  title: { margin: 0, fontSize: "clamp(38px, 11vw, 64px)", lineHeight: 0.96, letterSpacing: "-0.065em" },
  subtitle: { margin: 0, color: "rgba(255,255,255,0.68)", lineHeight: 1.5, maxWidth: 620 },
  primaryButton: { minHeight: 46, borderRadius: 999, border: 0, background: "#e4ef16", color: "#101406", padding: "0 16px", fontWeight: 950, cursor: "pointer", whiteSpace: "nowrap" },
  statsGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },
  statCard: { minHeight: 112, borderRadius: 26, padding: 16, boxSizing: "border-box", background: glass, border: "1px solid rgba(255,255,255,0.13)", display: "grid", alignContent: "space-between" },
  statLabel: { color: "rgba(255,255,255,0.54)", fontSize: 12, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.12em" },
  statValue: { fontSize: 42, letterSpacing: "-0.06em", lineHeight: 0.95 },
  statHint: { color: "rgba(255,255,255,0.62)", fontSize: 13, fontWeight: 800 },
  panel: { borderRadius: 30, padding: 18, background: glass, border: "1px solid rgba(255,255,255,0.13)", display: "grid", gap: 14 },
  panelHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 },
  panelKicker: { color: "#e4ef16", fontSize: 12, fontWeight: 950, letterSpacing: "0.12em", textTransform: "uppercase" },
  panelTitle: { margin: 0, fontSize: 25, letterSpacing: "-0.05em" },
  panelText: { margin: 0, color: "rgba(255,255,255,0.66)", lineHeight: 1.45 },
  message: { borderRadius: 20, padding: 14, background: "rgba(228,239,22,0.10)", border: "1px solid rgba(228,239,22,0.18)", color: "#e4ef16", fontWeight: 850 },
  searchRow: { display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 10 },
  input: { width: "100%", minHeight: 48, borderRadius: 16, border: "1px solid rgba(255,255,255,0.13)", background: "rgba(0,0,0,0.22)", color: "white", padding: "0 12px", boxSizing: "border-box", outline: "none", fontSize: 15 },
  searchButton: { minHeight: 48, borderRadius: 16, border: 0, background: "#e4ef16", color: "#101406", fontWeight: 950, padding: "0 16px", cursor: "pointer" },
  list: { display: "grid", gap: 10 },
  countBadge: {
    minWidth: 36,
    height: 36,
    borderRadius: 999,
    display: "grid",
    placeItems: "center",
    background: "rgba(228,239,22,0.12)",
    color: "#e4ef16",
    border: "1px solid rgba(228,239,22,0.22)",
    fontWeight: 950,
  },
  trainingInviteCard: {
    minHeight: 74,
    borderRadius: 24,
    padding: 12,
    background: "rgba(228,239,22,0.075)",
    border: "1px solid rgba(228,239,22,0.16)",
    display: "grid",
    gridTemplateColumns: "46px minmax(0, 1fr)",
    alignItems: "center",
    gap: 11,
  },
  trainingInviteIcon: {
    width: 46,
    height: 46,
    borderRadius: 999,
    display: "grid",
    placeItems: "center",
    background: "rgba(228,239,22,0.14)",
    color: "#e4ef16",
    border: "1px solid rgba(228,239,22,0.26)",
    fontWeight: 950,
  },
  personCard: { minHeight: 64, borderRadius: 24, padding: 10, background: "rgba(255,255,255,0.055)", border: "1px solid rgba(255,255,255,0.08)", display: "grid", gridTemplateColumns: "46px minmax(0, 1fr)", alignItems: "center", gap: 11 },
  avatar: { width: 46, height: 46, borderRadius: 999, objectFit: "cover", border: "1px solid rgba(228,239,22,0.30)" },
  initials: { width: 46, height: 46, borderRadius: 999, display: "grid", placeItems: "center", background: "rgba(228,239,22,0.14)", color: "#e4ef16", border: "1px solid rgba(228,239,22,0.28)", fontWeight: 950 },
  personText: { minWidth: 0, display: "grid", gap: 2, color: "rgba(255,255,255,0.66)" },
  buttonGroup: { display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-start", gridColumn: "1 / -1" },
  smallPrimaryButton: { minHeight: 38, borderRadius: 999, border: 0, background: "#e4ef16", color: "#101406", padding: "0 12px", fontWeight: 950, cursor: "pointer" },
  smallGhostButton: { minHeight: 38, borderRadius: 999, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.07)", color: "white", padding: "0 12px", fontWeight: 950, cursor: "pointer" },
};
