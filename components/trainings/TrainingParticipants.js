// components/trainings/TrainingParticipants.js
export default function TrainingParticipants({ participants = [], maxParticipants }) {
  const visible = participants.slice(0, 4);
  const overflow = Math.max(0, participants.length - visible.length);

  return (
    <div className="training-participants">
      <div className="participant-avatars">
        {visible.map((participant, index) => {
          const profile = participant?.profiles || participant?.profile || participant;
          const name = profile?.name || profile?.first_name || "User";
          return (
            <span key={participant?.id || profile?.id || index} className="participant-avatar">
              {profile?.avatar_url ? <img src={profile.avatar_url} alt="" /> : name.slice(0, 1)}
            </span>
          );
        })}
        {overflow > 0 && <span className="participant-avatar">+{overflow}</span>}
      </div>
      <span className="participant-count">
        {participants.length} joined{maxParticipants ? ` / ${maxParticipants}` : ""}
      </span>
    </div>
  );
}
