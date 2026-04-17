"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

export default function AdminPage() {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [profiel, setProfiel] = useState(null);
  const [gebruikers, setGebruikers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);

  useEffect(() => {
    const init = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    };

    init();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user?.id) {
      setProfiel(null);
      setGebruikers([]);
      return;
    }

    laadProfiel();
  }, [user?.id]);

  useEffect(() => {
    if (profiel?.role === "moderator") {
      laadGebruikers();
    }
  }, [profiel?.role]);

  const laadProfiel = async () => {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (error) {
      console.error(error);
      return;
    }

    setProfiel(data);
  };

  const laadGebruikers = async () => {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: true });

    if (error) {
      console.error(error);
      alert(`Gebruikers laden mislukt: ${error.message}`);
      return;
    }

    setGebruikers(data || []);
  };

  const wijzigGebruiker = (id, veld, waarde) => {
    setGebruikers((prev) =>
      prev.map((g) => (g.id === id ? { ...g, [veld]: waarde } : g))
    );
  };

  const opslaanGebruiker = async (gebruiker) => {
    setSavingId(gebruiker.id);

    const { error } = await supabase
      .from("profiles")
      .update({
        naam: gebruiker.naam,
        role: gebruiker.role,
        email: gebruiker.email,
      })
      .eq("id", gebruiker.id);

    setSavingId(null);

    if (error) {
      alert(`Opslaan mislukt: ${error.message}`);
      return;
    }

    alert("Gebruiker opgeslagen");
    await laadGebruikers();
  };

  const verwijderGebruiker = async (gebruiker) => {
    if (gebruiker.id === user?.id) {
      alert("Je kunt jezelf hier niet verwijderen.");
      return;
    }

    if (!confirm(`Profiel van ${gebruiker.naam} verwijderen?`)) return;

    const { error } = await supabase
      .from("profiles")
      .delete()
      .eq("id", gebruiker.id);

    if (error) {
      alert(`Verwijderen mislukt: ${error.message}`);
      return;
    }

    await laadGebruikers();
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.href = "/";
  };

  if (loading) {
    return (
      <main style={app}>
        <div style={card}>Laden...</div>
      </main>
    );
  }

  if (!session) {
    return (
      <main style={app}>
        <div style={card}>
          Je bent niet ingelogd.
          <div style={{ marginTop: 16 }}>
            <a href="/" style={linkBtn}>
              Naar login
            </a>
          </div>
        </div>
      </main>
    );
  }

  if (profiel && profiel.role !== "moderator") {
    return (
      <main style={app}>
        <div style={card}>
          Je hebt geen toegang tot dit scherm.
          <div style={{ marginTop: 16, display: "flex", gap: 12, flexWrap: "wrap" }}>
            <a href="/" style={linkBtn}>
              Terug naar app
            </a>
            <button onClick={handleSignOut} style={secondaryBtn}>
              Uitloggen
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main style={app}>
      <header style={header}>
        <div>
          <div style={title}>Admin</div>
          <div style={subtitle}>
            Ingelogd als <strong>{profiel?.naam || user?.email}</strong>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <a href="/" style={linkBtn}>
            Terug naar app
          </a>
          <button onClick={handleSignOut} style={secondaryBtn}>
            Uitloggen
          </button>
        </div>
      </header>

      <section style={listWrap}>
        {gebruikers.map((g) => (
          <div key={g.id} style={userCard}>
            <div style={grid}>
              <div>
                <div style={label}>Naam</div>
                <input
                  value={g.naam || ""}
                  onChange={(e) => wijzigGebruiker(g.id, "naam", e.target.value)}
                  style={veld}
                />
              </div>

              <div>
                <div style={label}>Email</div>
                <input
                  value={g.email || ""}
                  onChange={(e) => wijzigGebruiker(g.id, "email", e.target.value)}
                  style={veld}
                />
              </div>

              <div>
                <div style={label}>Rol</div>
                <select
                  value={g.role || "gebruiker"}
                  onChange={(e) => wijzigGebruiker(g.id, "role", e.target.value)}
                  style={veld}
                >
                  <option value="gebruiker">gebruiker</option>
                  <option value="organisator">organisator</option>
                  <option value="moderator">moderator</option>
                </select>
              </div>

              <div>
                <div style={label}>Aangemaakt</div>
                <div style={metaText}>
                  {g.created_at
                    ? new Date(g.created_at).toLocaleString("nl-NL")
                    : "-"}
                </div>
              </div>

              <div>
                <div style={label}>ID</div>
                <div style={idText}>{g.id}</div>
              </div>
            </div>

            <div style={btnRow}>
              <button
                onClick={() => opslaanGebruiker(g)}
                style={primaryBtn}
                disabled={savingId === g.id}
              >
                {savingId === g.id ? "Opslaan..." : "Opslaan"}
              </button>

              <button
                onClick={() => verwijderGebruiker(g)}
                style={dangerBtn}
              >
                Verwijder profiel
              </button>
            </div>
          </div>
        ))}
      </section>
    </main>
  );
}

const app = {
  minHeight: "100vh",
  background: "#050505",
  color: "white",
  padding: 16,
  fontFamily: "sans-serif",
};

const header = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 16,
  flexWrap: "wrap",
  marginBottom: 20,
};

const title = {
  fontSize: 32,
  fontWeight: 700,
};

const subtitle = {
  opacity: 0.75,
  marginTop: 6,
};

const card = {
  background: "#111",
  border: "1px solid rgba(255,255,255,0.06)",
  borderRadius: 20,
  padding: 20,
};

const listWrap = {
  display: "grid",
  gap: 16,
};

const userCard = {
  background: "#111",
  border: "1px solid rgba(255,255,255,0.06)",
  borderRadius: 20,
  padding: 16,
};

const grid = {
  display: "grid",
  gap: 12,
};

const label = {
  marginBottom: 6,
  fontSize: 13,
  opacity: 0.75,
};

const veld = {
  width: "100%",
  background: "#1b1b1b",
  color: "white",
  border: "1px solid #333",
  padding: "12px 12px",
  borderRadius: 12,
  boxSizing: "border-box",
};

const metaText = {
  background: "#1b1b1b",
  border: "1px solid #333",
  borderRadius: 12,
  padding: "12px 12px",
  opacity: 0.85,
};

const idText = {
  background: "#1b1b1b",
  border: "1px solid #333",
  borderRadius: 12,
  padding: "12px 12px",
  fontSize: 12,
  wordBreak: "break-all",
  opacity: 0.75,
};

const btnRow = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  marginTop: 14,
};

const primaryBtn = {
  background: "#e4ef16",
  color: "black",
  border: "none",
  padding: "12px 16px",
  borderRadius: 12,
  fontWeight: "bold",
};

const secondaryBtn = {
  background: "#2a2a2a",
  color: "white",
  border: "none",
  padding: "12px 16px",
  borderRadius: 12,
};

const dangerBtn = {
  background: "#5a1f1f",
  color: "white",
  border: "none",
  padding: "12px 16px",
  borderRadius: 12,
};

const linkBtn = {
  display: "inline-block",
  background: "#2a2a2a",
  color: "white",
  textDecoration: "none",
  padding: "12px 16px",
  borderRadius: 12,
};
