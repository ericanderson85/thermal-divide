export const VIEW_PRESETS = {
  overview: {
    id: 'overview',
    label: 'Neighborhood Outline',
    mode: 'overview',
    showOpenSpace: true,
    legendTitle: 'Neighborhood geography',
    description:
      'Neighborhood outlines and open-space footprints establish the spatial frame before the temperature layers appear.',
  },
  uhi: {
    id: 'uhi',
    label: 'Urban Heat Island Intensity',
    mode: 'heat',
    heatKey: 'uhi',
    metric: 'uhi_mean_f',
    palette: 'warm',
    kind: 'temperature',
    showOpenSpace: false,
    legendTitle: 'UHII overlay',
    description:
      'Urban Heat Island Intensity compares local air temperature with the rural baseline and surfaces the neighborhoods that stay hottest the longest.',
  },
  day3pm: {
    id: 'day3pm',
    label: 'Daytime Air Temperature (3PM)',
    mode: 'heat',
    heatKey: 'day3pm',
    metric: 'day_3pm_mean_f',
    palette: 'warm',
    kind: 'temperature',
    showOpenSpace: false,
    legendTitle: '3PM heat overlay',
    description:
      'Modeled mid-afternoon temperature reveals where Boston absorbs the most daytime heat on hot-weather afternoons.',
  },
  night3am: {
    id: 'night3am',
    label: 'Nighttime Air Temperature (3AM)',
    mode: 'heat',
    heatKey: 'night3am',
    metric: 'night_3am_mean_f',
    palette: 'sunset',
    kind: 'temperature',
    showOpenSpace: false,
    legendTitle: '3AM heat overlay',
    description:
      'Nighttime temperature shows where cooling lags after sunset, a key signal for overnight recovery and health risk.',
  },
  duration: {
    id: 'duration',
    label: 'Heat Event Duration',
    mode: 'heat',
    heatKey: 'duration',
    metric: 'heat_duration_mean',
    palette: 'sunset',
    kind: 'hours',
    showOpenSpace: false,
    legendTitle: 'Heat duration overlay',
    description:
      'Heat-event duration approximates how long extreme heat persists across the city, not just how hot it gets at one moment.',
  },
  canopy: {
    id: 'canopy',
    label: 'Tree Canopy',
    mode: 'choropleth',
    metric: 'canopy_pct',
    palette: 'greens',
    kind: 'percentPoints',
    showOpenSpace: true,
    legendTitle: 'Tree canopy (%)',
    description:
      'Tree canopy is the clearest cooling asset in the dataset, especially where parks and street trees cluster together.',
  },
  impervious: {
    id: 'impervious',
    label: 'Impervious Surface',
    mode: 'choropleth',
    metric: 'impervious_pct',
    palette: 'slate',
    kind: 'percentPoints',
    showOpenSpace: false,
    legendTitle: 'Impervious cover (%)',
    description:
      'Impervious cover highlights the paved and built surfaces that trap and reradiate heat back into the neighborhood.',
  },
  income: {
    id: 'income',
    label: 'Median Household Income',
    mode: 'choropleth',
    metric: 'median_household_income',
    palette: 'income',
    kind: 'currency',
    showOpenSpace: false,
    legendTitle: 'Median household income',
    description:
      'Income is used here as one equity lens for asking who has access to cooler landscapes and who does not.',
  },
  poverty: {
    id: 'poverty',
    label: 'Poverty Rate',
    mode: 'choropleth',
    metric: 'poverty_rate',
    palette: 'warm',
    kind: 'share',
    showOpenSpace: false,
    legendTitle: 'Poverty rate',
    description:
      'Poverty rate helps show where economic vulnerability overlaps with lower cooling capacity and higher heat exposure.',
  },
  white: {
    id: 'white',
    label: 'White Population Share',
    mode: 'choropleth',
    metric: 'white_pct',
    palette: 'blue',
    kind: 'share',
    showOpenSpace: false,
    legendTitle: 'White residents (%)',
    description: 'Racial composition is included to help connect the physical city to long-standing patterns of uneven investment.',
  },
  black: {
    id: 'black',
    label: 'Black Population Share',
    mode: 'choropleth',
    metric: 'black_pct',
    palette: 'purple',
    kind: 'share',
    showOpenSpace: false,
    legendTitle: 'Black residents (%)',
    description: 'Racial composition is included to help connect the physical city to long-standing patterns of uneven investment.',
  },
  hispanic: {
    id: 'hispanic',
    label: 'Hispanic Population Share',
    mode: 'choropleth',
    metric: 'hispanic_pct',
    palette: 'sunset',
    kind: 'share',
    showOpenSpace: false,
    legendTitle: 'Hispanic residents (%)',
    description: 'Racial composition is included to help connect the physical city to long-standing patterns of uneven investment.',
  },
  asian: {
    id: 'asian',
    label: 'Asian Population Share',
    mode: 'choropleth',
    metric: 'asian_pct',
    palette: 'teal',
    kind: 'share',
    showOpenSpace: false,
    legendTitle: 'Asian residents (%)',
    description: 'Racial composition is included to help connect the physical city to long-standing patterns of uneven investment.',
  },
  disabled: {
    id: 'disabled',
    label: 'Residents With A Disability',
    mode: 'choropleth',
    metric: 'disabled_share',
    palette: 'warm',
    kind: 'share',
    showOpenSpace: false,
    legendTitle: 'Disability share',
    description: 'Disability share adds one dimension of social vulnerability that can increase risk during heat events.',
  },
  older: {
    id: 'older',
    label: 'Older Adult Share',
    mode: 'choropleth',
    metric: 'older_share',
    palette: 'warm',
    kind: 'share',
    showOpenSpace: false,
    legendTitle: 'Older adults (%)',
    description: 'Older residents face higher risk during prolonged heat, especially where overnight cooling is limited.',
  },
  lep: {
    id: 'lep',
    label: 'Limited English Proficiency',
    mode: 'choropleth',
    metric: 'lep_share',
    palette: 'warm',
    kind: 'share',
    showOpenSpace: false,
    legendTitle: 'LEP share',
    description: 'Limited English proficiency is included as a communication and access vulnerability during climate emergencies.',
  },
  poc: {
    id: 'poc',
    label: 'People Of Color Share',
    mode: 'choropleth',
    metric: 'poc_share',
    palette: 'warm',
    kind: 'share',
    showOpenSpace: false,
    legendTitle: 'Residents of color (%)',
    description:
      'This layer aggregates racialized exposure and investment patterns into a single view of who is more likely to live in hotter landscapes.',
  },
}

export const LAYER_OPTIONS = [
  'overview',
  'uhi',
  'day3pm',
  'night3am',
  'duration',
  'canopy',
  'impervious',
  'income',
  'poverty',
  'white',
  'black',
  'hispanic',
  'asian',
  'disabled',
  'older',
  'lep',
  'poc',
].map((key) => ({
  value: key,
  label: VIEW_PRESETS[key].label,
}))

export const COMPARISON_OPTIONS = ['uhi', 'day3pm', 'night3am', 'duration'].map((key) => ({
  value: key,
  label: VIEW_PRESETS[key].label,
}))

function highlightLine(label, feature) {
  if (!feature) {
    return `${label} will populate once the data loads.`
  }
  return `${label}: ${feature.name}.`
}

export function buildStorySteps(stats) {
  return [
    {
      id: 'overview',
      step: 'Step 1',
      title: 'Boston reads as one city, but not one landscape',
      view: 'overview',
      body:
        'Start with the 26 official neighborhood polygons and the open-space footprint. This is the geographic frame for the story before temperature and equity layers begin to split the map apart.',
    },
    {
      id: 'heat',
      step: 'Step 2',
      title: 'Heat is not uniform once the city resolves into neighborhoods',
      view: 'uhi',
      body: stats?.heatConfigured
        ? `${highlightLine('Highest average UHI in the current output', stats?.highlights?.highestUhi)} The official Boston heat surfaces are now live in the map, and the neighborhood summaries are sampled from those same published tiles.`
        : 'The workspace includes the Climate Ready Boston heat layer packages, but not the final exported tile or raster URLs. The app is wired for them already; add heat-layer-urls.json and rerun the data build to activate this scene.',
    },
    {
      id: 'green',
      step: 'Step 3',
      title: 'Canopy and pavement make the thermal divide legible',
      view: 'canopy',
      body: `${highlightLine('Highest canopy in the current output', stats?.highlights?.highestCanopy)} ${highlightLine('Most impervious neighborhood', stats?.highlights?.mostImpervious)} The contrast between shade and sealed surfaces helps explain why some places cool down faster than others.`,
    },
    {
      id: 'income',
      step: 'Step 4',
      title: 'Cooling capacity and income do not distribute evenly',
      view: 'income',
      body: `${highlightLine('Lowest median household income among ACS-covered neighborhoods', stats?.highlights?.lowestIncome)} Four neighborhoods still show as ACS no-data because the workbook does not include them: ${stats?.acsMissing?.join(', ') || 'none'}.`,
    },
    {
      id: 'comparison',
      step: 'Step 5',
      title: 'The pattern sharpens when heat, canopy, and vulnerability are compared directly',
      view: 'uhi',
      body: stats?.heatStatsAvailable
        ? `${highlightLine('Warmest overnight neighborhood', stats?.highlights?.warmestNight)} The final scene shifts from one map at a time to a direct neighborhood comparison of canopy against heat, with poverty still visible as context.`
        : 'Until neighborhood-level heat summaries are generated, the comparison chart falls back to canopy versus income, with poverty used as the point color. The chart is already ready to switch once those heat values exist.',
    },
  ]
}

export function getStoryViewId(stepId, steps) {
  const current = steps.find((step) => step.id === stepId)
  return current?.view || 'overview'
}
