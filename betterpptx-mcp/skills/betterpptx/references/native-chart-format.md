# Native chart format with typed controls

Choose a chart type as a starting family, then author its independent native format controls. Discover `chartPreset` before writing a spec: the catalog exposes nine chart families and the complete 54-parameter union, including legends, titles, data labels, colors/opacity, axes, gridlines, line symbols/smoothing, pie/doughnut angle and hole size, chart/plot area fill and border, and 3-D rotation/perspective/gap/overlap controls.

Chart type and manual options have deterministic precedence: the selected chart family supplies defaults, then explicit `chartOptions` fields replace only their named components. Omitted values retain the family default. Set a manual field or component to `null` to remove the override and restore the selected chart-type default; use dryRun after reset and re-edit.

Use semantic data with stable names and public verification evidence. Do not provide coordinates or private source paths. The proof boundary is fresh catalog discovery, JSON-spec upload, mutation-free dryRun, commit, quality, preview, save, numeric upper-bound rejection, package inspection, and PowerPoint Open2007/SaveCopyAs/reopen/render. The catalog remains structured-partial where a chart-specific Office setter or canonicalization has not been proven; never invent an unadvertised slider.
