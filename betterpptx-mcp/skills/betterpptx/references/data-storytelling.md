# Tell a truthful data story

Begin with the decision the evidence should inform and the claim the data can honestly support. Do not begin with a chart type. Separate measured fact, interpretation, forecast, benchmark, and representative example in both wording and visual treatment.

## Match the visual to the analytical question

Choose an exact executable native treatment yourself after identifying the data shape.

| Analytical question | Strong starting medium | Common failure to avoid |
| --- | --- | --- |
| How did it change over time? | Line, area, slope, or a restrained time-series combination | Too many series, irregular intervals hidden, or trend implied from too few points |
| Which category is larger? | Sorted bar or column chart | Unsorted categories, decorative 3-D distortion, or truncated bars |
| How does composition change? | Stacked or 100% stacked chart with few meaningful parts | Too many segments or totals that cannot be compared |
| What is the distribution? | Histogram, box plot, dot plot, or another supported distribution view | Showing only an average and hiding spread or outliers |
| Are two measures related? | Scatter or bubble chart | Implied causation, unexplained bubble area, or crowded labels |
| What contributed to a total? | Waterfall or bridge view with explicit subtotal and total semantics | Letting a final total render as another incremental step |
| Where do stages lose volume? | Funnel or staged-flow view | Unequal definitions, missing denominators, or decorative widths |
| What are the exact values? | Native table with deliberate hierarchy | Using a chart when precise lookup is the audience's real task |
| Is one number the message? | Native metric or stat composition | Wrapping a sparse value in an unnecessary chart |

Use specialized native chart families only when their semantics fit the question and the public catalog marks the exact choice executable. Prefer a clear two-dimensional view when depth would distort magnitude.

## Make the claim visible

- Write a takeaway title that states the supported insight, not merely the chart type or dataset name. If the slide title already carries the claim, turn the chart's own title off (`chartOptions.showTitle:false`) rather than leaving the default "Chart Title". Hide a redundant single-series legend.
- Create a clear visual question: one focal series, category, threshold, variance, or inflection. Mute context rather than colouring every item equally.
- Label units, period, population, denominator, baseline, and scenario. Keep axis and data-label text readable on the actual chart surface.
- Annotate the important cause, exception, or decision point. Keep annotations concise and visually attached to the relevant evidence.
- Use consistent units, scales, category order, and colour meaning across related slides. Explain any justified scale break or non-zero baseline.
- Show uncertainty, ranges, missingness, or sample limitations when they affect interpretation.

## Build a data argument across slides

Move from headline to evidence to explanation to consequence. A useful sequence may establish the outcome, isolate the driver, compare choices, then name the decision. Avoid repeating the same chart with only a different highlight unless the repetition creates a deliberate reveal.

Combine native evidence with a small interpretive layer: a concise callout, benchmark, source line, or implication. Do not cover the plot with prose or use a dashboard when one decision-focused view would be clearer.

## Preserve truth and editability

- Use verified values and a public `evidenceSource`. Mark illustrative or representative data explicitly; never invent precision.
- Give every meaningful chart or table an `altText` summary that states the key pattern and representative values, not merely “chart” or “table.”
- Keep chart and table typography consistent with the deck's explicit theme, including category labels, axes, data labels, headers, and body text.
- Preserve native data and editability whenever PowerPoint can express the claim. Use a custom representation only for a specific analytical need that native capability cannot express.
- Ensure totals, subtotals, signs, percentages, and units retain their semantics in both the visual and its accessible summary.

The goal is not maximum data density. It is the shortest honest visual path from evidence to understanding and from understanding to decision.
