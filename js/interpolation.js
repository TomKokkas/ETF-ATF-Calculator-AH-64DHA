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


function tgtRefOnCurve(curve, fat) {
    let bestPoint = null;
    let bestDifference = Infinity;

    /*
     * Search each Bezier segment for the point
     * corresponding to the requested FAT.
     *
     * We use a dense search because the source
     * is a digitized chart curve rather than a
     * mathematical equation supplied by the SEI.
     */
    for (const segment of curve.segments) {

        for (let i = 0; i <= 10000; i++) {

            const t = i / 10000;

            const point = pointOnBezier(segment, t);

            const difference = Math.abs(point.fat - fat);

            if (difference < bestDifference) {
                bestDifference = difference;
                bestPoint = point;
            }
        }
    }

    if (bestPoint === null) {
        throw new Error("Unable to evaluate Figure 4 curve.");
    }

    return bestPoint.tgtref;
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
        fat < figure4Data.axes.fat_c.min ||
        fat > figure4Data.axes.fat_c.max
    ) {
        throw new Error(
            `FAT must be between ${figure4Data.axes.fat_c.min} and ${figure4Data.axes.fat_c.max} °C.`
        );
    }

    if (
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

    const lowerTgtRef = tgtRefOnCurve(
        bounds.lower,
        fat
    );

    /*
     * Exact PA curve.
     */
    if (bounds.lower.pa_ft === bounds.upper.pa_ft) {

        return {
            tgtref: lowerTgtRef,

            lowerPA: bounds.lower.pa_ft,
            upperPA: bounds.upper.pa_ft,

            lowerTgtRef: lowerTgtRef,
            upperTgtRef: lowerTgtRef
        };
    }

    const upperTgtRef = tgtRefOnCurve(
        bounds.upper,
        fat
    );

    /*
     * Interpolate between the two surrounding
     * pressure-altitude curves.
     */
    const tgtref = interpolateLinear(
        pressureAltitude,

        bounds.lower.pa_ft,
        lowerTgtRef,

        bounds.upper.pa_ft,
        upperTgtRef
    );

    return {
        tgtref: tgtref,

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

    const minPA = figure5Data.axes.pressure_altitude_ft.min;
    const maxPA = figure5Data.axes.pressure_altitude_ft.max;

    if (
        pressureAltitude < minPA ||
        pressureAltitude > maxPA
    ) {
        throw new Error(
            `Pressure Altitude must be between ${minPA} and ${maxPA} ft for Figure 5.`
        );
    }

    let bestPoint = null;
    let bestDifference = Infinity;

    for (const segment of figure5Data.segments) {

        /*
         * Dense evaluation of the original
         * vector Bezier curve.
         */
        for (let i = 0; i <= 10000; i++) {

            const t = i / 10000;

            const pa = cubicBezier(
                segment[0][0],
                segment[1][0],
                segment[2][0],
                segment[3][0],
                t
            );

            const factor = cubicBezier(
                segment[0][1],
                segment[1][1],
                segment[2][1],
                segment[3][1],
                t
            );

            const difference = Math.abs(
                pa - pressureAltitude
            );

            if (difference < bestDifference) {
                bestDifference = difference;

                bestPoint = {
                    pa: pa,
                    factor: factor
                };
            }
        }
    }

    if (bestPoint === null) {
        throw new Error(
            "Unable to evaluate Figure 5 curve."
        );
    }

    return {
        factor: bestPoint.factor,
        matchedPA: bestPoint.pa
    };
}