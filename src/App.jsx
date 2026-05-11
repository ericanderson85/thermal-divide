import { startTransition, useDeferredValue, useEffect, useState } from 'react'
import ComparisonChart from './components/ComparisonChart'
import StoryMap from './components/StoryMap'
import StorySidebar from './components/StorySidebar'
import {
  buildStorySteps,
  COMPARISON_OPTIONS,
  getStoryViewId,
  LAYER_OPTIONS,
  VIEW_PRESETS,
} from './config/views'

async function fetchJson(url) {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to load ${url} (${response.status})`)
  }
  return response.json()
}

export default function App() {
  const [dataset, setDataset] = useState({
    loading: true,
    error: null,
    neighborhoods: null,
    openSpace: null,
    stats: null,
  })
  const [activeStepId, setActiveStepId] = useState('overview')
  const [exploreMode, setExploreMode] = useState(false)
  const [selectedLayer, setSelectedLayer] = useState('uhi')
  const [comparisonMetric, setComparisonMetric] = useState('uhi')
  const [hoveredName, setHoveredName] = useState(null)
  const [selectedName, setSelectedName] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function loadData() {
      try {
        const [neighborhoods, openSpace, stats] = await Promise.all([
          fetchJson('/data/neighborhoods_enriched.geojson'),
          fetchJson('/data/open_space_simplified.geojson'),
          fetchJson('/data/story_stats.json'),
        ])

        if (cancelled) {
          return
        }

        setDataset({
          loading: false,
          error: null,
          neighborhoods,
          openSpace,
          stats,
        })
      } catch (error) {
        if (!cancelled) {
          setDataset({
            loading: false,
            error: error.message,
            neighborhoods: null,
            openSpace: null,
            stats: null,
          })
        }
      }
    }

    loadData()
    return () => {
      cancelled = true
    }
  }, [])

  const stats = dataset.stats
  const storySteps = buildStorySteps(stats)
  const neighborhoods = dataset.neighborhoods?.features || []
  const openSpace = dataset.openSpace?.features || []

  const currentViewId = exploreMode
    ? selectedLayer
    : getStoryViewId(activeStepId, storySteps)
  const currentView = VIEW_PRESETS[currentViewId] || VIEW_PRESETS.overview
  const deferredHoveredName = useDeferredValue(hoveredName)
  const activeName = selectedName || deferredHoveredName
  const activeFeature =
    neighborhoods.find((feature) => feature.properties.name === activeName) || null
  const heatStatsAvailable = Boolean(stats?.heatStatsAvailable)
  const activeComparisonMetric =
    exploreMode && COMPARISON_OPTIONS.some((option) => option.value === selectedLayer)
      ? selectedLayer
      : comparisonMetric

  if (dataset.loading) {
    return (
      <main className="app-shell loading-shell">
        <div className="status-card">
          <p className="eyebrow">Loading</p>
          <h1>The Thermal Divide</h1>
          <p>Preparing the Boston neighborhood story map.</p>
        </div>
      </main>
    )
  }

  if (dataset.error) {
    return (
      <main className="app-shell loading-shell">
        <div className="status-card error">
          <p className="eyebrow">Data Error</p>
          <h1>Unable to load the story assets</h1>
          <p>{dataset.error}</p>
          <p>Run `npm run prepare:data` to regenerate the public data outputs.</p>
        </div>
      </main>
    )
  }

  return (
    <main className="app-shell">
      <div className="app-grid">
        <div className="story-column">
          <StorySidebar
            steps={storySteps}
            stats={stats}
            activeStepId={activeStepId}
            onStepChange={(stepId) => {
              startTransition(() => {
                setActiveStepId(stepId)
              })
            }}
            exploreMode={exploreMode}
            selectedLayer={selectedLayer}
            setExploreMode={setExploreMode}
            setSelectedLayer={setSelectedLayer}
            layerOptions={LAYER_OPTIONS}
            activeFeature={activeFeature}
            onClearSelection={() => setSelectedName(null)}
          />

          {(exploreMode || activeStepId === 'comparison') && (
            <ComparisonChart
              neighborhoods={neighborhoods}
              heatStatsAvailable={heatStatsAvailable}
              activeName={activeName}
              onSelectName={setSelectedName}
              comparisonMetric={activeComparisonMetric}
              onComparisonMetricChange={setComparisonMetric}
            />
          )}
        </div>

        <div className="visual-column">
          <StoryMap
            neighborhoods={neighborhoods}
            openSpace={openSpace}
            stats={stats}
            view={currentView}
            activeName={activeName}
            selectedName={selectedName}
            onHoverName={setHoveredName}
            onSelectName={(name) => {
              setSelectedName((current) => (current === name ? null : name))
            }}
          />
        </div>
      </div>
    </main>
  )
}
