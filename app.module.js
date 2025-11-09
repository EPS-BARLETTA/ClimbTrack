const CT_APP_NAME='ClimbTrack',
      CT_STORAGE_KEY='ct_identite',
      CT_SEANCE_KEY='ct_seance',
      CT_ROUTE_IMG='ct_route_img';

function renderFooter(){
  const f=document.querySelector('footer .footer-inner');
  if(f) f.textContent=`${CT_APP_NAME} - Equipe EPS Lycée Vauban - LUXEMBOURG - JB`;
}
window.renderFooter = renderFooter;

function saveIdentite(d){ localStorage.setItem(CT_STORAGE_KEY, JSON.stringify(d)); }
window.saveIdentite = saveIdentite;

function getIdentite(){ 
  try { return JSON.parse(localStorage.getItem(CT_STORAGE_KEY)||'{}'); } 
  catch(e){ return {}; } 
}
window.getIdentite = getIdentite;

function ensureIdentite(){ 
  const id=getIdentite(); 
  if(!id||!id.nom||!id.prenom||!id.classe){ location.href='identite.html'; } 
  return id; 
}
window.ensureIdentite = ensureIdentite;

// --- Seance ---
function loadSeance(){ 
  try { return JSON.parse(localStorage.getItem(CT_SEANCE_KEY)||'{}'); } 
  catch(e){ return {}; } 
}
window.loadSeance = loadSeance;

function saveSeanceMerge(newData){
  const old = loadSeance();
  const merged = { ...old, ...newData };
  localStorage.setItem(CT_SEANCE_KEY, JSON.stringify(merged));
}
window.saveSeanceMerge = saveSeanceMerge;

function clearSeance(){ localStorage.removeItem(CT_SEANCE_KEY); }
window.clearSeance = clearSeance;

// --- Temps ---
function parseTimeToCentis(s){ 
  const m=+s.slice(0,2)||0, x=+s.slice(3,5)||0, c=+s.slice(6,8)||0; 
  return m*6000+x*100+c; 
}
window.parseTimeToCentis = parseTimeToCentis;

function formatTime(m,s,c){
  m=+m||0; s=+s||0; c=+c||0; 
  if(s>=60){ m+=Math.floor(s/60); s%=60; } 
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}:${String(c).padStart(2,'0')}`; 
}
window.formatTime = formatTime;

// --- QR code ---
function makeQR(el, obj, level='H'){ 
  if(typeof el==='string') el=document.getElementById(el); 
  if(!el) return;
  const text = JSON.stringify([obj]);
  el.innerHTML='';
  function build(){ 
    if(typeof QRCode==='undefined'){ setTimeout(build,80); return; }
    new QRCode(el,{ text, width:512, height:512, correctLevel:QRCode.CorrectLevel[level] || QRCode.CorrectLevel.H });
  } 
  build(); 
  return text;
}
window.makeQR = makeQR;

// --- Route photos ---
function setRouteImage(dataURL){ sessionStorage.setItem(CT_ROUTE_IMG, dataURL); }
window.setRouteImage = setRouteImage;

function getRouteImage(){ return sessionStorage.getItem(CT_ROUTE_IMG)||null; }
window.getRouteImage = getRouteImage;

const CT_ROUTE_GALLERY='ct_route_gallery';
function saveRouteToGallery(dataURL){
  let arr=[]; 
  try{ arr=JSON.parse(localStorage.getItem(CT_ROUTE_GALLERY)||'[]'); }catch(e){ arr=[]; }
  const rec={ id: Date.now(), img:dataURL };
  arr.unshift(rec);
  localStorage.setItem(CT_ROUTE_GALLERY, JSON.stringify(arr));
}
window.saveRouteToGallery = saveRouteToGallery;

function getRouteGallery(){ 
  try{ return JSON.parse(localStorage.getItem(CT_ROUTE_GALLERY)||'[]'); } 
  catch(e){ return []; } 
}
window.getRouteGallery = getRouteGallery;

function deleteRouteFromGallery(id){ 
  let arr=getRouteGallery(); 
  arr = arr.filter(x=>x.id!==id); 
  localStorage.setItem(CT_ROUTE_GALLERY, JSON.stringify(arr)); 
}
window.deleteRouteFromGallery = deleteRouteFromGallery;

const CT_LAST_QR='ct_last_qr_text';
function setLastQRText(t){ try{ sessionStorage.setItem(CT_LAST_QR, t);}catch(e){} }
window.setLastQRText = setLastQRText;

function getLastQRText(){ try{ return sessionStorage.getItem(CT_LAST_QR)||'';}catch(e){ return ''; } }
window.getLastQRText = getLastQRText;
