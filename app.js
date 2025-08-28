// ClimbTrack - Shared helpers

const CT_APP_NAME = "ClimbTrack";
const CT_STORAGE_KEY = "ct_identite";

export function renderFooter(){
  const f = document.querySelector('footer .footer-inner');
  if(!f) return;
  f.textContent = `${CT_APP_NAME} - Equipe EPS Lycée Vauban - LUXEMBOURG - JB`;
}

export function saveIdentite(data){
  localStorage.setItem(CT_STORAGE_KEY, JSON.stringify(data));
}
export function getIdentite(){
  try{ return JSON.parse(localStorage.getItem(CT_STORAGE_KEY)||"{}"); }
  catch(e){ return {}; }
}
export function ensureIdentite(){
  const id = getIdentite();
  if(!id || !id.Nom || !id.Prenom || !id.Classe){
    window.location.href = "index.html";
  }
  return id;
}

// QR Code
export function makeQR(targetEl, payload){
  // Requires QRCode library loaded globally
  const el = (typeof targetEl === 'string') ? document.getElementById(targetEl) : targetEl;
  if(!el){ console.error('QR target not found'); return; }
  el.innerHTML = "";
  const json = JSON.stringify(payload);
  // eslint-disable-next-line no-undef
  const qr = new QRCode(el, { text: json, width: 256, height: 256, correctLevel: QRCode.CorrectLevel.M });
  return { json, el };
}

export function nowISO(){
  return new Date().toISOString();
}

export function headerInit(){
  const homeBtn = document.getElementById('btn-home');
  if(homeBtn){ homeBtn.addEventListener('click', ()=>{ window.location.href='menu.html'; }); }

  const helpBtn = document.getElementById('btn-help');
  if(helpBtn){ helpBtn.addEventListener('click', ()=>{ window.location.href='aide.html'; }); }

  const secuBtn = document.getElementById('btn-securite');
  if(secuBtn){ secuBtn.addEventListener('click', ()=>{ window.location.href='securite.html'; }); }
}

// Format time mm:ss.cc from parts
export function formatTime(min, sec, centi){
  min = parseInt(min||0,10); sec = parseInt(sec||0,10); centi = parseInt(centi||0,10);
  if(isNaN(min)) min = 0; if(isNaN(sec)) sec = 0; if(isNaN(centi)) centi = 0;
  if(sec>=60){ min += Math.floor(sec/60); sec = sec%60; }
  const mm = String(min).padStart(2,'0');
  const ss = String(sec).padStart(2,'0');
  const cc = String(centi).padStart(2,'0');
  return `${mm}:${ss}.${cc}`;
}
