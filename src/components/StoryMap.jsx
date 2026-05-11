import { useEffect, useEffectEvent, useMemo, useRef } from 'react'
import * as d3 from 'd3'
import L from 'leaflet'
import {
  formatCurrency,
  formatHours,
  formatPercent,
  formatPercentPoints,
  formatTemperature,
  formatValueForView,
} from '../utils/formatters'

const BASE_TILE_URL = 'https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png'
const BASE_TILE_ATTRIBUTION = '&copy; OpenStreetMap contributors &copy; CARTO'

function createLayerState() {
  return {
    heat: null,
    neighborhoods: null,
    openSpace: null,
    activeHeatKey: null,
    openSpaceVisible: false,
  }
}

function getInterpolator(palette) {
  switch (palette) {
    case 'greens':
      return d3.interpolateYlGn
    case 'slate':
      return d3.interpolateGreys
    case 'income':
      return d3.interpolatePuBuGn
    case 'blue':
      return d3.interpolateBlues
    case 'purple':
      return d3.interpolateBuPu
    case 'teal':
      return d3.interpolateGnBu
    case 'sunset':
      return d3.interpolateYlOrBr
    case 'warm':
    default:
      return d3.interpolateYlOrRd
  }
}

function createScale(values, palette) {
  const extent = d3.extent(values)
  if (extent[0] == null || extent[1] == null) {
    return null
  }
  const min = extent[0]
  const max = extent[1] === extent[0] ? extent[1] + 1 : extent[1]
  return d3.scaleSequential([min, max], getInterpolator(palette))
}

function getViewValues(neighborhoods, view) {
  if (!view.metric) {
    return []
  }
  return neighborhoods
    .map((feature) => feature.properties[view.metric])
    .filter((value) => value != null)
}

function styleNeighborhood(feature, view, scale, activeName, selectedName) {
  const name = feature.properties.name
  const isActive = name === activeName || name === selectedName

  if (view.mode === 'overview') {
    return {
      color: isActive ? '#162433' : '#516171',
      weight: isActive ? 2.8 : 1.2,
      fillOpacity: 0.06,
      fillColor: '#fdf6ee',
    }
  }

  const value = view.metric ? feature.properties[view.metric] : null
  const hasValue = value != null && scale

  if (view.mode === 'heat') {
    return {
      color: isActive ? '#101827' : '#5e4a40',
      weight: isActive ? 2.8 : 1.15,
      fillColor: hasValue ? scale(value) : '#e4d7cb',
      fillOpacity: hasValue ? (isActive ? 0.46 : 0.28) : 0.12,
      dashArray: hasValue ? null : '4 6',
    }
  }

  if (!hasValue) {
    return {
      color: isActive ? '#18212f' : '#64748b',
      weight: isActive ? 2.6 : 1.2,
      fillColor: '#d6d9df',
      fillOpacity: 0.35,
      dashArray: '4 6',
    }
  }

  return {
    color: isActive ? '#0f172a' : '#314154',
    weight: isActive ? 2.7 : 1.1,
    fillColor: scale(value),
    fillOpacity: isActive ? 0.92 : 0.82,
  }
}

function buildLegend(view, neighborhoods, heatLayer) {
  if (view.mode === 'overview') {
    return {
      title: view.legendTitle,
      items: [
        { color: '#5eb37e', label: 'Open space footprint' },
        { color: '#8f99a7', label: 'Neighborhood outlines' },
      ],
      note: null,
    }
  }

  const values = getViewValues(neighborhoods, view)
  if (!values.length) {
    return {
      title: view.legendTitle,
      items: [{ color: '#d6d9df', label: 'No values available' }],
      note: null,
    }
  }

  const [min, max] = d3.extent(values)
  const scale = createScale(values, view.palette)
  const steps = d3.range(0, 5).map((step) => {
    const ratio = step / 4
    const value = min + (max - min) * ratio
    return {
      color: scale(value),
      label: formatValueForView(view, value),
    }
  })

  let note = 'Gray = no data'
  if (view.mode === 'heat' && heatLayer?.tileUrl) {
    note = 'Overlay shows the official heat tiles; polygon color summarizes neighborhood averages.'
  }

  return {
    title: view.legendTitle,
    items: steps,
    note,
  }
}

function neighborhoodDetails(properties) {
  if (!properties) {
    return []
  }
  return [
    ['Urban heat island', formatTemperature(properties.uhi_mean_f)],
    ['3PM temperature', formatTemperature(properties.day_3pm_mean_f)],
    ['3AM temperature', formatTemperature(properties.night_3am_mean_f)],
    ['Heat duration', formatHours(properties.heat_duration_mean)],
    ['Tree canopy', formatPercentPoints(properties.canopy_pct, 1)],
    ['Impervious surface', formatPercentPoints(properties.impervious_pct, 1)],
    ['Median income', formatCurrency(properties.median_household_income)],
    ['Poverty rate', formatPercent(properties.poverty_rate)],
    ['Disability share', formatPercent(properties.disabled_share)],
    ['Open-space acres', properties.open_space_acres == null ? 'No data' : `${properties.open_space_acres.toFixed(1)} ac`],
  ]
}

export default function StoryMap({
  neighborhoods,
  openSpace,
  stats,
  view,
  activeName,
  selectedName,
  onHoverName,
  onSelectName,
}) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const layersRef = useRef(createLayerState())
  const selectionReadyRef = useRef(false)
  const previousSelectedNameRef = useRef(null)

  const handleHoverName = useEffectEvent(onHoverName)
  const handleSelectName = useEffectEvent(onSelectName)

  const activeFeature = useMemo(
    () =>
      neighborhoods.find((feature) => feature.properties.name === selectedName) ||
      neighborhoods.find((feature) => feature.properties.name === activeName) ||
      null,
    [activeName, neighborhoods, selectedName],
  )

  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return
    }

    let resizeFrame = null
    const map = L.map(containerRef.current, {
      zoomControl: false,
      attributionControl: true,
      scrollWheelZoom: false,
    })

    map.createPane('heatPane')
    map.getPane('heatPane').style.zIndex = '260'
    map.createPane('openSpacePane')
    map.getPane('openSpacePane').style.zIndex = '360'
    map.createPane('boundaryPane')
    map.getPane('boundaryPane').style.zIndex = '420'

    L.control.zoom({ position: 'topright' }).addTo(map)
    L.tileLayer(BASE_TILE_URL, {
      attribution: BASE_TILE_ATTRIBUTION,
      opacity: 0.88,
    }).addTo(map)

    if (stats?.mapBounds) {
      map.fitBounds(stats.mapBounds, { padding: [24, 24] })
      selectionReadyRef.current = true
    }

    const syncMapSize = () => {
      if (resizeFrame != null) {
        cancelAnimationFrame(resizeFrame)
      }
      resizeFrame = requestAnimationFrame(() => {
        resizeFrame = null
        map.invalidateSize(false)
      })
    }

    const resizeObserver = new ResizeObserver(syncMapSize)
    resizeObserver.observe(containerRef.current)
    window.addEventListener('resize', syncMapSize)
    syncMapSize()

    mapRef.current = map

    return () => {
      if (resizeFrame != null) {
        cancelAnimationFrame(resizeFrame)
      }
      window.removeEventListener('resize', syncMapSize)
      resizeObserver.disconnect()
      map.remove()
      mapRef.current = null
      layersRef.current = createLayerState()
      selectionReadyRef.current = false
      previousSelectedNameRef.current = null
    }
  }, [stats])

  useEffect(() => {
    const map = mapRef.current
    const currentLayers = layersRef.current
    if (!map || !neighborhoods.length || currentLayers.neighborhoods) {
      return
    }

    currentLayers.neighborhoods = L.geoJSON(neighborhoods, {
      pane: 'boundaryPane',
      onEachFeature: (feature, layer) => {
        const name = feature.properties.name
        layer.on({
          mouseover: () => handleHoverName?.(name),
          mouseout: () => handleHoverName?.(null),
          click: () => handleSelectName?.(name),
        })
      },
    }).addTo(map)
  }, [handleHoverName, handleSelectName, neighborhoods])

  useEffect(() => {
    const map = mapRef.current
    const currentLayers = layersRef.current
    if (!map || !openSpace.length || currentLayers.openSpace) {
      return
    }

    const openSpaceLayer = L.geoJSON(openSpace, {
      pane: 'openSpacePane',
      style: {
        color: '#1f6a46',
        weight: 0.65,
        fillColor: '#69bc7e',
        fillOpacity: 0.28,
      },
      interactive: false,
    })
    currentLayers.openSpace = openSpaceLayer

    if (view.showOpenSpace) {
      openSpaceLayer.addTo(map)
      currentLayers.openSpaceVisible = true
    }
  }, [openSpace, view.showOpenSpace])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !selectionReadyRef.current) {
      return
    }
    if (!selectedName) {
      if (previousSelectedNameRef.current && stats?.mapBounds) {
        map.flyToBounds(stats.mapBounds, {
          padding: [24, 24],
          duration: 0.55,
        })
      }
      previousSelectedNameRef.current = null
      return
    }
    const selectedFeature = neighborhoods.find((feature) => feature.properties.name === selectedName)
    if (!selectedFeature) {
      return
    }
    const layer = L.geoJSON(selectedFeature)
    const bounds = layer.getBounds()
    layer.remove()
    if (bounds.isValid()) {
      map.flyToBounds(bounds, {
        padding: [70, 70],
        duration: 0.6,
        maxZoom: 13,
      })
      previousSelectedNameRef.current = selectedName
    }
  }, [neighborhoods, selectedName, stats])

  useEffect(() => {
    const map = mapRef.current
    const currentLayers = layersRef.current
    if (!map) {
      return
    }

    const heatLayer = stats?.heatLayers?.[view.heatKey]
    const nextHeatKey = view.mode === 'heat' && heatLayer?.tileUrl ? view.heatKey : null
    if (currentLayers.activeHeatKey !== nextHeatKey) {
      currentLayers.heat?.remove()
      currentLayers.heat = null
      currentLayers.activeHeatKey = nextHeatKey

      if (nextHeatKey) {
        if (heatLayer.mode === 'image') {
          currentLayers.heat = L.imageOverlay(heatLayer.tileUrl, heatLayer.bounds, {
            opacity: 0.72,
            pane: 'heatPane',
          })
        } else {
          currentLayers.heat = L.tileLayer(heatLayer.tileUrl, {
            opacity: 0.7,
            attribution: heatLayer.attribution || '',
            pane: 'heatPane',
          })
        }
        currentLayers.heat.addTo(map)
      }
    }

    if (currentLayers.openSpace) {
      if (view.showOpenSpace && !currentLayers.openSpaceVisible) {
        currentLayers.openSpace.addTo(map)
        currentLayers.openSpaceVisible = true
      } else if (!view.showOpenSpace && currentLayers.openSpaceVisible) {
        currentLayers.openSpace.remove()
        currentLayers.openSpaceVisible = false
      }
    }
  }, [stats, view])

  useEffect(() => {
    const currentLayers = layersRef.current
    if (!currentLayers.neighborhoods) {
      return
    }

    const values = getViewValues(neighborhoods, view)
    const scale = values.length ? createScale(values, view.palette) : null

    currentLayers.neighborhoods.setStyle((feature) =>
      styleNeighborhood(feature, view, scale, activeName, selectedName),
    )

    currentLayers.neighborhoods.eachLayer((layer) => {
      const isHighlighted =
        layer.feature?.properties?.name === selectedName ||
        layer.feature?.properties?.name === activeName
      if (isHighlighted) {
        layer.bringToFront()
      }
    })
  }, [activeName, neighborhoods, selectedName, view])

  useEffect(() => {
    return () => {
      const currentLayers = layersRef.current
      currentLayers.heat?.remove()
      currentLayers.neighborhoods?.remove()
      currentLayers.openSpace?.remove()
      layersRef.current = createLayerState()
    }
  }, [])

  const heatLayer = stats?.heatLayers?.[view.heatKey]
  const legend = buildLegend(view, neighborhoods, heatLayer)
  return (
    <div className="map-card">
      <div className="map-stage" ref={containerRef} />

      <div className="map-caption">
        <p className="eyebrow">Map View</p>
        <h3>{view.label}</h3>
        <p>{view.description}</p>
        {view.mode === 'heat' ? (
          <p className="inline-note">
            Official Boston heat tiles are shown as the backdrop. Neighborhood
            fills use the sampled neighborhood summary values derived from the
            same services.
          </p>
        ) : null}
      </div>

      <div className="map-legend">
        <p className="legend-title">{legend.title}</p>
        <div className="legend-items">
          {legend.items.map((item) => (
            <div className="legend-item" key={`${item.label}-${item.color}`}>
              <span className="legend-swatch" style={{ background: item.color }} />
              <span>{item.label}</span>
            </div>
          ))}
        </div>
        {legend.note ? <p className="legend-footnote">{legend.note}</p> : null}
      </div>

      <div className="map-info">
        <p className="eyebrow">Neighborhood</p>
        <h3>{activeFeature?.properties?.name || 'Hover a place'}</h3>
        {activeFeature?.properties?.acs_available === false ? (
          <p className="inline-note">ACS metrics are unavailable for this neighborhood.</p>
        ) : null}
        <dl>
          {neighborhoodDetails(activeFeature?.properties).map(([label, value]) => (
            <div key={label} className="info-row">
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  )
}
