export const VIEW_PRESETS = {
  overview: {
    id: "overview",
    label: "Neighborhood Outline",
    mode: "overview",
    showOpenSpace: true,
    legendTitle: "Neighborhood geography",
    description: "Neighborhood outlines and open-space footprints.",
  },
  uhi: {
    id: "uhi",
    label: "Heat Island Intensity",
    mode: "heat",
    heatKey: "uhi",
    metric: "uhi_mean_f",
    palette: "warm",
    kind: "temperature",
    showOpenSpace: false,
    legendTitle: "UHII overlay",
    description:
      "Modeled urban heat island intensity, summarized by neighborhood.",
  },
  canopy: {
    id: "canopy",
    label: "Tree Canopy",
    mode: "choropleth",
    metric: "canopy_pct",
    palette: "greens",
    kind: "percentPoints",
    showOpenSpace: true,
    legendTitle: "Tree canopy (%)",
    description: "Tree canopy and open-space footprints.",
  },
  poverty: {
    id: "poverty",
    label: "Economic Stress",
    mode: "choropleth",
    metric: "poverty_rate",
    palette: "warm",
    kind: "share",
    showOpenSpace: false,
    legendTitle: "Poverty rate",
    description: "ACS poverty rate by neighborhood.",
  },
};

export function buildStorySteps(stats) {
  return [
    {
      id: "heat",
      step: "01",
      title: "Heat island intensity",
      view: "uhi",
      body: stats?.heatConfigured
        ? "Urban Heat Island Index (UHI) shows how much hotter a neighborhood is compared with surrounding rural areas."
        : "Neighborhood heat summaries are not available yet.",
    },
    {
      id: "green",
      step: "02",
      title: "Tree canopy",
      view: "canopy",
      body: "Tree canopy and open space help cool neighborhoods by providing shade, absorbing less heat than pavement, and giving residents places to recover during hot weather.",
    },
    {
      id: "equity",
      step: "03",
      title: "Poverty rate",
      view: "poverty",
      body: "Poverty rate helps show where residents may have fewer resources to manage extreme heat, from home cooling costs to public infrastructure.",
    },
    {
      id: "relationships",
      step: "04",
      title: "Relationships",
      view: "poverty",
      body: "The graphs compare neighborhoods across heat, tree canopy, income, and poverty to show where environmental conditions and economic vulnerability overlap.",
    },
  ];
}

export function getStoryViewId(stepId, steps) {
  const current = steps.find((step) => step.id === stepId);
  return current?.view || "overview";
}
