/* Cadastral Parcel Splitter
   Browser-side prototype. Shapefile ZIP should contain .shp/.shx/.dbf/.prj.
   shpjs reads the .prj and normally returns GeoJSON in WGS84.
*/
const $ = id => document.getElementById(id);
const map = L.map("map").setView([27.0, 85.0], 10);
const street = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 20, attribution: "&copy; OpenStreetMap contributors"
}).addTo(map);
const satellite = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
  maxZoom: 19, attribution: "Tiles &copy; Esri"
});
let sourceFeatures = [];
let selected = null;
let originalLayer = null, resultLayer = null, boundaryLayer = null;
let splitResult = null;
let lastSplit = null;
let propertyKeys = {};
let currentFeatureCollection = null;

$("streetLayer").onclick = () => { if(map.hasLayer(satellite)) map.removeLayer(satellite); street.addTo(map); setActive("streetLayer"); };
$("satelliteLayer").onclick = () => { if(map.hasLayer(street)) map.removeLayer(street); satellite.addTo(map); setActive("satelliteLayer"); };
function setActive(id){$("streetLayer").classList.toggle("active",id==="streetLayer");$("satelliteLayer").classList.toggle("active",id==="satelliteLayer");}

$("shapeFile").addEventListener("change", async e => {
  const file = e.target.files[0]; if(!file) return;
  $("fileMessage").textContent = "Reading shapefile…";
  try {
    const parsed = await shp(await file.arrayBuffer());
    const layers = Array.isArray(parsed) ? parsed : [parsed];
    sourceFeatures = layers.flatMap(x => x && x.features ? x.features : []);
    sourceFeatures = sourceFeatures.filter(f => f.geometry && ["Polygon","MultiPolygon"].includes(f.geometry.type));
    if(!sourceFeatures.length) throw new Error("No polygon features found. Check the ZIP and its contents.");
    currentFeatureCollection = {type:"FeatureCollection",features:sourceFeatures};
    propertyKeys = detectFields(sourceFeatures);
    populateFilters();
    const all = L.geoJSON(currentFeatureCollection, {style:{color:"#2368b1",weight:1.3,fillColor:"#8bbcf0",fillOpacity:.13}});
    all.addTo(map); map.fitBounds(all.getBounds(),{padding:[20,20]});
    if(originalLayer) map.removeLayer(originalLayer);
    originalLayer = all;
    $("dataStatus").textContent = `${sourceFeatures.length.toLocaleString()} parcels loaded`;
    $("fileMessage").textContent = `Loaded ${sourceFeatures.length} polygon records.`;
    $("locateBtn").disabled = false;
    $("splitBtn").disabled = false;
    $("boundaryBtn").disabled = false;
    all.eachLayer(layer => layer.on("click",()=>selectFeature(layer.feature)));
  } catch(err) {
    $("fileMessage").textContent = "Error: " + err.message;
    console.error(err);
  }
});

function norm(s){return String(s||"").toLowerCase().replace(/[^a-z0-9]/g,"");}
function findKey(props, candidates){
  const keys=Object.keys(props||{});
  for(const c of candidates){const found=keys.find(k=>norm(k)===norm(c));if(found)return found;}
  for(const c of candidates){const found=keys.find(k=>norm(k).includes(norm(c)));if(found)return found;}
  return null;
}
function detectFields(features){
  const p=features[0].properties||{};
  return {
    district:findKey(p,["district","municipality","local_level","vdc","palika","gaupalika"]),
    ward:findKey(p,["ward","ward_no","wardno"]),
    parcel:findKey(p,["parcel_id","parcelno","kitta_no","kitta","plot_no","plotid"]),
    landuse:findKey(p,["landuse","land_use","class","category"])
  };
}
function uniqueValues(key){
  if(!key)return [];
  return [...new Set(sourceFeatures.map(f=>String(f.properties?.[key]??"")).filter(Boolean))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
}
function fillSelect(el, values, first){
  el.innerHTML="";
  const opt=document.createElement("option");opt.value="";opt.textContent=first;el.appendChild(opt);
  values.forEach(v=>{const o=document.createElement("option");o.value=v;o.textContent=v;el.appendChild(o);});
}
function filteredFeatures(){
  return sourceFeatures.filter(f=>{
    const p=f.properties||{};
    return (!$("districtFilter").value||String(p[propertyKeys.district])===$("districtFilter").value) &&
      (!$("wardFilter").value||String(p[propertyKeys.ward])===$("wardFilter").value) &&
      (!$("parcelFilter").value||String(p[propertyKeys.parcel])===$("parcelFilter").value);
  });
}
function populateFilters(){
  fillSelect($("districtFilter"),uniqueValues(propertyKeys.district),"All");
  refreshWard(); refreshParcel();
}
function refreshWard(){const list=sourceFeatures.filter(f=>!$("districtFilter").value||String(f.properties?.[propertyKeys.district])===$("districtFilter").value);fillSelect($("wardFilter"),[...new Set(list.map(f=>String(f.properties?.[propertyKeys.ward]??"")).filter(Boolean))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})),"All");}
function refreshParcel(){const list=sourceFeatures.filter(f=>(!$("districtFilter").value||String(f.properties?.[propertyKeys.district])===$("districtFilter").value)&&(!$("wardFilter").value||String(f.properties?.[propertyKeys.ward])===$("wardFilter").value));fillSelect($("parcelFilter"),[...new Set(list.map(f=>String(f.properties?.[propertyKeys.parcel]??"")).filter(Boolean))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})),"Select parcel");}
$("districtFilter").onchange=()=>{refreshWard();refreshParcel();};
$("wardFilter").onchange=refreshParcel;
$("locateBtn").onclick=()=>{
  const matches=filteredFeatures();
  if(matches.length!==1){$("fileMessage").textContent=`Select a parcel number. ${matches.length} records currently match.`;return;}
  selectFeature(matches[0]);
};
function selectFeature(feature){
  selected=feature; splitResult=null; lastSplit=null;
  if(resultLayer){map.removeLayer(resultLayer);resultLayer=null;}
  if(boundaryLayer){map.removeLayer(boundaryLayer);boundaryLayer=null;}
  if(originalLayer)map.removeLayer(originalLayer);
  originalLayer=L.geoJSON(feature,{style:{color:"#145da0",weight:3,fillColor:"#7eb8ee",fillOpacity:.22}}).addTo(map);
  map.fitBounds(originalLayer.getBounds(),{padding:[40,40],maxZoom:19});
  const area=areaM2(feature.geometry);
  const p=feature.properties||{};
  $("areaValue").textContent=`${formatArea(area)} (${area.toFixed(2)} m²)`;
  $("landuseValue").textContent=propertyKeys.landuse?(p[propertyKeys.landuse]??"—"):"Not found";
  $("boundaryValue").textContent=perimeterM(feature.geometry).toFixed(2)+" m";
  $("splitMessage").textContent="";
  $("clearBtn").disabled=false;
  $("exportGeoBtn").disabled=true;$("exportCsvBtn").disabled=true;
}
function areaM2(geometry){return turf.area({type:"Feature",properties:{},geometry});}
function formatArea(m2){
  // Terai conversion: 1 Bigha=6772.63 m²; 1 Kattha=338.6315 m²; 1 Dhur=16.9316 m²; 1 Dhurki=0.84658 m²
  const b=Math.floor(m2/6772.63);let r=m2-b*6772.63;
  const k=Math.floor(r/338.6315);r-=k*338.6315;
  const d=Math.floor(r/16.9316);r-=d*16.9316;
  const dk=Math.round(r/0.84658);
  return `${b}-${k}-${d}-${dk}`;
}
function parseArea(s){
  const a=s.trim().split(/[-,\s]+/).map(Number);
  if(a.length<1||a.length>4||a.some(n=>!Number.isFinite(n)||n<0))throw new Error("Enter area as B-K-D or B-K-D-DK, e.g. 0-1-5-0");
  const [b=0,k=0,d=0,dk=0]=a;
  return b*6772.63+k*338.6315+d*16.9316+dk*0.84658;
}
function perimeterM(g){
  let sum=0;
  const lines=[];
  const addRing=ring=>{for(let i=1;i<ring.length;i++)sum+=turf.distance(turf.point(ring[i-1]),turf.point(ring[i]),{units:"kilometers"})*1000;};
  const polys=g.type==="Polygon"?[g.coordinates]:g.coordinates;
  polys.forEach(poly=>poly.forEach(addRing));
  return sum;
}
$("boundaryBtn").onclick=()=>{
  if(!selected)return;
  if(boundaryLayer)map.removeLayer(boundaryLayer);
  const segments=[];
  const polys=selected.geometry.type==="Polygon"?[selected.geometry.coordinates]:selected.geometry.coordinates;
  polys.forEach(poly=>poly.forEach(ring=>{for(let i=1;i<ring.length;i++)segments.push({type:"Feature",properties:{length_m:turf.distance(turf.point(ring[i-1]),turf.point(ring[i]),{units:"kilometers"})*1000},geometry:{type:"LineString",coordinates:[ring[i-1],ring[i]]}});}));
  boundaryLayer=L.geoJSON({type:"FeatureCollection",features:segments},{style:{color:"#d97706",weight:3},onEachFeature:(f,l)=>l.bindTooltip(`${f.properties.length_m.toFixed(2)} m`)}).addTo(map);
};
function mapCoords(coords,fn){return coords.map(v=>typeof v[0]==="number"?fn(v):mapCoords(v,fn));}
function geometryToMulti(g){return g.type==="Polygon"?[g.coordinates]:g.coordinates;}
function multiToGeometry(m){return m.length===1?{type:"Polygon",coordinates:m[0]}:{type:"MultiPolygon",coordinates:m};}
function shoelaceRing(r){let a=0;for(let i=0;i<r.length-1;i++)a+=r[i][0]*r[i+1][1]-r[i+1][0]*r[i][1];return Math.abs(a/2);}
function planarArea(m){let total=0;m.forEach(poly=>{if(poly[0])total+=shoelaceRing(poly[0]);for(let i=1;i<poly.length;i++)total-=shoelaceRing(poly[i]);});return Math.max(0,total);}
function geometryBbox(m){let xs=[],ys=[];m.forEach(p=>p.forEach(r=>r.forEach(c=>{xs.push(c[0]);ys.push(c[1]);})));return [Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)];}
function localProjection(feature){
  const center=turf.centerOfMass(feature).geometry.coordinates;
  const local=`+proj=aeqd +lat_0=${center[1]} +lon_0=${center[0]} +datum=WGS84 +units=m +no_defs`;
  const forward=c=>proj4("EPSG:4326",local,c);
  const inverse=c=>proj4(local,"EPSG:4326",c);
  return {forward,inverse};
}
function splitPolygon(feature,target,direction){
  const {forward,inverse}=localProjection(feature);
  const source=geometryToMulti(feature.geometry);
  const projected=mapCoords(source,forward);
  const [minX,minY,maxX,maxY]=geometryBbox(projected);
  const pad=Math.max(maxX-minX,maxY-minY)*10+100;
  const total=planarArea(projected);
  if(!(target>0&&target<total))throw new Error(`Target must be greater than zero and less than parcel area (${total.toFixed(2)} m²).`);
  const axis=(direction==="east"||direction==="west")?"x":"y";
  const wantsHigh=(direction==="north"||direction==="east");
  const lo0=axis==="x"?minX:minY, hi0=axis==="x"?maxX:maxY;
  function halfplane(t){
    if(axis==="x") return wantsHigh?[[[t,minY-pad],[maxX+pad,minY-pad],[maxX+pad,maxY+pad],[t,maxY+pad],[t,minY-pad]]]:[[[minX-pad,minY-pad],[t,minY-pad],[t,maxY+pad],[minX-pad,maxY+pad],[minX-pad,minY-pad]]];
    return wantsHigh?[[[minX-pad,t],[maxX+pad,t],[maxX+pad,maxY+pad],[minX-pad,maxY+pad],[minX-pad,t]]]:[[[minX-pad,minY-pad],[maxX+pad,minY-pad],[maxX+pad,t],[minX-pad,t],[minX-pad,minY-pad]]];
  }
  let lo=lo0,hi=hi0,best=null;
  for(let i=0;i<55;i++){
    const mid=(lo+hi)/2;
    const clipped=polygonClipping.intersection(projected,halfplane(mid));
    const a=clipped.length?planarArea(clipped):0;
    best=clipped;
    if(Math.abs(a-target)<0.01)break;
    // As threshold increases, high-side area decreases; low-side area increases.
    if(wantsHigh){if(a>target)lo=mid;else hi=mid;}
    else {if(a<target)lo=mid;else hi=mid;}
  }
  const cut=polygonClipping.intersection(projected,halfplane((lo+hi)/2));
  const remain=polygonClipping.difference(projected,cut);
  if(!cut.length||!remain.length)throw new Error("Could not create two valid polygons. Try a different direction or a smaller target area.");
  const cutGeo=mapCoords(cut,inverse),remainGeo=mapCoords(remain,inverse);
  return {
    cut:{type:"Feature",properties:{part:"Cut portion"},geometry:multiToGeometry(cutGeo)},
    remain:{type:"Feature",properties:{part:"Remaining portion"},geometry:multiToGeometry(remainGeo)}
  };
}
$("splitBtn").onclick=()=>{
  if(!selected){$("splitMessage").textContent="Select a parcel first.";return;}
  try{
    const target=parseArea($("targetArea").value);
    const total=areaM2(selected.geometry);
    if(target>=total)throw new Error("Target cut area must be smaller than the parcel area.");
    lastSplit=splitResult;
    splitResult=splitPolygon(selected,target,$("cutDirection").value);
    if(resultLayer)map.removeLayer(resultLayer);
    resultLayer=L.geoJSON({type:"FeatureCollection",features:[splitResult.cut,splitResult.remain]},{
      style:f=>f.properties.part==="Cut portion"?{color:"#d97706",weight:3,fillColor:"#f59e0b",fillOpacity:.42}:{color:"#159568",weight:3,fillColor:"#34d399",fillOpacity:.35}
    }).addTo(map);
    map.fitBounds(resultLayer.getBounds(),{padding:[40,40]});
    const ca=areaM2(splitResult.cut.geometry),ra=areaM2(splitResult.remain.geometry);
    $("splitMessage").textContent=`Cut: ${ca.toFixed(2)} m² (${formatArea(ca)}). Remaining: ${ra.toFixed(2)} m² (${formatArea(ra)}).`;
    $("undoBtn").disabled=false;$("exportGeoBtn").disabled=false;$("exportCsvBtn").disabled=false;$("clearBtn").disabled=false;
  }catch(err){$("splitMessage").textContent="Split error: "+err.message;console.error(err);}
};
$("undoBtn").onclick=()=>{
  if(!lastSplit)return;
  splitResult=lastSplit;lastSplit=null;
  if(resultLayer)map.removeLayer(resultLayer);
  resultLayer=L.geoJSON({type:"FeatureCollection",features:[splitResult.cut,splitResult.remain]},{style:f=>f.properties.part==="Cut portion"?{color:"#d97706",weight:3,fillColor:"#f59e0b",fillOpacity:.42}:{color:"#159568",weight:3,fillColor:"#34d399",fillOpacity:.35}}).addTo(map);
  $("undoBtn").disabled=true;
};
$("clearBtn").onclick=()=>{
  splitResult=null;lastSplit=null;
  if(resultLayer)map.removeLayer(resultLayer);resultLayer=null;
  if(boundaryLayer)map.removeLayer(boundaryLayer);boundaryLayer=null;
  $("exportGeoBtn").disabled=true;$("exportCsvBtn").disabled=true;$("undoBtn").disabled=true;
  $("splitMessage").textContent="Split result cleared.";
};
function download(name,content,type){
  const blob=new Blob([content],{type});const url=URL.createObjectURL(blob);
  const a=document.createElement("a");a.href=url;a.download=name;a.click();URL.revokeObjectURL(url);
}
$("exportGeoBtn").onclick=()=>{
  if(!splitResult)return;
  const props=selected?.properties||{};
  const fc={type:"FeatureCollection",features:[{...splitResult.cut,properties:{...props,...splitResult.cut.properties,area_m2:areaM2(splitResult.cut.geometry)}},{...splitResult.remain,properties:{...props,...splitResult.remain.properties,area_m2:areaM2(splitResult.remain.geometry)}}]};
  download("parcel-split-result.geojson",JSON.stringify(fc,null,2),"application/geo+json");
};
$("exportCsvBtn").onclick=()=>{
  if(!splitResult)return;
  const rows=[["Part","Area_m2","Area_B-K-D-DK"],["Cut portion",areaM2(splitResult.cut.geometry),formatArea(areaM2(splitResult.cut.geometry))],["Remaining portion",areaM2(splitResult.remain.geometry),formatArea(areaM2(splitResult.remain.geometry))]];
  download("parcel-split-areas.csv",rows.map(r=>r.join(",")).join("\n"),"text/csv");
};
