const CT_APP_NAME='ClimbTrack', CT_STORAGE_KEY='ct_identite', CT_SEANCE_KEY='ct_seance';
export function renderFooter(){const f=document.querySelector('footer .footer-inner'); if(f) f.textContent=`${CT_APP_NAME} - Equipe EPS Lycée Vauban - LUXEMBOURG - JB`;}
export function saveIdentite(d){localStorage.setItem(CT_STORAGE_KEY, JSON.stringify(d));}
export function getIdentite(){try{return JSON.parse(localStorage.getItem(CT_STORAGE_KEY)||'{}');}catch(e){return {};}}
export function ensureIdentite(){const id=getIdentite(); if(!id||!id.Nom||!id.Prenom||!id.Classe){location.href='identite.html';} return id;}
export function loadSeance(){try{return JSON.parse(localStorage.getItem(CT_SEANCE_KEY)||'{}');}catch(e){return {};}}
export function saveSeance(o){localStorage.setItem(CT_SEANCE_KEY, JSON.stringify(o));}
export function clearSeance(){localStorage.removeItem(CT_SEANCE_KEY);}
export function parseTimeToCentis(s){const m=+s.slice(0,2)||0, x=+s.slice(3,5)||0, c=+s.slice(6,8)||0; return m*6000+x*100+c;}
export function formatTime(m,s,c){m=+m||0; s=+s||0; c=+c||0; if(s>=60){m+=Math.floor(s/60); s%=60;} return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${String(c).padStart(2,'0')}`;}
export function makeQR(el,text){if(typeof el==='string')el=document.getElementById(el); if(!el)return; el.innerHTML=''; function build(){ if(typeof QRCode==='undefined'){setTimeout(build,80); return;} new QRCode(el,{text, width:320, height:320, correctLevel:QRCode.CorrectLevel.M}); } build(); return text;}
