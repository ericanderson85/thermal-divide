Here is a proposal sketch for a project titled "The Thermal Divide: Visualizing Urban Heat Islands and Green Equity in Boston."

Title: The Thermal Divide: Visualizing Urban Heat Islands and Green Equity in Boston

Abstract: This project explores the correlation between urban heat island (UHI) effects and the distribution of green spaces across Boston neighborhoods. Using satellite temperature data and city-level vegetation indices, this interactive data story aims to visualize how "gray infrastructure" (concrete and asphalt) disproportionately affects lower-income areas. The goal is to provide a compelling narrative on environmental equity, allowing users to toggle between temperature gradients and neighborhood socioeconomic data to see the "hidden" climate reality of the city.

Description
Introduction: Boston’s "emerald necklace" of parks is world-famous, but its cooling benefits are not distributed equally. As global temperatures rise, the urban heat island effect—where city centers are significantly warmer than surrounding areas—becomes a critical public health issue.

Motivation: While some neighborhoods enjoy lush canopy cover, others consist almost entirely of heat-retaining surfaces. Visualizing this data helps bridge the gap between abstract climate science and the lived experience of Boston residents.

Project Plan: I will develop a "scrollytelling" web application. As the user scrolls, the map of Boston will transition from a standard geographic view to a thermal heat map, eventually layering in data on tree canopy density and income levels to highlight disparities.

Data Wrangling: I will use Python (Pandas/GeoPandas) to join disparate datasets by census tract and normalize temperature values for consistent visualization.

Proposed Technologies and Plan
Frameworks: React.js for the application structure and D3.js for the complex geospatial visualizations and transitions.

Mapping: Mapbox GL JS or Leaflet for rendering the base geographic layers.

Development Steps:

Clean and merge thermal and canopy datasets in Python.

Implement the base D3 map with GeoJSON neighborhood boundaries.

Develop the interactive layering system (Heat vs. Greenery vs. Income).

Write the narrative "story" elements to guide the user through the data points. For now, these can be labels for the intended story element as placeholders

# Datasets:
1. Heat & Temperature Data
This is the core "story" data from the 2022 Heat Resilience Plan.

Dataset Name: Extreme Heat Data - Climate Ready Boston

What’s inside: Surface temperature and air temperature data (daytime and nighttime) from a city-wide heat mapping study.

Why use it: It includes the Urban Heat Island (UHI) Index, which is exactly what you need to show which areas are "hot spots."

2. Tree Canopy & Greenery Data
To compare heat against green infrastructure, use the most recent canopy assessment.

Dataset Name: 2019 - 2024 Tree Canopy Assessment

What’s inside: High-resolution LiDAR data showing tree crowns, land cover, and percentage of canopy change by neighborhood.

Bulk Download: You can find the raw geospatial files (SHP/GeoJSON) on the Analyze Boston Canopy page.

3. Socioeconomic & Equity Data
This allows you to layer "Equity" onto the map by showing where lower-income or vulnerable populations live.

Dataset Name: Neighborhood Demographics (ACS)

What’s inside: 5-year American Community Survey (ACS) data including median household income, poverty rates, and race.

Dataset Name: Climate Ready Boston Social Vulnerability

What’s inside: A pre-calculated index of which neighborhoods are most at risk due to socioeconomic factors.

4. Geographic Boundaries (The "Basemap")
You will need these files to tell D3.js or Mapbox where the neighborhood lines are drawn.

Dataset Name: Boston Neighborhood Boundaries

Format: Select GeoJSON for the easiest integration with React and D3.

Dataset Name: Open Space

Format: GeoJSON. This maps out every actual park and playground in the city.

