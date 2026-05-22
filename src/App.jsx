import { startTransition, useDeferredValue, useEffect, useState } from 'react'
import ComparisonChart from './components/ComparisonChart'
import StoryMap from './components/StoryMap'
import StorySidebar from './components/StorySidebar'
import {
  buildStorySteps,
  getStoryViewId,
  VIEW_PRESETS,
} from './config/views'

async function fetchJson(url) {
  const response = await fetch(`${import.meta.env.BASE_URL}${url}`)
  if (!response.ok) {
    throw new Error(`Failed to load ${import.meta.env.BASE_URL}${url} (${response.status})`)
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
  const [activeStepId, setActiveStepId] = useState('heat')
  const [hoveredName, setHoveredName] = useState(null)
  const [selectedName, setSelectedName] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function loadData() {
      try {
        const [neighborhoods, openSpace, stats] = await Promise.all([
          fetchJson('data/neighborhoods_enriched.geojson'),
          fetchJson('data/open_space_simplified.geojson'),
          fetchJson('data/story_stats.json'),
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
  const neighborhoods = dataset.neighborhoods?.features || []
  const storySteps = buildStorySteps(stats)
  const openSpace = dataset.openSpace?.features || []

  const currentViewId = getStoryViewId(activeStepId, storySteps)
  const currentView = VIEW_PRESETS[currentViewId] || VIEW_PRESETS.overview
  const deferredHoveredName = useDeferredValue(hoveredName)
  const activeName = selectedName || deferredHoveredName
  const heatStatsAvailable = Boolean(stats?.heatStatsAvailable)

  if (dataset.loading) {
    return (
      <main className="app-shell loading-shell">
        <div className="status-card">
          <p className="eyebrow">Loading</p>
          <h1>The Thermal Divide</h1>
          <p>Preparing the Boston neighborhood map.</p>
        </div>
      </main>
    )
  }

  if (dataset.error) {
    return (
      <main className="app-shell loading-shell">
        <div className="status-card error">
          <p className="eyebrow">Data Error</p>
          <h1>Unable to load the map assets</h1>
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
            activeStepId={activeStepId}
            onStepChange={(stepId) => {
              startTransition(() => {
                setActiveStepId(stepId)
              })
            }}
            relationships={
              <ComparisonChart
                embedded
                neighborhoods={neighborhoods}
                heatStatsAvailable={heatStatsAvailable}
                activeName={activeName}
                onSelectName={(name) => {
                  setSelectedName((current) => (current === name ? null : name))
                }}
              />
            }
          />
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
            onClearSelection={() => setSelectedName(null)}
          />
        </div>
      </div>
    </main>
  )
}
