import { useEffect, useRef } from 'react'
import * as d3 from 'd3'
import {
  formatCurrency,
  formatPercent,
  formatPercentPoints,
  formatTemperature,
} from '../utils/formatters'

const MARGIN = { top: 24, right: 20, bottom: 62, left: 72 }
const WIDTH = 520
const HEIGHT = 310

function axisFormatter(kind) {
  if (kind === 'share') {
    return (value) => `${Math.round(value * 100)}%`
  }
  if (kind === 'currency') {
    return (value) => `$${Math.round(value / 1000)}k`
  }
  if (kind === 'temperature') {
    return (value) => `${Math.round(value)}°`
  }
  if (kind === 'percentPoints') {
    return (value) => `${Math.round(value)}%`
  }
  return (value) => value
}

function formatMetric(kind, value) {
  if (kind === 'share') {
    return formatPercent(value)
  }
  if (kind === 'currency') {
    return formatCurrency(value)
  }
  if (kind === 'temperature') {
    return formatTemperature(value)
  }
  if (kind === 'percentPoints') {
    return formatPercentPoints(value, 1)
  }
  return value == null ? 'No data' : String(value)
}

function paddedDomain(values, kind) {
  const [min, max] = d3.extent(values)
  if (min == null || max == null) {
    return [0, 1]
  }
  const span = max - min || 1
  const padding = span * 0.08
  const lower = kind === 'share' || kind === 'percentPoints' ? Math.max(0, min - padding) : min - padding
  return [lower, max + padding]
}

function linearRegression(points) {
  if (points.length < 2) {
    return null
  }
  const meanX = d3.mean(points, (point) => point.x)
  const meanY = d3.mean(points, (point) => point.y)
  const numerator = d3.sum(points, (point) => (point.x - meanX) * (point.y - meanY))
  const denominator = d3.sum(points, (point) => (point.x - meanX) ** 2)
  if (!denominator) {
    return null
  }
  const slope = numerator / denominator
  const intercept = meanY - slope * meanX
  const xExtent = d3.extent(points, (point) => point.x)
  return xExtent.map((x) => [x, intercept + slope * x])
}

function RelationshipPlot({ config, neighborhoods, activeName, onSelectName }) {
  const svgRef = useRef(null)
  const pointHandlerRef = useRef(onSelectName)
  pointHandlerRef.current = onSelectName

  const points = neighborhoods
    .map((feature) => ({
      name: feature.properties.name,
      x: feature.properties[config.xMetric],
      y: feature.properties[config.yMetric],
      properties: feature.properties,
    }))
    .filter((point) => point.x != null && point.y != null)

  useEffect(() => {
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    if (!points.length) {
      return
    }

    const xScale = d3
      .scaleLinear()
      .domain(paddedDomain(points.map((point) => point.x), config.xKind))
      .nice()
      .range([MARGIN.left, WIDTH - MARGIN.right])

    const yScale = d3
      .scaleLinear()
      .domain(paddedDomain(points.map((point) => point.y), config.yKind))
      .nice()
      .range([HEIGHT - MARGIN.bottom, MARGIN.top])

    const root = svg
      .attr('viewBox', `0 0 ${WIDTH} ${HEIGHT}`)
      .attr('role', 'img')
      .attr('aria-label', config.title)

    root
      .append('g')
      .attr('transform', `translate(0,${HEIGHT - MARGIN.bottom})`)
      .call(d3.axisBottom(xScale).ticks(5).tickFormat(axisFormatter(config.xKind)))
      .call((group) => group.select('.domain').attr('stroke', '#83909d'))
      .call((group) => group.selectAll('line').attr('stroke', '#d8dee4'))
      .call((group) =>
        group.selectAll('text').attr('fill', '#506072').attr('font-size', 14),
      )

    root
      .append('g')
      .attr('transform', `translate(${MARGIN.left},0)`)
      .call(d3.axisLeft(yScale).ticks(5).tickFormat(axisFormatter(config.yKind)))
      .call((group) => group.select('.domain').attr('stroke', '#83909d'))
      .call((group) => group.selectAll('line').attr('stroke', '#d8dee4'))
      .call((group) =>
        group.selectAll('text').attr('fill', '#506072').attr('font-size', 14),
      )

    const regressionData = linearRegression(points)
    if (regressionData?.length) {
      root
        .append('path')
        .datum(regressionData)
        .attr('fill', 'none')
        .attr('stroke', '#24353f')
        .attr('stroke-width', 2)
        .attr('stroke-dasharray', '6 5')
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
      .attr('cx', (point) => xScale(point.x))
      .attr('cy', (point) => yScale(point.y))
      .attr('r', (point) => (point.name === activeName ? 7.5 : 5.2))
      .attr('fill', (point) => (point.name === activeName ? '#c75d3e' : '#6f8792'))
      .attr('stroke', '#fff')
      .attr('stroke-width', (point) => (point.name === activeName ? 2.3 : 1.4))
      .attr('opacity', (point) => (activeName && point.name !== activeName ? 0.55 : 0.9))
      .style('cursor', 'pointer')
      .on('click', (_, point) => {
        pointHandlerRef.current?.(point.name)
      })
      .append('title')
      .text(
        (point) =>
          `${point.name}\n${config.xLabel}: ${formatMetric(config.xKind, point.x)}\n${config.yLabel}: ${formatMetric(config.yKind, point.y)}`,
      )

    root
      .append('text')
      .attr('x', WIDTH / 2)
      .attr('y', HEIGHT - 10)
      .attr('text-anchor', 'middle')
      .attr('fill', '#334155')
      .attr('font-size', 16)
      .attr('font-weight', 650)
      .text(config.xLabel)

    root
      .append('text')
      .attr('transform', `translate(17,${HEIGHT / 2}) rotate(-90)`)
      .attr('text-anchor', 'middle')
      .attr('fill', '#334155')
      .attr('font-size', 16)
      .attr('font-weight', 650)
      .text(config.yLabel)
  }, [activeName, config, points])

  return (
    <div className="relationship-plot">
      <h4>{config.title}</h4>
      <svg ref={svgRef} className="relationship-svg" />
    </div>
  )
}

export default function ComparisonChart({
  embedded = false,
  neighborhoods,
  heatStatsAvailable,
  activeName,
  onSelectName,
}) {
  const configs = heatStatsAvailable
    ? [
        {
          id: 'canopy-heat',
          title: 'Tree canopy vs heat island',
          xMetric: 'canopy_pct',
          xKind: 'percentPoints',
          xLabel: 'Tree canopy',
          yMetric: 'uhi_mean_f',
          yKind: 'temperature',
          yLabel: 'Heat island',
        },
        {
          id: 'poverty-heat',
          title: 'Poverty rate vs heat island',
          xMetric: 'poverty_rate',
          xKind: 'share',
          xLabel: 'Poverty rate',
          yMetric: 'uhi_mean_f',
          yKind: 'temperature',
          yLabel: 'Heat island',
        },
      ]
    : [
        {
          id: 'income-canopy',
          title: 'Income vs tree canopy',
          xMetric: 'median_household_income',
          xKind: 'currency',
          xLabel: 'Median income',
          yMetric: 'canopy_pct',
          yKind: 'percentPoints',
          yLabel: 'Tree canopy',
        },
      ]

  return (
    <div className={embedded ? 'relationships-inline' : 'chart-card'}>
      <div className="chart-copy">
        <p className="eyebrow">Relationships</p>
        <h3>Neighborhood comparisons</h3>
      </div>

      <div className="relationship-grid">
        {configs.map((config) => (
          <RelationshipPlot
            key={config.id}
            config={config}
            neighborhoods={neighborhoods}
            activeName={activeName}
            onSelectName={onSelectName}
          />
        ))}
      </div>
    </div>
  )
}
