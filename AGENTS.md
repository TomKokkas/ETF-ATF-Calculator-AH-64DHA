# Project Instructions

## General Rule — Input Rounding for SEI Performance Charts

These rules apply to all SEI Performance Charts in this project.

**Core principle: rounding applies exclusively to user inputs, never to digitized chart data.**

### 1. Free Air Temperature (FAT)

- Always ROUND UP (ceiling).
- Round toward positive infinity, including negative temperatures.
- Use the next supported temperature step at or above the user input; an input already on a supported step remains unchanged.
- Determine the increment from the actual, documented input resolution supported by the individual chart, not an arbitrary choice.
- Example for 1°C increments: −15.8°C → −15°C, 24.1°C → 25°C.

### 2. Pressure Altitude (PA)

- Always ROUND OFF to the nearest supported altitude increment.
- Determine the increment from the actual, documented input resolution supported by the individual chart, not an arbitrary choice.
- Example for 100 ft increments:
  - 5,049 ft → 5,000 ft
  - 5,050 ft → 5,100 ft
  - 5,149 ft → 5,100 ft
  - 5,150 ft → 5,200 ft
- Exact halfway values round toward the higher altitude increment.

### 3. Digitization Accuracy and Chart Input Resolution

- Preserve the maximum chart accuracy and detail that can be substantiated by the corresponding PDF.
- Do not apply rounding, decimal-place limits, or artificial resolution reduction during digitization or data storage.
- Each chart may support a different documented input increment (e.g. 100 ft, 200 ft, 500 ft). These are examples, not prescribed increments for any chart.
- Never assume all charts use the same increment or infer an input increment solely from stored coordinate decimal places or numerical evaluation density. If the supported input resolution is unverified, report it for verification rather than inventing a step.
- Do not generate or claim accuracy beyond what the source PDF and verified digitization support. This does not authorize reducing the precision of stored data.
- Treat digitization accuracy, user-input resolution, and displayed-result formatting as three separate concerns. Result formatting must not alter the chart data or determine the input increment.

### 4. Calculation

- Apply the appropriate rounding to user inputs before chart lookup, interpolation, evaluation, or calculation.
- Always use the rounded input values consistently throughout the relevant calculation.
- Evaluate the existing chart using those rounded inputs; leave the curve, Bezier coordinates, and stored data unchanged.
- Display both the original input and the rounded value used wherever rounding is applied, so the calculation can be audited.

### 5. Source Accuracy

- These are project-specific calculator rules, not automatically official SEI procedures.
- Do not modify original SEI chart values to force agreement with examples.
- Any discrepancy between calculated and published values must be reported for verification.

### 6. Figure 5 — Preserve the Continuous Bezier Curve

- Preserve the existing continuous Bezier curve in `data/figure-5-dtrq-dtgt.json`.
- Do not convert it into a table at 100 ft intervals or otherwise reduce its precision.
- Any verified input-rounding increment applies only to the user's Pressure Altitude before evaluating this continuous curve; it does not define the storage resolution of the dataset.
