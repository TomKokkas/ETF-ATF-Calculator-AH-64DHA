function cubicBezier(p0, p1, p2, p3, t) {
    const mt = 1 - t;

    return (
        mt * mt * mt * p0 +
        3 * mt * mt * t * p1 +
        3 * mt * t * t * p2 +
        t * t * t * p3
    );
}


function pointOnBezier(segment, t) {
    const p0 = segment[0];
    const p1 = segment[1];
    const p2 = segment[2];
    const p3 = segment[3];

    return {
        tgtref: cubicBezier(
            p0[0],
            p1[0],
            p2[0],
            p3[0],
            t
        ),

        fat: cubicBezier(
            p0[1],
            p1[1],
            p2[1],
            p3[1],
            t
        )
    };
}


/*
 * Figure 4 chart TGT limit.
 * Common to T701C / T701D-CC / T701D-DC (AH-64).
 */
const FIGURE4_TGT_LIMIT = 866;

/*
 * Hot-side (highest FAT) end point of a curve.
 * FAT is monotonic along every Figure 4 curve,
 * so the extreme lies on a segment end point.
 */
function hotEndOfCurve(curve) {
    let hotEnd = null;

    for (const segment of curve.segments) {

        for (const point of [segment[0], segment[3]]) {

            if (hotEnd === null || point[1] > hotEnd.fat) {
                hotEnd = {
                    tgtref: point[0],
                    fat: point[1]
                };
            }
        }
    }

    return hotEnd;
}


function tgtRefOnCurve(curve, fat) {
    return evaluateFigure4Curve(curve, fat).tgtref;
}

// Classification refers to the existing numeric 866 °C evaluation, not to
// intersection with the differently positioned drawn line in the source PDF.
function evaluateFigure4Curve(curve, fat) {
    const evaluated = raw => ({
        tgtref: Math.min(raw, FIGURE4_TGT_LIMIT),
        limitState: raw >= FIGURE4_TGT_LIMIT ? "mathematical_intersection" : "unlimited"
    });

    /*
     * Beyond the point where the curve meets
     * the chart TGT limit, TGTREF is the limit.
     */
    const hotEnd = hotEndOfCurve(curve);

    if (
        fat >= hotEnd.fat &&
        curve.hot_end_on_tgt_limit === true
    ) {
        const hasNumericIntersection = curve.segments.some(segment =>
            Math.min(segment[0][0], segment[3][0]) <= FIGURE4_TGT_LIMIT &&
            Math.max(segment[0][0], segment[3][0]) >= FIGURE4_TGT_LIMIT
        );
        return {
            tgtref: FIGURE4_TGT_LIMIT,
            limitState: hasNumericIntersection ? "mathematical_intersection" : "source_termination"
        };
    }

    // Solve only inside a source segment. The numerical tolerance below
    // controls solver error; it does not claim this accuracy for the chart.
    for (const segment of curve.segments) {
        const firstFat = segment[0][1];
        const lastFat = segment[3][1];
        if (fat < Math.min(firstFat, lastFat) || fat > Math.max(firstFat, lastFat)) {
            continue;
        }
        const increasing = lastFat > firstFat;
        for (let i = 1; i < segment.length; i++) {
            if (increasing ? segment[i][1] < segment[i - 1][1]
                : segment[i][1] > segment[i - 1][1]) {
                throw new Error("Figure 4 FAT segment is not monotonic.");
            }
        }
        if (fat === firstFat) return evaluated(segment[0][0]);
        if (fat === lastFat) return evaluated(segment[3][0]);

        let lower = 0;
        let upper = 1;
        for (let i = 0; i < 64; i++) {
            const middle = (lower + upper) / 2;
            const point = pointOnBezier(segment, middle);
            if ((point.fat < fat) === increasing) lower = middle;
            else upper = middle;
            const lowerPoint = pointOnBezier(segment, lower);
            const upperPoint = pointOnBezier(segment, upper);
            if (Math.abs(upperPoint.tgtref - lowerPoint.tgtref) <= 1e-9) {
                return evaluated(pointOnBezier(segment, (lower + upper) / 2).tgtref);
            }
        }
        throw new Error("Figure 4 FAT solver did not converge.");
    }
    throw new Error(`No verified Figure 4 result: FAT ${fat} °C is outside the digitized curve at ${curve.pa_ft} ft; no endpoint substitution or extrapolation is available.`);
}


function interpolateLinear(x, x1, y1, x2, y2) {
    if (x1 === x2) {
        return y1;
    }

    const ratio = (x - x1) / (x2 - x1);

    return y1 + ratio * (y2 - y1);
}


function getFigure4BoundingCurves(curves, pressureAltitude) {

    const sortedCurves = [...curves].sort(
        (a, b) => a.pa_ft - b.pa_ft
    );

    const exact = sortedCurves.find(curve => curve.pa_ft === pressureAltitude);
    if (exact) return { lower: exact, upper: exact };

    if (pressureAltitude <= sortedCurves[0].pa_ft) {
        return {
            lower: sortedCurves[0],
            upper: sortedCurves[0]
        };
    }

    const lastCurve = sortedCurves[sortedCurves.length - 1];

    if (pressureAltitude >= lastCurve.pa_ft) {
        return {
            lower: lastCurve,
            upper: lastCurve
        };
    }

    for (let i = 0; i < sortedCurves.length - 1; i++) {

        const lower = sortedCurves[i];
        const upper = sortedCurves[i + 1];

        if (
            pressureAltitude >= lower.pa_ft &&
            pressureAltitude <= upper.pa_ft
        ) {
            return {
                lower,
                upper
            };
        }
    }

    throw new Error("Unable to locate PA curves.");
}


function calculateFigure4TgtRef(
    figure4Data,
    fat,
    pressureAltitude
) {

    if (
        !Number.isFinite(fat) ||
        fat < figure4Data.axes.fat_c.min ||
        fat > figure4Data.axes.fat_c.max
    ) {
        throw new Error(
            `FAT must be between ${figure4Data.axes.fat_c.min} and ${figure4Data.axes.fat_c.max} °C.`
        );
    }

    if (
        !Number.isFinite(pressureAltitude) ||
        pressureAltitude < 0 ||
        pressureAltitude > 10000
    ) {
        throw new Error(
            "Pressure Altitude must be between 0 and 10000 ft."
        );
    }

    const bounds = getFigure4BoundingCurves(
        figure4Data.curves,
        pressureAltitude
    );

    const lowerResult = evaluateFigure4Curve(
        bounds.lower,
        fat
    );
    const lowerTgtRef = lowerResult.tgtref;

    /*
     * Exact PA curve.
     */
    if (bounds.lower.pa_ft === bounds.upper.pa_ft) {

        return {
            status: "available",
            lowerLimitState: lowerResult.limitState,
            upperLimitState: lowerResult.limitState,
            tgtref: lowerTgtRef,

            lowerPA: bounds.lower.pa_ft,
            upperPA: bounds.upper.pa_ft,

            lowerTgtRef: lowerTgtRef,
            upperTgtRef: lowerTgtRef
        };
    }

    const upperResult = evaluateFigure4Curve(
        bounds.upper,
        fat
    );
    const upperTgtRef = upperResult.tgtref;

    /*
     * Interpolate between the two surrounding
     * pressure-altitude curves.
     */
    const tgtref = Math.min(
        interpolateLinear(
            pressureAltitude,

            bounds.lower.pa_ft,
            lowerTgtRef,

            bounds.upper.pa_ft,
            upperTgtRef
        ),
        FIGURE4_TGT_LIMIT
    );

    // Conservative application policy, not an additional SEI procedure.
    // Preserve the old interpolation only as a diagnostic estimate when
    // exactly one neighbouring curve has reached the numeric/source limit.
    const mixedLimit = (lowerResult.limitState !== "unlimited") !==
        (upperResult.limitState !== "unlimited");
    return {
        status: mixedLimit ? "unverified_mixed_limit" : "available",
        tgtref: mixedLimit ? null : tgtref,
        diagnosticTgtRef: mixedLimit ? tgtref : null,
        lowerLimitState: lowerResult.limitState,
        upperLimitState: upperResult.limitState,

        lowerPA: bounds.lower.pa_ft,
        upperPA: bounds.upper.pa_ft,

        lowerTgtRef: lowerTgtRef,
        upperTgtRef: upperTgtRef
    };
}
/*
 * FIGURE 5
 * Determine ΔTRQ / ΔTGT from Pressure Altitude.
 *
 * Figure 5 is stored as cubic Bezier segments.
 */
function calculateFigure5DeltaFactor(figure5Data, pressureAltitude) {
    const nominal = figure5Data.axes.pressure_altitude_ft;
    if (!Number.isFinite(pressureAltitude) || pressureAltitude < nominal.min || pressureAltitude > nominal.max) {
        throw new Error(`Pressure Altitude must be between ${nominal.min} and ${nominal.max} ft for Figure 5.`);
    }
    // Derive actual coverage from the source path, never from nominal axes.
    const first = figure5Data.segments[0][0];
    const last = figure5Data.segments[figure5Data.segments.length - 1][3];
    if (pressureAltitude < first[0] || pressureAltitude > last[0]) {
        return {
            status: "unverified_coverage", factor: null, matchedPA: null,
            coverageMinPA: first[0], coverageMaxPA: last[0]
        };
    }
    for (const segment of figure5Data.segments) {
        if (pressureAltitude < segment[0][0] || pressureAltitude > segment[3][0]) continue;
        for (let i = 1; i < segment.length; i++) {
            if (segment[i][0] < segment[i - 1][0]) throw new Error("Figure 5 PA segment is not monotonic.");
        }
        const resultAt = t => ({
            status: "available",
            factor: cubicBezier(segment[0][1], segment[1][1], segment[2][1], segment[3][1], t),
            matchedPA: cubicBezier(segment[0][0], segment[1][0], segment[2][0], segment[3][0], t)
        });
        if (pressureAltitude === segment[0][0]) return resultAt(0);
        if (pressureAltitude === segment[3][0]) return resultAt(1);
        let lower = 0, upper = 1;
        // Solver accuracy is numerical only, not source/chart accuracy.
        for (let i = 0; i < 64; i++) {
            const middle = (lower + upper) / 2;
            const result = resultAt(middle);
            if (result.matchedPA < pressureAltitude) lower = middle;
            else upper = middle;
            if (Math.abs(resultAt(upper).matchedPA - resultAt(lower).matchedPA) <= 1e-8) {
                return resultAt((lower + upper) / 2);
            }
        }
        throw new Error("Figure 5 PA solver did not converge.");
    }
    throw new Error("No verified Figure 5 result: Pressure Altitude lies in a gap in the source curve.");
}


/*
 * FIGURE 7
 * Determine Target Torque Value (TTV) from FAT
 * and Pressure Altitude.
 *
 * Each PA curve is a chain of cubic Bezier and
 * straight segments, points [TTV %, FAT °C],
 * running from FAT +55 down to -55 °C.
 * Segments at TTV 100 are the 100% Q TRANS LIMIT.
 *
 * FAT decreases monotonically along every segment,
 * so TTV is solved directly for the requested FAT.
 */
function ttvOnSegment(segment, fat) {
    const points = segment.points;

    if (segment.type === "line") {
        return interpolateLinear(
            fat,
            points[0][1],
            points[0][0],
            points[1][1],
            points[1][0]
        );
    }

    let lowT = 0;
    let highT = 1;

    for (let i = 0; i < 60; i++) {
        const midT = (lowT + highT) / 2;

        const midFat = cubicBezier(
            points[0][1],
            points[1][1],
            points[2][1],
            points[3][1],
            midT
        );

        if (midFat > fat) {
            lowT = midT;
        } else {
            highT = midT;
        }
    }

    return cubicBezier(
        points[0][0],
        points[1][0],
        points[2][0],
        points[3][0],
        (lowT + highT) / 2
    );
}


function ttvOnCurve(curve, fat) {
    const segments = curve.segments;
    const lastSegment = segments[segments.length - 1];

    const topFat = segments[0].points[0][1];
    const bottomFat = lastSegment.points[lastSegment.points.length - 1][1];

    /*
     * Digitized curve ends lie within a few
     * hundredths of a degree of ±55 °C.
     */
    const curveFat = Math.min(Math.max(fat, bottomFat), topFat);

    for (const segment of segments) {
        const points = segment.points;
        const segmentTop = points[0][1];
        const segmentBottom = points[points.length - 1][1];

        if (curveFat <= segmentTop && curveFat >= segmentBottom) {
            return ttvOnSegment(segment, curveFat);
        }
    }

    throw new Error("Unable to evaluate Figure 7 curve.");
}


function calculateFigure7TTV(
    figure7Data,
    fat,
    pressureAltitude
) {

    const minFat = figure7Data.fat_range_c.min;
    const maxFat = figure7Data.fat_range_c.max;

    if (fat < minFat || fat > maxFat) {
        throw new Error(
            `FAT must be between ${minFat} and ${maxFat} °C for Figure 7.`
        );
    }

    if (
        pressureAltitude < 0 ||
        pressureAltitude > 10000
    ) {
        throw new Error(
            "Pressure Altitude must be between 0 and 10000 ft for Figure 7."
        );
    }

    const ttvLimit = figure7Data.ttv_limit_percent;

    /*
     * Same PA-curve bracketing as Figure 4.
     */
    const bounds = getFigure4BoundingCurves(
        figure7Data.curves,
        pressureAltitude
    );

    const lowerTtv = Math.min(
        ttvOnCurve(bounds.lower, fat),
        ttvLimit
    );

    /*
     * Exact PA curve.
     */
    if (bounds.lower.pa_ft === bounds.upper.pa_ft) {

        return {
            ttv: lowerTtv,

            lowerPA: bounds.lower.pa_ft,
            upperPA: bounds.upper.pa_ft,

            lowerTtv: lowerTtv,
            upperTtv: lowerTtv
        };
    }

    const upperTtv = Math.min(
        ttvOnCurve(bounds.upper, fat),
        ttvLimit
    );

    /*
     * Interpolate between the two surrounding
     * pressure-altitude curves.
     */
    const ttv = Math.min(
        interpolateLinear(
            pressureAltitude,

            bounds.lower.pa_ft,
            lowerTtv,

            bounds.upper.pa_ft,
            upperTtv
        ),
        ttvLimit
    );

    return {
        ttv: ttv,

        lowerPA: bounds.lower.pa_ft,
        upperPA: bounds.upper.pa_ft,

        lowerTtv: lowerTtv,
        upperTtv: upperTtv
    };
}


/*
 * FIGURE 8
 * Determine Engine Torque Factor (ETF) from STR and FAT.
 *
 * Each FAT line is a straight line, points [ETF, STR],
 * from its upper end (ETF 1.0 / STR 1.0) down to its
 * lower end at the left chart edge (ETF 0.70).
 */
function etfOnLine(line, str) {
    const upper = line.points[0];
    const lower = line.points[1];

    /*
     * No extrapolation below the chart (ETF < 0.70).
     */
    if (str < lower[1]) {
        throw new Error(
            `STR ${str} is below the Figure 8 chart for the ${line.fat_c} °C line (ETF below 0.70).`
        );
    }

    return interpolateLinear(
        str,
        lower[1],
        lower[0],
        upper[1],
        upper[0]
    );
}


function calculateFigure8ETF(
    figure8Data,
    str,
    fat
) {

    /*
     * SEI note: when STR is greater than or equal
     * to 1.0, assume ETF to be 1.0.
     */
    if (str >= figure8Data.str_etf_one) {
        return {
            etf: 1.0,
            chartFat: null,
            lowerFat: null,
            upperFat: null,
            lowerEtf: 1.0,
            upperEtf: 1.0
        };
    }

    /*
     * SEI notes: FAT -5 °C and below is plotted on the
     * -5 °C line; FAT 35 °C and above on the 35 °C line.
     */
    const chartFat = Math.min(
        Math.max(fat, figure8Data.fat_line_range_c.min),
        figure8Data.fat_line_range_c.max
    );

    const lines = [...figure8Data.lines].sort(
        (a, b) => a.fat_c - b.fat_c
    );

    let lower = lines[0];
    let upper = lines[lines.length - 1];

    for (let i = 0; i < lines.length - 1; i++) {
        if (
            chartFat >= lines[i].fat_c &&
            chartFat <= lines[i + 1].fat_c
        ) {
            lower = lines[i];
            upper = lines[i + 1];
            break;
        }
    }

    if (chartFat === lower.fat_c) {
        upper = lower;
    } else if (chartFat === upper.fat_c) {
        lower = upper;
    }

    const lowerEtf = etfOnLine(lower, str);
    const upperEtf = lower === upper
        ? lowerEtf
        : etfOnLine(upper, str);

    /*
     * FAT between two plotted lines: linear interpolation
     * of ETF with respect to FAT, at the same STR.
     * Implementation decision - the SEI does not define
     * how to treat FAT between the plotted lines.
     */
    const etf = interpolateLinear(
        chartFat,
        lower.fat_c,
        lowerEtf,
        upper.fat_c,
        upperEtf
    );

    if (etf < figure8Data.axes.etf.min) {
        throw new Error("ETF is below the Figure 8 chart (0.70).");
    }

    return {
        etf: etf,
        chartFat: chartFat,
        lowerFat: lower.fat_c,
        upperFat: upper.fat_c,
        lowerEtf: lowerEtf,
        upperEtf: upperEtf
    };
}
