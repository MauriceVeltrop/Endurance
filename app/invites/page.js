"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

export default function InvitesPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [invites, setInvites] = useState([]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    loadInvites();
  }, []);

  async function loadInvites() {
    setLoading(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }

      const { data, error } = await supabase
        .from("training_invites")
        .select("*")
        .eq("invitee_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;

      setInvites(data || []);
    } catch (error) {
      console.error(error);
      setMessage("Could not load invites.");
    } finally {
      setLoading(false);
    }
  }

  async function acceptInvite(invite) {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { error } = await supabase
        .from("session_participants")
        .insert({
          session_id: invite.session_id,
          user_id: user.id,
        });

      if (error) throw error;

      await supabase
        .from("training_invites")
        .delete()
        .eq("id", invite.id);

      loadInvites();
    } catch (error) {
      console.error(error);
      setMessage("Could not accept invite.");
    }
  }

  async function declineInvite(invite) {
    try {
      await supabase
        .from("training_invites")
        .delete()
        .eq("id", invite.id);

      loadInvites();
    } catch (error) {
      console.error(error);
      setMessage("Could not decline invite.");
    }
  }

  return (
    <main style={styles.page}>
      <section style={styles.hero}>
        <div style={styles.kicker}>Endurance</div>
        <h1 style={styles.title}>Training invites</h1>
      </section>

      {message ? (
        <section style={styles.message}>{message}</section>
      ) : null}

      {loading ? (
        <section style={styles.card}>Loading...</section>
      ) : invites.length ? (
        <section style={styles.list}>
          {invites.map((invite) => (
            <article key={invite.id} style={styles.card}>
              <div style={styles.session}>
                Session: {invite.session_id}
              </div>

              <div style={styles.actions}>
                <button
                  type="button"
                  onClick={() => router.push(`/trainings/${invite.session_id}`)}
                  style={styles.secondaryButton}
                >
                  Open
                </button>

                <button
                  type="button"
                  onClick={() => acceptInvite(invite)}
                  style={styles.primaryButton}
                >
                  Accept
                </button>

                <button
                  type="button"
                  onClick={() => declineInvite(invite)}
                  style={styles.dangerButton}
                >
                  Decline
                </button>
              </div>
            </article>
          ))}
        </section>
      ) : (
        <section style={styles.card}>
          No invites yet.
        </section>
      )}
    </main>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background: "#0b0f0f",
    color: "white",
    padding: 18,
    display: "grid",
    gap: 16,
  },

  hero: {
    display: "grid",
    gap: 8,
  },

  kicker: {
    color: "#e4ef16",
    fontWeight: 900,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
    fontSize: 12,
  },

  title: {
    margin: 0,
    fontSize: "clamp(40px, 10vw, 70px)",
    lineHeight: 0.92,
    letterSpacing: "-0.07em",
  },

  message: {
    borderRadius: 20,
    padding: 14,
    background: "rgba(228,239,22,0.10)",
    border: "1px solid rgba(228,239,22,0.20)",
    color: "#e4ef16",
    fontWeight: 800,
  },

  list: {
    display: "grid",
    gap: 14,
  },

  card: {
    borderRadius: 28,
    padding: 18,
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.10)",
    display: "grid",
    gap: 14,
  },

  session: {
    fontWeight: 800,
  },

  actions: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
  },

  primaryButton: {
    minHeight: 48,
    borderRadius: 999,
    border: 0,
    background: "#e4ef16",
    color: "#101406",
    padding: "0 18px",
    fontWeight: 900,
  },

  secondaryButton: {
    minHeight: 48,
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.05)",
    color: "white",
    padding: "0 18px",
    fontWeight: 900,
  },

  dangerButton: {
    minHeight: 48,
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,80,80,0.14)",
    color: "#ff9f9f",
    padding: "0 18px",
    fontWeight: 900,
  },
};
