// components/trainings/TrainingFilters.js
export default function TrainingFilters({ value = "", onChange }) {
  return (
    <section className="endurance-card feed-filter-card">
      <div>
        <p className="eyebrow">Smart feed</p>
        <h2>Your training opportunities</h2>
      </div>
      <label className="feed-search">
        <span>⌕</span>
        <input
          value={value}
          onChange={(event) => onChange?.(event.target.value)}
          placeholder="Search training, location or sport..."
        />
      </label>
    </section>
  );
}
