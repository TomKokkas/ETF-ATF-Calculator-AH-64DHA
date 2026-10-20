const fs=require('node:fs');
const path=require('node:path');
const zlib=require('node:zlib');
const crypto=require('node:crypto');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const source='reference/SEI-671_Change3_8_8_2019 (701C AH-64D).pdf';
const target=path.join(root,'data/figure-8-etf.json');

function extractFigure8() {
    const pdf=fs.readFileSync(path.join(root,source));
    const streams=[...pdf.toString('latin1').matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)].flatMap(m=>{
        try{return [zlib.inflateSync(Buffer.from(m[1],'latin1')).toString('latin1')]}catch{return []}
    });
    const page=streams.find(s=>s.includes('144.78 572.28 cm')&&s.includes('379.62 409.2 cm'));
    assert.ok(page,'Expected Figure 8 vectors not found; review source revision.');
    const units=v=>{
        assert.match(v,/^-?\d*(?:\.\d{1,2})?$/);
        const [whole,fraction='']=v.replace(/^-/,'').split('.');
        return (v.startsWith('-')?-1:1)*(Number(whole)*100+Number(fraction.padEnd(2,'0')));
    };
    const start=page.indexOf('2.16 w');
    const region=page.slice(start,page.indexOf('S\nQ',start));
    let x=0,y=0,previous;
    const raw=[];
    for(const line of region.split('\n')) {
        let m=line.match(/(?:q|S) 1 0 0 1 ([\d.-]+) ([\d.-]+) cm 0 0 m/);
        if(m){x+=units(m[1]);y+=units(m[2]);previous=[x,y]}
        m=line.match(/^([\d.-]+) ([\d.-]+) l$/);
        if(m)raw.push([previous,[x+units(m[1]),y+units(m[2])]].map(p=>p.map(v=>v/100)));
    }
    assert.equal(raw.length,18);
    const xTicks=[118.56,205.62,292.62,379.62];
    const yTicks=[191.58,277.44,363.36,449.22,535.08,620.94,706.86];
    for(const x of xTicks)assert.ok(page.includes(`1 0 0 1 ${x} `));
    for(const y of yTicks)assert.ok(page.includes(` ${y} cm`));
    function fit(ticks,first,step) {
        const mean=ticks.reduce((a,b)=>a+b)/ticks.length,value=first+(ticks.length-1)*step/2;
        const scale=ticks.reduce((s,x,i)=>s+(x-mean)*(first+i*step-value),0)/ticks.reduce((s,x)=>s+(x-mean)**2,0);
        const offset=value-scale*mean;
        return {scale,offset,ticks:ticks.map((pdf_coordinate,i)=>({pdf_coordinate,value:first+i*step})),max_residual:Math.max(...ticks.map((x,i)=>Math.abs(scale*x+offset-first-i*step)))};
    }
    const etf=fit(xTicks,.7,.1),str=fit(yTicks,.7,.05);
    const fatOrder=[-5,0,5,10,15,20,35,30,25];
    const paths=raw.map((pdf_points,i)=>({id:`fat-stroke-${i+1}`,fat_c:fatOrder[Math.floor(i/2)],type:'line',pdf_points,
        points:pdf_points.map(([x,y])=>[etf.scale*x+etf.offset,str.scale*y+str.offset])}));
    return {paths,etf,str,fullAxisSensitivity:fit([...xTicks,467.22],.7,.1),sha256:crypto.createHash('sha256').update(pdf).digest('hex')};
}

function buildDataset() {
    const s=extractFigure8();
    return {
        figure:8,name:'Determining Engine Torque Factor (ETF)',source:'SEI-671 Change 3',engine:['T701','T701C','T701D/CC','T701D/DC'],
        source_axes:{etf:{min:.7,max:1.1},str:{min:.7,max:1}},
        fat_labels:[-5,0,5,10,15,20,25,30,35].map(fat_c=>({fat_c,label:fat_c===-5?'≤ -5°C':fat_c===35?'≥ 35°C':`${fat_c}°C`,segment_ids:s.paths.filter(p=>p.fat_c===fat_c).map(p=>p.id)})),
        rules:{source_page:'0125 00-14, Figure 8 NOTES',fat_at_or_below:{threshold_c:-5,use_line_c:-5},fat_at_or_above:{threshold_c:35,use_line_c:35},str_at_or_above:{threshold:1,etf:1}},
        paths:s.paths,
        label_gap_policy:'inner_endpoint_interpolation',
        digitization:{source_file:source,source_sha256:s.sha256,printed_page:'0125 00-14',page_change_marking:'Change 2',drawing:'1163380-01',
            calibration:{etf:s.etf,str:s.str,full_etf_axis_sensitivity:s.fullAxisSensitivity},
            method:'Four ETF major ticks from 0.70 through 1.00 and seven STR major ticks from 0.70 through 1.00; independent least-squares affine calibration. Original 18 straight strokes are retained, two per FAT label. Integer hundredths preserve PDF coordinates; chart coordinates are not decimal-truncated.',
            etf_calibration_choice:'All performance strokes lie in ETF 0.70–1.00. The 1.10 right frame deviates from the spacing of the other major ticks; including it increases maximum tick residual from about 0.0000276 to 0.0002756. Keep the source-axis extent separately, without forcing the common vertex to (1,1).',
            gap_evidence:'The gaps coincide with FAT text labels, supporting annotation interruptions, but the two strokes are not exactly collinear. No bridging algorithm is specified in section 18.e or Figure 8 notes. Phase 3 approves computational interpolation only between the reviewed inner endpoints; this is an application choice, not a PDF path or explicit SEI rule.',
            limitations:'Calibration residuals and numerical precision are not certified SEI accuracy. FAT interpolation is an application choice. No source stroke is extended, joined or moved to force the published ETF 0.93 example.'}
    };
}
if(require.main===module) {
    const result=buildDataset();
    if(process.argv.includes('--write'))fs.writeFileSync(target,JSON.stringify(result,null,2)+'\n');
    else assert.deepEqual(JSON.parse(fs.readFileSync(target,'utf8')),result);
    console.log('Verified Figure 8: 18 straight strokes, 9 FAT labels, 4 ETF / 7 STR calibration ticks.');
}
module.exports={extractFigure8,buildDataset};
