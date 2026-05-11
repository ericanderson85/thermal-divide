import { useEffect, useRef } from 'react'
import {
  formatCompactCurrency,
  formatCurrency,
  formatHours,
  formatPercent,
  formatPercentPoints,
  formatTemperature,
} from '../utils/formatters'

function highlightValue(highlight, formatter) {
  if (!highlight) {
    return 'No summary available yet.'
  }
  return `${highlight.name}: ${formatter(highlight.value)}`
}

function detailRows(properties) {
  if (!properties) {
    return []
  }
  return [
    ['Urban heat island', formatTemperature(properties.uhi_mean_f)],
    ['3PM air temperature', formatTemperature(properties.day_3pm_mean_f)],
    ['3AM air temperature', formatTemperature(properties.night_3am_mean_f)],
    ['Heat duration', formatHours(properties.heat_duration_mean)],
    ['Tree canopy', formatPercentPoints(properties.canopy_pct, 1)],
    ['Impervious surface', formatPercentPoints(properties.impervious_pct, 1)],
    ['Median income', formatCurrency(properties.median_household_income)],
    ['Poverty rate', formatPercent(properties.poverty_rate)],
    ['Residents of color', formatPercent(properties.poc_share)],
  ]
}

export default function StorySidebar({
  steps,
  stats,
  activeStepId,
  onStepChange,
  exploreMode,
  selectedLayer,
  setExploreMode,
  setSelectedLayer,
  layerOptions,
  activeFeature,
  onClearSelection,
}) {
  const stepRefs = useRef({})
  const activeIndex = Math.max(
    0,
    steps.findIndex((step) => step.id === activeStepId),
  )

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((left, right) => right.intersectionRatio - left.intersectionRatio)
        if (visible[0]) {
          onStepChange(visible[0].target.dataset.stepId)
        }
      },
      {
        rootMargin: '-18% 0px -38% 0px',
        threshold: [0.2, 0.45, 0.75],
      },
    )

    for (const step of steps) {
      const node = stepRefs.current[step.id]
      if (node) {
        observer.observe(node)
      }
    }

    return () => observer.disconnect()
  }, [onStepChange, steps])

  return (
    <div className="story-stack">
      <section className="hero-card">
        <p className="eyebrow">Boston Heat Story</p>
        <div className="hero-heading">
          <div>
            <h1>The Thermal Divide</h1>
            <p className="hero-copy">
              A neighborhood-first scrollytelling map about how heat, greenery,
              and vulnerability overlap across Boston.
            </p>
          </div>
          <div className="hero-badge">
            <span>Heat summaries</span>
            <strong>{stats?.heatStatsAvailable ? 'Ready' : 'Pending'}</strong>
          </div>
        </div>

        <div className="hero-stats">
          <div>
            <span>Neighborhoods</span>
            <strong>{stats?.neighborhoodCount || 0}</strong>
          </div>
          <div>
            <span>ACS Coverage</span>
            <strong>{stats?.acsCount || 0}</strong>
          </div>
          <div>
            <span>Hottest UHI</span>
            <strong>{formatTemperature(stats?.highlights?.highestUhi?.value)}</strong>
          </div>
        </div>

        <div className="story-progress">
          <div className="progress-meta">
            <span>Story chapter</span>
            <strong>
              {activeIndex + 1} / {steps.length}
            </strong>
          </div>
          <div className="progress-track">
            <span
              className="progress-fill"
              style={{ width: `${((activeIndex + 1) / steps.length) * 100}%` }}
            />
          </div>
          <div className="chapter-nav">
            {steps.map((step, index) => (
              <button
                key={step.id}
                type="button"
                className={`chapter-dot ${step.id === activeStepId ? 'active' : ''}`}
                aria-label={`Jump to ${step.title}`}
                onClick={() => {
                  stepRefs.current[step.id]?.scrollIntoView({
                    behavior: 'smooth',
                    block: 'center',
                  })
                  onStepChange(step.id)
                }}
              >
                {index + 1}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="summary-card">
        <div className="summary-header">
          <div>
            <p className="eyebrow">Signals</p>
            <h3>What the merged dataset says first</h3>
          </div>
          <p className="summary-note">
            Heat values are approximate neighborhood means sampled from the
            official Boston heat tile services.
          </p>
        </div>

        <ul className="summary-list">
          <li>{highlightValue(stats?.highlights?.highestCanopy, (value) => formatPercentPoints(value, 1))}</li>
          <li>{highlightValue(stats?.highlights?.mostImpervious, (value) => formatPercentPoints(value, 1))}</li>
          <li>{highlightValue(stats?.highlights?.lowestIncome, (value) => formatCompactCurrency(value))}</li>
          <li>{highlightValue(stats?.highlights?.highestPoverty, (value) => formatPercent(value))}</li>
          <li>{highlightValue(stats?.highlights?.warmestNight, (value) => formatTemperature(value))}</li>
        </ul>
      </section>

      {steps.map((step) => (
        <section
          key={step.id}
          ref={(node) => {
            stepRefs.current[step.id] = node
          }}
          data-step-id={step.id}
          className={`story-step ${activeStepId === step.id ? 'active' : ''}`}
        >
          <p className="eyebrow">{step.step}</p>
          <h2>{step.title}</h2>
          <p>{step.body}</p>
        </section>
      ))}

      <section className="controls-card">
        <div className="controls-header">
          <div>
            <p className="eyebrow">Explore</p>
            <h3>Take control of the layer stack</h3>
          </div>
          <button
            type="button"
            className={`mode-button ${exploreMode ? 'active' : ''}`}
            onClick={() => setExploreMode((current) => !current)}
          >
            {exploreMode ? 'Return to Story' : 'Enable Explore'}
          </button>
        </div>

        <label className="control-field">
          <span>Manual layer</span>
          <select
            value={selectedLayer}
            onChange={(event) => {
              setExploreMode(true)
              setSelectedLayer(event.target.value)
            }}
          >
            {layerOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <p className="controls-note">
          Story mode keeps the map synchronized to the scroll chapters. Explore
          mode unlocks direct comparisons across heat, canopy, income, race, and
          vulnerability layers.
        </p>
      </section>

      <section className="detail-card">
        <div className="detail-header">
          <div>
            <p className="eyebrow">Selection</p>
            <h3>{activeFeature?.properties?.name || 'No neighborhood selected'}</h3>
          </div>
          {activeFeature ? (
            <button type="button" className="ghost-button" onClick={onClearSelection}>
              Clear
            </button>
          ) : null}
        </div>
        {activeFeature ? (
          <>
            {activeFeature.properties.acs_available === false ? (
              <p className="inline-note">
                ACS income and race metrics are unavailable for this neighborhood
                in the source workbook.
              </p>
            ) : null}
            <dl>
              {detailRows(activeFeature.properties).map(([label, value]) => (
                <div className="detail-row" key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </>
        ) : (
          <p>
            Hover the map to preview a neighborhood, or click one to pin it here
            while you move through the story.
          </p>
        )}
      </section>
    </div>
  )
}
