
const fs=require('fs'),path=require('path'),os=require('os'),http=require('http'),{spawn}=require('child_process'),crypto=require('crypto');
const root=process.cwd(),tempRoot=path.resolve(os.tmpdir()),profile=fs.mkdtempSync(path.join(tempRoot,'codex-etf-browser-'));
const files=['index.html','css/style.css','js/calculator.js','js/engines.js','js/engine-outline.js','js/interpolation.js',...fs.readdirSync('data').map(f=>'data/'+f)];
const hashes=()=>Object.fromEntries(files.map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex')]));
const nativeFetch=globalThis.fetch;globalThis.fetch=(u,o={})=>nativeFetch(u,{signal:AbortSignal.timeout(5000),...o});
const siteRoot=path.resolve(process.env.ETF_SITE_ROOT||root);
const sitePrefix=(process.env.ETF_SITE_PREFIX||'').replace(/\/$/,'');
if(sitePrefix&&!/^\/[A-Za-z0-9_/-]+$/.test(sitePrefix))throw Error('Invalid test site prefix');
const before=hashes();let chrome,ws,server;const report={browser:'Chrome headless, real Chromium DOM',desktop:[],mobile:[],dialogs:[],jsExceptions:[],consoleErrors:[],networkFailures:[]};
const pause=ms=>new Promise(r=>setTimeout(r,ms));
// Decode Chrome PNG screenshot rows for a pixel-level seam check. No image
// library or CSS-only inference is used: inspect the gap and bottom stroke.
function flatSurfacePixels(base64, region, expected = [31,41,55]) {
 const png=Buffer.from(base64,'base64'),chunks=[];let width,height,type;
 for(let offset=8;offset<png.length;) {
  const size=png.readUInt32BE(offset),name=png.toString('ascii',offset+4,offset+8),data=png.subarray(offset+8,offset+8+size);
  if(name==='IHDR'){width=data.readUInt32BE(0);height=data.readUInt32BE(4);if(data[8]!==8)throw Error('Expected 8-bit screenshot');type=data[9];}
  if(name==='IDAT')chunks.push(data);offset+=size+12;
 }
 const bytes=type===2?3:type===6?4:0;if(!bytes)throw Error('Unsupported screenshot colour type');
 const raw=require('zlib').inflateSync(Buffer.concat(chunks)),stride=width*bytes;let previous=Buffer.alloc(stride),position=0,bad=0,blue=0,grey=0;const samples=[];
 const paeth=(a,b,c)=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c};
 for(let y=0;y<height;y++) {
  const filter=raw[position++],row=Buffer.alloc(stride);
  for(let x=0;x<stride;x++){const left=x>=bytes?row[x-bytes]:0,up=previous[x],upperLeft=x>=bytes?previous[x-bytes]:0;
   const predictor=filter===0?0:filter===1?left:filter===2?up:filter===3?Math.floor((left+up)/2):filter===4?paeth(left,up,upperLeft):NaN;
   if(!Number.isFinite(predictor))throw Error('Unsupported screenshot filter');row[x]=(raw[position++]+predictor)&255;
  }
  for(let x=0;x<stride;x+=bytes)if(y>=region.top&&y<region.bottom&&x/bytes>=region.left&&x/bytes<region.right){if(row[x]>=40&&row[x]<=55&&row[x+1]>=50&&row[x+1]<=65&&row[x+2]>=64&&row[x+2]<=81)grey++;if(row[x+2]>150&&row[x+1]>90&&row[x+2]>row[x+1]&&row[x+1]>row[x])blue++;if(row[x]!==expected[0]||row[x+1]!==expected[1]||row[x+2]!==expected[2]){bad++;if(samples.length<8)samples.push({x:x/bytes,y,rgb:[row[x],row[x+1],row[x+2]]});}}
  previous=row;
 }
 return {greyBorderPixels:grey,bluePixels:blue,uniform:bad===0,nonBackgroundPixels:bad,width:region.right-region.left,height:region.bottom-region.top,samples};
}

(async()=>{
 try{
 server=http.createServer((req,res)=>{const u=new URL(req.url,'http://localhost');if(u.pathname==='/favicon.ico'){res.writeHead(204);res.end();return;}if(sitePrefix&&!u.pathname.startsWith(sitePrefix+'/')){res.writeHead(404);res.end();return;}const sitePath=u.pathname.slice(sitePrefix.length)||'/';const file=path.resolve(siteRoot,'.'+(sitePath==='/'?'/index.html':decodeURIComponent(sitePath)));if(!file.startsWith(siteRoot+path.sep)){res.writeHead(403);res.end();return;}try{res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json'})[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));}catch{res.writeHead(404);res.end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port+sitePrefix+'/';
 chrome=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--no-sandbox','--disable-gpu','--remote-debugging-port=0','--remote-debugging-address=127.0.0.1','--user-data-dir='+profile,'--no-first-run','--no-default-browser-check','--disable-extensions','--disable-background-networking','--disable-sync','about:blank'],{windowsHide:true,stdio:['ignore','ignore','pipe']});
 chrome.stderr.on('data',b=>process.stderr.write(b.toString().slice(0,1600)));chrome.on('exit',(code)=>process.stderr.write('BROWSER EXIT '+code+'\n'));process.stderr.write('BROWSER PID '+chrome.pid+'\n');let port;for(let i=0;i<100;i++){try{port=Number(fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0]);break}catch{}await pause(100);}
 if(!port)throw Error('Chrome DevTools endpoint unavailable');
 process.stderr.write('DEVTOOLS PORT '+port+'\n');const version=await(await fetch('http://127.0.0.1:'+port+'/json/version')).json();report.version=version.Browser;
 const pages=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();const target=pages.find(p=>p.type==='page');if(!target)throw Error('No browser page');
 ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{const timer=setTimeout(()=>j(Error('WebSocket opening timeout')),5000);ws.onopen=()=>{clearTimeout(timer);r()};ws.onerror=e=>{clearTimeout(timer);j(Error('WebSocket connection failed'))}});
 let id=0;const pending=new Map();function send(method,params={}){return new Promise((resolve,reject)=>{const n=++id;const timer=setTimeout(()=>{pending.delete(n);reject(Error('CDP timeout: '+method))},8000);pending.set(n,{resolve:v=>{clearTimeout(timer);resolve(v)},reject:e=>{clearTimeout(timer);reject(e)}});ws.send(JSON.stringify({id:n,method,params}));});}
 ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}return;}
 if(m.method==='Page.javascriptDialogOpening'){report.dialogs.push(m.params.message);send('Page.handleJavaScriptDialog',{accept:true}).catch(()=>{});}
 if(m.method==='Runtime.exceptionThrown')report.jsExceptions.push(m.params.exceptionDetails);
 if(m.method==='Runtime.consoleAPICalled'&&m.params.type==='error')report.consoleErrors.push(m.params.args.map(a=>a.value||a.description).join(' '));
 if(m.method==='Network.loadingFailed')report.networkFailures.push(m.params);
 };
 process.stderr.write('CDP CONNECTED\n');await send('Page.enable');await send('Runtime.enable');await send('Network.enable');
 const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 await send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});await send('Page.navigate',{url});
 let ready=false;for(let i=0;i<100;i++){ready=await evaluate("typeof figure8Data !== 'undefined' && !!figure1Data && !!figure4Data && !!figure5Data && !!figure7Data && !!figure8Data");if(ready)break;await pause(100);}if(!ready)throw Error('Chart loading timeout');

 if(process.env.ETF_SITE_ROOT) {
  const excluded=['reference/manual.pdf','artifacts/engine-tabs/desktop-engine-1.png','docs/engines-atf.md','docs/figure-4-phase-1.html','scripts/build-pages.cjs','tests/pages-artifact.test.cjs','AGENTS.md','.env','.git/config'];
  report.excludedAssetChecks=[];
  for(const file of excluded){const response=await fetch(new URL(file,url));report.excludedAssetChecks.push({file,status:response.status,pass:response.status===404});}
  report.projectPrefix=sitePrefix;
 }
 const fill=async values=>evaluate("(()=>{for(const [id,value]of Object.entries("+JSON.stringify(values)+")){const e=document.getElementById(id);e.value=value;e.dispatchEvent(new Event('input',{bubbles:true}));}})()");
 const click=()=>evaluate("document.getElementById('calculate-btn').click()");
 const select=async number=>{
  const point=await evaluate("(()=>{const e=document.getElementById('engine-tab-"+number+"');e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()");
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',...point});
  await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point});
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point});
 };
 const text=id=>evaluate("document.getElementById("+JSON.stringify(id)+").textContent");
 const check=(mode,name,pass,details)=>report[mode].push({name,pass,details});
 const base={pa:'6000',fat:'-16',kias:'130',trq:'100',tgt:'736',ng:'98'};
 for(const mode of ['desktop','mobile']) {
  await send('Emulation.setDeviceMetricsOverride',{width:mode==='desktop'?1280:390,height:mode==='desktop'?900:844,deviceScaleFactor:1,mobile:mode==='mobile'});
  await send('Emulation.setTouchEmulationEnabled',{enabled:mode==='mobile'});
  await select(1);await fill(base);await click();
  check(mode,'scenario A',await text('result-trqadj')==='97.640 %'&&await text('result-str')==='0.976'&&await text('result-etf')==='0.92');
  await select(2);await fill({...base,pa:'6005',fat:'14',kias:'126',tgt:'800'});await click();
  check(mode,'scenario B',await text('result-trqadj')==='102.260 %'&&await text('result-str')==='1.023'&&await text('result-etf')==='1.00');
  check(mode,'both engines summary',await text('engine-1-etf')==='0.92'&&await text('engine-2-etf')==='1.00'&&await text('result-atf')==='0.96');
  await select(1);
  check(mode,'restore engine 1 inputs and intermediate values',await evaluate("document.getElementById('pa').value==='6000'&&document.getElementById('tgt').value==='736'&&document.getElementById('result-trqadj').textContent==='97.640 %'"));
  await fill({...base,pa:'2978',fat:'12',kias:'134',tgt:'769'});await click();
  check(mode,'scenario C',await text('result-trqadj')==='98.095 %'&&await text('result-str')==='0.981'&&await text('result-etf')==='0.96');
  const precise={...base,fat:'-15.800000000000001',trq:'99.5000000000001',ng:'98.00000000000001'};
  await fill(precise);await click();await select(2);await select(1);
  check(mode,'retain decimal input text',await evaluate("document.getElementById('fat').value==='-15.800000000000001'&&document.getElementById('trq').value==='99.5000000000001'&&document.getElementById('ng').value==='98.00000000000001'"));
  await fill({ng:'98.1'});
  check(mode,'input invalidates only selected ETF and ATF',await text('engine-1-etf')==='\u2014'&&await text('engine-2-etf')==='1.00'&&await text('result-atf')==='\u2014'&&await text('result-trqadj')==='\u2014');
  await fill({...base,tgt:'733.882'});await click();
  check(mode,'real core first ETF .93',await text('result-etf')==='0.93');
  await select(2);await fill({...base,tgt:'726'});await click();
  check(mode,'real core second ETF .98',await text('result-etf')==='0.98');
  const exact=await evaluate("({display:document.getElementById('result-atf').textContent,exact:engineState.atf.exact.n*1000n===955n*engineState.atf.exact.d})");
  check(mode,'exact .955 ATF displays .96',exact.display==='0.96'&&exact.exact,exact);
  await fill({...base,tgt:'741.529'});await click();await select(1);await fill({...base,tgt:'741.529'});await click();
  check(mode,'actual below-minimum ATF warning',await text('result-atf')==='0.89'&&await evaluate("document.getElementById('atf-status').dataset.state==='below-minimum'"));
  check(mode,'minimal below-minimum presentation is red',await evaluate("(()=>{const s=document.querySelector('.aircraft-summary'),a=document.getElementById('result-atf'),m=document.getElementById('atf-status');return m.textContent==='ATF below minimum limit'&&!m.hidden&&getComputedStyle(a).color===getComputedStyle(m).color&&!/0\\.90|0\\.895|Minimum ATF:|Calculate both/.test(s.innerText)})()"));
  await fill({kias:'94.1'});await click();
  check(mode,'invalid input clears selected engine and ATF',await text('result-etf')==='\u2014'&&await text('engine-1-etf')==='\u2014'&&await text('engine-2-etf')==='0.89'&&await text('result-atf')==='\u2014');
  await fill({...base,pa:'2000',fat:'55'});await click();
  check(mode,'unverified coverage cannot produce ATF',await text('result-etf')==='\u2014'&&await text('result-atf')==='\u2014');
  check(mode,'incomplete summary shows only dashes and no instruction',await evaluate("document.getElementById('atf-status').hidden&&document.getElementById('atf-status').textContent===''&&document.getElementById('result-atf').textContent==='\\u2014'"));
  // Capture the contour with both engines already calculated, not empty rows.
  await select(1);await fill(base);await click();
  await select(2);await fill({...base,pa:'6005',fat:'14',kias:'126',tgt:'800'});await click();
  await select(1);
  await evaluate("document.getElementById('engine-tab-1').focus()");
  const key=async (key,code)=>{await send('Input.dispatchKeyEvent',{type:'keyDown',key,code,windowsVirtualKeyCode:code==='ArrowRight'?39:37});await send('Input.dispatchKeyEvent',{type:'keyUp',key,code});};
  await key('ArrowRight','ArrowRight');
  check(mode,'keyboard selects Engine 2 with a visible focus indicator',await evaluate("engineState.selected===2&&document.getElementById('pa').value==='6005'&&document.getElementById('result-trqadj').textContent==='102.260 %'&&document.activeElement.id==='engine-tab-2'&&document.activeElement.matches(':focus-visible')&&getComputedStyle(document.activeElement).outlineStyle!=='none'&&getComputedStyle(document.activeElement).outlineWidth==='2px'&&getComputedStyle(document.querySelector('.engine-outline path')).stroke===getComputedStyle(document.querySelector('.aircraft-summary')).borderTopColor"));
  await key('ArrowLeft','ArrowLeft');
  check(mode,'keyboard restores Engine 1 inputs and existing results',await evaluate("engineState.selected===1&&document.getElementById('pa').value==='6000'&&document.getElementById('result-trqadj').textContent==='97.640 %'&&document.activeElement.id==='engine-tab-1'&&document.activeElement.matches(':focus-visible')"));
  // Start visual mouse checks without the preceding keyboard focus ring.
  await evaluate('document.activeElement.blur()');
  await select(1);await evaluate('window.scrollTo(0,0)');
  const formGeometry=()=>evaluate("(()=>{const p=document.querySelector('.input-section'),r=p.getBoundingClientRect(),i=document.getElementById('fat').getBoundingClientRect();return [r.x,r.y,r.width,r.height,i.x,i.y,i.width,i.height]})()");
  const originalGeometry=await formGeometry();
  for(const dpr of [1,1.25,2]) {
   await send('Emulation.setDeviceMetricsOverride',{width:mode==='desktop'?1280:390,height:mode==='desktop'?900:844,deviceScaleFactor:dpr,mobile:mode==='mobile'});
   for(const number of [1,2,1]) {
    await select(number);await pause(80);
    const duringGeometry=await formGeometry();await pause(120);
    const appearance=await evaluate("(()=>{const active=document.querySelector('.engine-tabs [aria-selected=true]'),inactive=document.querySelector('.engine-tabs [aria-selected=false]'),a=getComputedStyle(active),b=getComputedStyle(inactive),r=active.getBoundingClientRect(),i=inactive.getBoundingClientRect(),surface=document.querySelector('.engine-surface'),panel=document.getElementById('engine-panel'),path=surface.querySelector('svg path'),p=getComputedStyle(path),box=surface.getBoundingClientRect(),results=document.getElementById('engine-results').getBoundingClientRect(),atf=document.querySelector('.aircraft-summary').getBoundingClientRect();return {selected:active.id,stroke:p.stroke,strokeWidth:p.strokeWidth,atfBorderColor:getComputedStyle(document.querySelector('.aircraft-summary')).borderTopColor,atfBorderWidth:getComputedStyle(document.querySelector('.aircraft-summary')).borderTopWidth,fill:p.fill,transform:path.getAttribute('transform'),complete:surface.contains(document.getElementById('result-etf'))&&panel.contains(document.getElementById('engine-results'))&&!surface.contains(document.getElementById('result-atf')),bottomClosesAfterETF:box.bottom>=results.bottom&&box.bottom<atf.top,noInnerFrame:getComputedStyle(panel.querySelector('.input-section')).borderLeftColor==='rgba(0, 0, 0, 0)'&&getComputedStyle(document.getElementById('engine-results')).borderLeftColor==='rgba(0, 0, 0, 0)',inactiveBackground:b.backgroundColor,inactiveBorderBottom:b.borderBottomColor,inactiveCorners:[b.borderTopLeftRadius,b.borderTopRightRadius,b.borderBottomLeftRadius,b.borderBottomRightRadius],inactiveClickable:!inactive.disabled&&b.pointerEvents!=='none',remarksAbsent:!document.getElementById('ng-note')&&!document.getElementById('positive-input-note'),calculateGap:document.querySelector('#engine-results h2').getBoundingClientRect().top-document.getElementById('calculate-btn').getBoundingClientRect().bottom,front:Number(a.zIndex)>Number(b.zIndex),sameHeight:Math.abs(r.height-i.height)<.1,gap:getComputedStyle(active.parentElement).columnGap,transition:a.transitionDuration};})()");
    const geometry=await formGeometry();
    const regions=await evaluate("(()=>{const r=document.querySelector('.engine-tabs [aria-selected=true]').getBoundingClientRect(),first=document.getElementById('engine-tab-1').getBoundingClientRect(),second=document.getElementById('engine-tab-2').getBoundingClientRect(),d=devicePixelRatio;return {join:{left:Math.ceil((r.left+r.width/2-8)*d),right:Math.floor((r.left+r.width/2+8)*d),top:Math.floor(r.bottom*d)-1,bottom:Math.ceil(r.bottom*d)+2},gap:{left:Math.ceil((first.right+2)*d),right:Math.floor((second.left-2)*d),top:Math.ceil((r.top+12)*d),bottom:Math.floor((r.bottom-12)*d)}};})()");
    const pixels=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
    const gapPixels=flatSurfacePixels(pixels.data,regions.gap,[17,24,39]);
    const joinPixels=flatSurfacePixels(pixels.data,regions.join);
    await evaluate("window.scrollTo(0,Math.max(0,document.querySelector('.engine-surface').getBoundingClientRect().bottom+scrollY-innerHeight+70))");
    await pause(30);
    const bottomRegion=await evaluate("(()=>{const r=document.querySelector('.engine-surface').getBoundingClientRect(),d=devicePixelRatio;return {left:Math.ceil((r.left+r.width/2-8)*d),right:Math.floor((r.left+r.width/2+8)*d),top:Math.floor((r.bottom-1.5)*d),bottom:Math.ceil(r.bottom*d)};})()");
    const bottomShot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
    const bottomPixels=flatSurfacePixels(bottomShot.data,bottomRegion);
    await evaluate('window.scrollTo(0,0)');await pause(30);
    check(mode,'Engine '+number+' complete grey border matching ATF at DPR '+dpr,appearance.stroke===appearance.atfBorderColor&&appearance.strokeWidth===appearance.atfBorderWidth&&appearance.fill==='rgb(31, 41, 55)'&&appearance.complete&&appearance.bottomClosesAfterETF&&appearance.noInnerFrame&&(number===2?appearance.transform.includes('scale(-1, 1)'):appearance.transform==='')&&appearance.inactiveBackground==='rgb(17, 24, 39)'&&appearance.inactiveBorderBottom==='rgba(0, 0, 0, 0)'&&appearance.inactiveCorners.join(',')==='10px,10px,0px,0px'&&appearance.inactiveClickable&&appearance.remarksAbsent&&appearance.calculateGap>=24&&appearance.calculateGap<=28&&appearance.front&&appearance.sameHeight&&appearance.gap==='8px'&&appearance.transition.split(', ').every(v=>v==='0.16s')&&gapPixels.uniform&&joinPixels.uniform&&bottomPixels.bluePixels===0&&bottomPixels.greyBorderPixels>=bottomPixels.width&&JSON.stringify(duringGeometry)===JSON.stringify(originalGeometry)&&JSON.stringify(geometry)===JSON.stringify(originalGeometry),{...appearance,gapPixels,joinPixels,bottomPixels,formUnchanged:JSON.stringify(geometry)===JSON.stringify(originalGeometry),formUnchangedDuringTransition:JSON.stringify(duringGeometry)===JSON.stringify(originalGeometry)});
    if(process.env.ETF_CAPTURE_TABS==='1'&&(dpr===1||dpr===1.25)&&!(report.tabScreenshots??[]).some(v=>v.mode===mode&&v.number===number&&v.dpr===dpr)) {
     const clip=await evaluate("(()=>{const r=document.querySelector('.engine-surface').getBoundingClientRect();return {x:0,y:r.y+scrollY,width:innerWidth,height:r.height+120,scale:1};})()");
     const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip});
     const folder=path.join(root,'artifacts','engine-tabs');fs.mkdirSync(folder,{recursive:true});
     const file=path.join(folder,mode+'-engine-'+number+(dpr===1?'':'-dpr-'+dpr)+'.png');fs.writeFileSync(file,Buffer.from(shot.data,'base64'));
     (report.tabScreenshots??=[]).push({mode,number,dpr,file});
    }
   }
  }
  await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  const reduced=await evaluate("getComputedStyle(document.getElementById('engine-tab-1')).transitionDuration");
  check(mode,'reduced motion disables transitions',reduced==='0s');
  await send('Emulation.setEmulatedMedia',{features:[]});
  await send('Emulation.setDeviceMetricsOverride',{width:mode==='desktop'?1280:390,height:mode==='desktop'?900:844,deviceScaleFactor:1,mobile:mode==='mobile'});
  const titleLayout=await evaluate("(()=>{const h=document.querySelector('h1'),s=document.querySelector('.subtitle'),r=h.getBoundingClientRect(),q=s.getBoundingClientRect();return {title:document.title,heading:h.textContent,subtitle:s.textContent,withinViewport:r.left>=0&&r.right<=innerWidth&&q.left>=0&&q.right<=innerWidth,noOverflow:document.documentElement.scrollWidth<=innerWidth};})()");
  check(mode,'updated heading, subtitle and document title fit the viewport',titleLayout.title==='ETF / ATF Calculator | AH-64DHA'&&titleLayout.heading==='ETF / ATF Calculator'&&titleLayout.subtitle==='AH-64DHA \u00b7 T701C - T701D/CC \u00b7 SEI-671'&&titleLayout.withinViewport&&titleLayout.noOverflow,titleLayout);
  const layout=await evaluate("({width:innerWidth,documentWidth:document.documentElement.scrollWidth,oneValue:[...document.querySelectorAll('.result-row')].every(r=>r.querySelectorAll('strong').length===1),technical:/Calculated:|source_stroke|label_gap_interpolation/.test(document.querySelector('main').innerText),tabs:(()=>{const a=document.getElementById('engine-tab-1'),b=document.getElementById('engine-tab-2'),x=a.getBoundingClientRect(),y=b.getBoundingClientRect();return {equal:Math.abs(x.width-y.width)<1,beside:Math.abs(x.y-y.y)<1&&x.right<y.left,selected:document.querySelectorAll('.engine-tabs [aria-selected=true]').length===1,distinct:getComputedStyle(a).backgroundColor!==getComputedStyle(b).backgroundColor};})()})");
  check(mode,'responsive layout and simple results',layout.documentWidth<=layout.width&&layout.oneValue&&!layout.technical&&layout.tabs.equal&&layout.tabs.beside&&layout.tabs.selected&&layout.tabs.distinct,layout);
 }
 report.repositoryFilesUnchanged=JSON.stringify(before)===JSON.stringify(hashes());
 report.allChecksPass=[...report.desktop,...report.mobile].every(r=>r.pass)&&report.jsExceptions.length===0&&report.networkFailures.length===0&&(report.excludedAssetChecks||[]).every(r=>r.pass);
 report.consoleErrorsAreExpectedValidationLogs=report.consoleErrors.length===report.dialogs.length;
 console.log(JSON.stringify(report));
 if(!report.allChecksPass)process.exitCode=1;
 }catch(e){console.log(JSON.stringify({error:e.stack,partial:report}));process.exitCode=1;}
 finally{if(ws)ws.close();if(chrome){chrome.kill();await pause(1000);}if(server)server.close();const resolved=path.resolve(profile);if(resolved.startsWith(tempRoot+path.sep)&&path.basename(resolved).startsWith('codex-etf-browser-')){try{fs.rmSync(resolved,{recursive:true,force:true,maxRetries:3,retryDelay:200})}catch{}}}
})();

