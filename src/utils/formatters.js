export function formatCurrency(value) {
  if (value == null) {
    return 'No data'
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value)
}

export function formatNumber(value, digits = 0) {
  if (value == null) {
    return 'No data'
  }
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: digits,
  }).format(value)
}

export function formatPercent(value, digits = 1) {
  if (value == null) {
    return 'No data'
  }
  return `${(value * 100).toFixed(digits)}%`
}

export function formatPercentPoints(value, digits = 1) {
  if (value == null) {
    return 'No data'
  }
  return `${Number(value).toFixed(digits)}%`
}

export function formatTemperature(value, digits = 1) {
  if (value == null) {
    return 'No data'
  }
  return `${Number(value).toFixed(digits)}°F`
}

export function formatHours(value, digits = 1) {
  if (value == null) {
    return 'No data'
  }
  return `${Number(value).toFixed(digits)} hrs`
}

export function formatCompactCurrency(value) {
  if (value == null) {
    return 'No data'
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value)
}

export function formatValueForView(view, value) {
  switch (view?.kind) {
    case 'currency':
      return formatCurrency(value)
    case 'currencyCompact':
      return formatCompactCurrency(value)
    case 'share':
      return formatPercent(value)
    case 'percentPoints':
      return formatPercentPoints(value)
    case 'temperature':
      return formatTemperature(value)
    case 'hours':
      return formatHours(value)
    default:
      return formatNumber(value)
  }
}
