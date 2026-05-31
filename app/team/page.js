// app/team/page.js
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabase";
import AppHeader from "../../components/AppHeader";
import BottomNav from "../../components/BottomNav";

export default function TeamPage() {
  const [partners, setPartners] = useState([]);
  const [requests, setRequests] = useState([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [message, setMessage] = useState("");

  async function load() {
    const { data: authData } = await supabase.auth.getUser();
    const user = authData?.user;
    if (!user) return;

    const { data: partnerRows } = await supabase
      .from("training_partners")
      .select("*")
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
      .eq("status", "accepted");

    const { data: requestRows } = await supabase
      .from("training_partners")
      .select("*")
      .eq("addressee_id", user.id)
      .eq("status", "pending");

    setPartners(partnerRows || []);
    setRequests(requestRows || []);
  }

  useEffect(() => {
    load();
  }, []);

  async function searchPeople() {
    setMessage("");
    const { data: authData } = await supabase.auth.getUser();
    const user = authData?.user;
    if (!user || !query.trim()) return;

    const { data } = await supabase
      .from("profiles")
      .select("id,name,first_name,last_name,avatar_url,location")
      .neq("id", user.id)
      .ilike("name", `%${query.trim()}%`)
      .limit(10);

    setResults(data || []);
  }

  async function teamUp(profile) {
    const { data: authData } = await supabase.auth.getUser();
    const user = authData?.user;
    if (!user) return;

    const { error } = await supabase.from("training_partners").upsert(
      {
        requester_id: user.id,
        addressee_id: profile.id,
        status: "pending",
      },
      { onConflict: "requester_id,addressee_id" }
    );

    if (error) {
      setMessage(error.message);
      return;
    }

    await supabase.from("notifications").insert({
      user_id: profile.id,
      actor_id: user.id,
      type: "team_request",
      title: "New Team Up request",
      body: "Someone wants to connect with you on Endurance.",
      action_url: "/team",
      metadata: {},
    });

    setMessage("Team Up request sent.");
  }

  return (
    <main className="endurance-page">
      <AppHeader active="team" />

      <section className="endurance-shell page-hero compact">
        <p className="eyebrow">Team</p>
        <h1>Training partners</h1>
        <p>Build your trusted training circle for sessions, invites and profile visibility.</p>
      </section>

      <section className="endurance-shell metric-grid two">
        <div className="metric-card">
          <strong>{partners.length}</strong>
          <div>
            <b>Partners</b>
            <p>accepted</p>
          </div>
        </div>
        <div className="metric-card">
          <strong>{requests.length}</strong>
          <div>
            <b>Requests</b>
            <p>open</p>
          </div>
        </div>
      </section>

      {message && <section className="endurance-shell"><div className="status-message">{message}</div></section>}

      <section className="endurance-shell endurance-card team-search-card">
        <p className="eyebrow">Find people</p>
        <h2>Send a Team Up request</h2>
        <div className="team-search-row">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name..." />
          <button type="button" onClick={searchPeople} className="primary-action">Search</button>
        </div>

        <div className="people-results">
          {results.map((profile) => (
            <article key={profile.id} className="people-result">
              <Link
                href={`/profile/${profile.id}`}
                className="people-result-avatar-link"
                aria-label={`Open profile of ${profile.name || "Endurance member"}`}
              >
                <span className="participant-avatar">
                  {profile.avatar_url ? <img src={profile.avatar_url} alt="" /> : (profile.name || "U").slice(0, 1)}
                </span>
              </Link>
              <div className="people-result-info">
                <h3>{profile.name || `${profile.first_name || ""} ${profile.last_name || ""}`.trim()}</h3>
                <p>{profile.location || "Endurance member"}</p>
              </div>
              <button type="button" onClick={() => teamUp(profile)} className="primary-action people-team-up-action">Team Up</button>
            </article>
          ))}
        </div>
      </section>

      <BottomNav />
    </main>
  );
}
