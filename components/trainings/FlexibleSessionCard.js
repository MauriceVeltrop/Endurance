// components/trainings/FlexibleSessionCard.js
import TrainingCard from "./TrainingCard";

export default function FlexibleSessionCard({ training, participants = [] }) {
  return (
    <section className="flexible-session-wrap">
      <div className="section-title-row">
        <div>
          <p className="eyebrow">Planning</p>
          <h2>Needs a decision</h2>
          <p>Flexible sessions where availability or a final time still matters.</p>
        </div>
        <span className="section-count">1</span>
      </div>
      <TrainingCard training={training} participants={participants} />
    </section>
  );
}
