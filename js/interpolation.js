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
 * FIGURE 7: original disjoint paths and explicit shared-limit coverage.
 */
function ttvOnSegment(segment, fat) {
    const p=segment.points, first=p[0], last=p[p.length-1];
    if(!Number.isFinite(fat)||fat<Math.min(first[1],last[1])||fat>Math.max(first[1],last[1])) throw new Error("Figure 7 FAT is outside this source segment.");
    if(fat===first[1]) return first[0];
    if(fat===last[1]) return last[0];
    if(segment.type==="line") return interpolateLinear(fat,first[1],first[0],last[1],last[0]);
    const up=last[1]>first[1];
    for(let i=1;i<p.length;i++) if(up?p[i][1]<p[i-1][1]:p[i][1]>p[i-1][1]) throw new Error("Figure 7 FAT segment is not monotonic.");
    let lo=0,hi=1;
    for(let i=0;i<60;i++) {
        const t=(lo+hi)/2, y=cubicBezier(p[0][1],p[1][1],p[2][1],p[3][1],t);
        if((y<fat)===up) lo=t; else hi=t;
    }
    return cubicBezier(p[0][0],p[1][0],p[2][0],p[3][0],(lo+hi)/2);
}

function figure7AtStoredPA(data, fat, pa) {
    const shared=data.shared_limit;
    const mapping=pa<=shared.sl_1.pa_max?shared.sl_1:shared.pa_regions.find(r=>r.pa_ft===pa);
    const onLimit=mapping&&fat>=mapping.fat_min&&fat<=mapping.fat_max;
    const candidates=[];
    for(const path of data.paths.filter(p=>p.pa_ft===pa)) for(const s of path.segments) {
        const first=s.points[0],last=s.points[s.points.length-1];
        if(fat>=Math.min(first[1],last[1])&&fat<=Math.max(first[1],last[1])) candidates.push({path:path.id,value:ttvOnSegment(s,fat)});
    }
    const values=candidates.map(c=>c.value);
    if(onLimit) values.push(shared.value_percent);
    const unique=[...new Set(values)];
    if(unique.length!==1) return {status:unique.length?"unverified_ambiguous":"unverified_coverage",ttv:null,pa,sourceCandidates:candidates,sharedLimitApplicable:Boolean(onLimit)};
    const value=unique[0],range=data.operating_range.ttv_percent;
    if(value<range.min||value>range.max) return {status:"outside_operating_ttv",ttv:null,pa,sourceCandidates:candidates};
    return {status:"available",ttv:value,pa,basis:onLimit?"shared_100_limit":"source_path",sourceCandidates:candidates};
}

function calculateFigure7TTV(data, fat, pressureAltitude) {
    const range=data.operating_range;
    if(!Number.isFinite(fat)||fat<range.fat_c.min||fat>range.fat_c.max) throw new Error(`FAT must be between ${range.fat_c.min} and ${range.fat_c.max} ?C for Figure 7.`);
    if(!Number.isFinite(pressureAltitude)||pressureAltitude<range.pressure_altitude_ft.min||pressureAltitude>range.pressure_altitude_ft.max) throw new Error("Pressure Altitude must be between 0 and 10000 ft for Figure 7.");
    const shared=data.shared_limit.sl_1;
    if(pressureAltitude<=shared.pa_max) {
        const r=figure7AtStoredPA(data,fat,pressureAltitude);
        return {...r,lowerPA:pressureAltitude,upperPA:pressureAltitude,lowerTtv:r.ttv,upperTtv:r.ttv};
    }
    // PA knots reference source labels, not additional geometric curves.
    const knots=[shared.pa_max,...new Set(data.paths.map(p=>p.pa_ft))].sort((a,b)=>a-b);
    const exact=knots.find(pa=>pa===pressureAltitude);
    if(exact!==undefined) {
        const r=figure7AtStoredPA(data,fat,exact);
        return {...r,lowerPA:exact,upperPA:exact,lowerTtv:r.ttv,upperTtv:r.ttv};
    }
    const i=knots.findIndex(pa=>pa>pressureAltitude);
    const lower=figure7AtStoredPA(data,fat,knots[i-1]),upper=figure7AtStoredPA(data,fat,knots[i]);
    const info={lowerPA:lower.pa,upperPA:upper.pa,lowerTtv:lower.ttv,upperTtv:upper.ttv,lowerBasis:lower.basis,upperBasis:upper.basis};
    if(lower.status!=="available"||upper.status!=="available") return {...info,status:"unverified_interpolation_coverage",ttv:null,lowerStatus:lower.status,upperStatus:upper.status};
    // Source-supported curve/limit endpoints may be interpolated; no blanket
    // mixed-limit exclusion is imported from Figure 4. No new path is created.
    const ttv=interpolateLinear(pressureAltitude,lower.pa,lower.ttv,upper.pa,upper.ttv);
    if(ttv<range.ttv_percent.min||ttv>range.ttv_percent.max) return {...info,status:"outside_operating_ttv",ttv:null};
    return {...info,status:"available",basis:"pa_interpolation",ttv};
}


/*
 * FIGURE 8: original strokes and separately approved label-gap computation.
 */
function etfOnLine(data, fatLine, str) {
    const paths=data.paths.filter(p=>p.fat_c===fatLine);
    const candidates=[];
    for(const path of paths) {
        const [a,b]=path.points;
        if(str>=Math.min(a[1],b[1])&&str<=Math.max(a[1],b[1])) {
            candidates.push({id:path.id,etf:str===a[1]?a[0]:str===b[1]?b[0]:interpolateLinear(str,a[1],a[0],b[1],b[0])});
        }
    }
    const values=[...new Set(candidates.map(p=>p.etf))];
    if(values.length===1)return {status:"available",basis:"source_stroke",etf:values[0],sourceSegments:candidates.map(p=>p.id)};
    // Only these reviewed label interruptions are eligible. These are source
    // endpoint references, not synthetic paths or an SEI interpolation rule.
    const approved=[
        [-5,1,2,[144.78,572.28],[162,582.12]],
        [0,4,3,[149.22,555.24],[157.8,560.88]],
        [5,5,6,[149.34,524.94],[158.64,532.32]],
        [10,8,7,[149.16,494.34],[159,503.4]],
        [15,9,10,[148.92,455.46],[157.98,465.36]],
        [20,12,11,[148.56,402.42],[157.14,413.76]],
        [25,17,18,[149.28,358.08],[156.9,369.6]],
        [30,16,15,[149.64,297.84],[156.12,309.3]],
        [35,13,14,[150.42,254.88],[156.48,266.82]]
    ].find(g=>g[0]===fatLine);
    if(values.length===0&&paths.length===2&&approved&&data.label_gap_policy==="inner_endpoint_interpolation") {
        const low=paths.find(p=>p.id===`fat-stroke-${approved[1]}`);
        const high=paths.find(p=>p.id===`fat-stroke-${approved[2]}`);
        if(low&&high&&low.type==="line"&&high.type==="line") {
            const li=low.points[0][1]>low.points[1][1]?0:1;
            const hi=high.points[0][1]<high.points[1][1]?0:1;
            const same=(a,b)=>a&&a[0]===b[0]&&a[1]===b[1];
            const a=low.points[li],b=high.points[hi];
            if(same(low.pdf_points[li],approved[3])&&same(high.pdf_points[hi],approved[4])&&str>a[1]&&str<b[1]) {
                return {status:"available",basis:"label_gap_interpolation",
                    etf:interpolateLinear(str,a[1],a[0],b[1],b[0]),sourceSegments:[low.id,high.id]};
            }
        }
    }
    const ys=paths.flatMap(p=>p.points.map(p=>p[1]));
    const inExtent=str>=Math.min(...ys)&&str<=Math.max(...ys);
    return {status:values.length>1?"unverified_ambiguous":inExtent?"unverified_label_gap":"unverified_coverage",etf:null,sourceSegments:candidates.map(p=>p.id)};
}

function calculateFigure8ETF(data, str, fat) {
    // Validate before any SEI rule, including STR >= 1.
    if(!Number.isFinite(str)||!Number.isFinite(fat))throw new Error("Figure 8 requires finite STR and FAT inputs.");
    const rules=data.rules;
    if(str>=rules.str_at_or_above.threshold)return {
        status:"available",basis:"sei_str_rule",etf:rules.str_at_or_above.etf,
        chartFat:null,lowerFat:null,upperFat:null,lowerEtf:1,upperEtf:1
    };
    // These FAT substitutions are explicit Figure 8 notes, not geometric clamping.
    const chartFat=fat<=rules.fat_at_or_below.threshold_c?rules.fat_at_or_below.use_line_c:
        fat>=rules.fat_at_or_above.threshold_c?rules.fat_at_or_above.use_line_c:fat;
    const labels=data.fat_labels.map(p=>p.fat_c).sort((a,b)=>a-b);
    const exact=labels.find(f=>f===chartFat);
    let lowerFat,upperFat;
    if(exact!==undefined){lowerFat=exact;upperFat=exact}
    else{const i=labels.findIndex(f=>f>chartFat);lowerFat=labels[i-1];upperFat=labels[i]}
    const lower=etfOnLine(data,lowerFat,str),upper=lowerFat===upperFat?lower:etfOnLine(data,upperFat,str);
    const info={chartFat,lowerFat,upperFat,lowerEtf:lower.etf,upperEtf:upper.etf,lowerStatus:lower.status,upperStatus:upper.status,lowerBasis:lower.basis,upperBasis:upper.basis};
    if(lower.status!=="available"||upper.status!=="available")return {
        ...info,status:lowerFat===upperFat?lower.status:"unverified_fat_interpolation",etf:null
    };
    // Existing same-STR linear interpolation in FAT is an application choice.
    // References may use a source stroke or an explicitly approved label gap.
    return {...info,status:"available",basis:lowerFat===upperFat?lower.basis:"fat_interpolation",
        usesLabelGapInterpolation:lower.basis==="label_gap_interpolation"||upper.basis==="label_gap_interpolation",
        etf:interpolateLinear(chartFat,lowerFat,lower.etf,upperFat,upper.etf)};
}
