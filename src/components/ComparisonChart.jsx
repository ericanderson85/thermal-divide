import { useEffect, useRef } from 'react'
import * as d3 from 'd3'
import { COMPARISON_OPTIONS, VIEW_PRESETS } from '../config/views'
import {
  formatPercent,
  formatPercentPoints,
  formatValueForView,
} from '../utils/formatters'

const MARGIN = { top: 18, right: 18, bottom: 52, left: 70 }
const WIDTH = 520
const HEIGHT = 340

function formatMetricValue(metric, value) {
  const view = VIEW_PRESETS[metric]
  return formatValueForView(view, value)
}

function chartDescription(metric) {
  switch (metric) {
    case 'day3pm':
      return 'Hotter daytime neighborhoods rise to the top, while point color still shows poverty rate.'
    case 'night3am':
      return 'Nighttime heat emphasizes neighborhoods that do not cool effectively after sunset.'
    case 'duration':
      return 'Longer heat duration points higher on the chart, helping separate short spikes from persistent exposure.'
    case 'uhi':
    default:
      return 'Urban heat island intensity is compared directly against canopy, while point color still shows poverty rate.'
  }
}

function rankHotspots(points) {
  const hottest = [...points]
    .sort((left, right) => right.y - left.y)
    .slice(0, 3)
  const coolestGreenest = [...points]
    .sort((left, right) => {
      if (right.canopy !== left.canopy) {
        return right.canopy - left.canopy
      }
      return left.y - right.y
    })
    .slice(0, 3)
  return { hottest, coolestGreenest }
}

function linearRegression(points) {
  if (points.length < 2) {
    return null
  }
  const meanX = d3.mean(points, (point) => point.canopy)
  const meanY = d3.mean(points, (point) => point.y)
  const numerator = d3.sum(points, (point) => (point.canopy - meanX) * (point.y - meanY))
  const denominator = d3.sum(points, (point) => (point.canopy - meanX) ** 2)
  if (!denominator) {
    return null
  }
  const slope = numerator / denominator
  const intercept = meanY - slope * meanX
  const xExtent = d3.extent(points, (point) => point.canopy)
  return xExtent.map((x) => [x, intercept + slope * x])
}

export default function ComparisonChart({
  neighborhoods,
  heatStatsAvailable,
  activeName,
  onSelectName,
  comparisonMetric,
  onComparisonMetricChange,
}) {
  const svgRef = useRef(null)
  const pointHandlerRef = useRef(onSelectName)
  pointHandlerRef.current = onSelectName

  const metric = heatStatsAvailable ? comparisonMetric : 'income'
  const metricView = VIEW_PRESETS[metric]

  const points = neighborhoods
    .map((feature) => {
      const props = feature.properties
      return {
        name: props.name,
        canopy: props.canopy_pct,
        y: heatStatsAvailable ? props[metricView.metric] : props.median_household_income,
        color: props.poverty_rate,
      }
    })
    .filter((point) => point.canopy != null && point.y != null)

  const ranked = rankHotspots(points)

  useEffect(() => {
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    if (!points.length) {
      return
    }

    const xExtent = d3.extent(points, (point) => point.canopy)
    const yExtent = d3.extent(points, (point) => point.y)
    const colorExtent = d3.extent(
      points.filter((point) => point.color != null),
      (point) => point.color,
    )

    const xScale = d3
      .scaleLinear()
      .domain([Math.max(0, xExtent[0] - 2), xExtent[1] + 2])
      .range([MARGIN.left, WIDTH - MARGIN.right])

    const yPadding = heatStatsAvailable && metric === 'duration' ? 2 : heatStatsAvailable ? 0.8 : 5000
    const yScale = d3
      .scaleLinear()
      .domain([Math.max(0, yExtent[0] - yPadding), yExtent[1] + yPadding])
      .nice()
      .range([HEIGHT - MARGIN.bottom, MARGIN.top])

    const colorScale = d3
      .scaleSequential(colorExtent, d3.interpolateYlOrRd)
      .unknown('#cfd5dd')

    const root = svg
      .attr('viewBox', `0 0 ${WIDTH} ${HEIGHT}`)
      .attr('role', 'img')
      .attr(
        'aria-label',
        heatStatsAvailable
          ? `Scatterplot comparing neighborhood canopy and ${metricView.label}.`
          : 'Scatterplot comparing neighborhood canopy and income.',
      )

    root
      .append('g')
      .attr('transform', `translate(0,${HEIGHT - MARGIN.bottom})`)
      .call(d3.axisBottom(xScale).ticks(6))
      .call((group) => group.select('.domain').attr('stroke', '#7d8797'))
      .call((group) => group.selectAll('line').attr('stroke', '#d4dae2'))
      .call((group) => group.selectAll('text').attr('fill', '#506072'))

    root
      .append('g')
      .attr('transform', `translate(${MARGIN.left},0)`)
      .call(
        d3.axisLeft(yScale).ticks(6).tickFormat((value) => {
          if (!heatStatsAvailable) {
            return `$${(value / 1000).toFixed(0)}k`
          }
          if (metric === 'duration') {
            return `${value.toFixed(0)}h`
          }
          return `${value.toFixed(0)}°`
        }),
      )
      .call((group) => group.select('.domain').attr('stroke', '#7d8797'))
      .call((group) => group.selectAll('line').attr('stroke', '#d4dae2'))
      .call((group) => group.selectAll('text').attr('fill', '#506072'))

    root
      .append('text')
      .attr('x', WIDTH / 2)
      .attr('y', HEIGHT - 10)
      .attr('text-anchor', 'middle')
      .attr('fill', '#334155')
      .attr('font-size', 12)
      .text('Tree canopy (%)')

    root
      .append('text')
      .attr('transform', `translate(18,${HEIGHT / 2}) rotate(-90)`)
      .attr('text-anchor', 'middle')
      .attr('fill', '#334155')
      .attr('font-size', 12)
      .text(heatStatsAvailable ? metricView.label : 'Median household income')

    const regressionData = linearRegression(points)

    if (regressionData?.length) {
      root
        .append('path')
        .datum(regressionData)
        .attr('fill', 'none')
        .attr('stroke', '#203445')
        .attr('stroke-width', 2)
        .attr('stroke-dasharray', '6 6')
        .attr(
          'd',
          d3
            .line()
            .x((point) => xScale(point[0]))
            .y((point) => yScale(point[1])),
        )
    }

    root
      .append('g')
      .selectAll('circle')
      .data(points)
      .join('circle')
      .attr('cx', (point) => xScale(point.canopy))
      .attr('cy', (point) => yScale(point.y))
      .attr('r', (point) => (point.name === activeName ? 8 : 5.5))
      .attr('fill', (point) => colorScale(point.color))
      .attr('stroke', (point) => (point.name === activeName ? '#111827' : '#fff7ed'))
      .attr('stroke-width', (point) => (point.name === activeName ? 2.5 : 1.4))
      .attr('opacity', 0.94)
      .style('cursor', 'pointer')
      .on('click', (_, point) => {
        pointHandlerRef.current?.(point.name)
      })
      .append('title')
      .text(
        (point) =>
          `${point.name}\nCanopy: ${formatPercentPoints(point.canopy, 1)}\nValue: ${formatMetricValue(metric, point.y)}\nPoverty: ${formatPercent(point.color)}`,
      )
  }, [activeName, heatStatsAvailable, metric, metricView, points])

  return (
    <section className="chart-card">
      <div className="chart-copy">
        <p className="eyebrow">Comparison</p>
        <div className="chart-header">
          <div>
            <h3>{heatStatsAvailable ? 'Canopy against heat' : 'Canopy versus income'}</h3>
            <p>{heatStatsAvailable ? chartDescription(metric) : 'The chart falls back to income only when heat summaries are missing.'}</p>
          </div>
          {heatStatsAvailable ? (
            <div className="metric-toggle" role="tablist" aria-label="Heat comparison metric">
              {COMPARISON_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`metric-pill ${metric === option.value ? 'active' : ''}`}
                  onClick={() => onComparisonMetricChange(option.value)}
                >
                  {option.value === 'day3pm'
                    ? '3PM'
                    : option.value === 'night3am'
                      ? '3AM'
                      : option.value === 'duration'
                        ? 'Duration'
                        : 'UHI'}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {points.length ? (
        <>
          <svg ref={svgRef} className="comparison-svg" />
          <div className="chart-insights">
            <div className="insight-block">
              <span className="insight-label">Highest exposure</span>
              <ul className="insight-list">
                {ranked.hottest.map((point) => (
                  <li key={`hot-${point.name}`}>
                    <strong>{point.name}</strong>
                    <span>{formatMetricValue(metric, point.y)}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="insight-block">
              <span className="insight-label">More canopy, lower heat</span>
              <ul className="insight-list">
                {ranked.coolestGreenest.map((point) => (
                  <li key={`cool-${point.name}`}>
                    <strong>{point.name}</strong>
                    <span>
                      {formatPercentPoints(point.canopy, 1)} canopy
                      {heatStatsAvailable ? `, ${formatMetricValue(metric, point.y)}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </>
      ) : (
        <div className="chart-empty">
          No comparison points are available with the current dataset.
        </div>
      )}
    </section>
  )
}
