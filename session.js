// session.js — Escalade V5+ (full-screen annotation, draw + circles, PNG export)
(() => {
  const $ = s => document.querySelector(s);
  const timesTbody = $('#timesTable tbody');
  let times = [];

  function renderTimes(){
    timesTbody.innerHTML = '';
    times.forEach((v, i) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${i+1}</td>
        <td><input type="number" step="0.01" min="0" value="${v}" data-idx="${i}" class="time-input"></td>
        <td><button class="btn danger del" data-idx="${i}">Suppr.</button></td>`;
      timesTbody.appendChild(tr);
    });
  }

  $('#addTimeBtn').addEventListener('click', () => {
    times.push('');
    renderTimes();
  });

  timesTbody.addEventListener('input', (e) => {
    if (e.target.classList.contains('time-input')){
      const idx = +e.target.dataset.idx;
      times[idx] = e.target.value;
    }
  });
  timesTbody.addEventListener('click', (e) => {
    if (e.target.classList.contains('del')){
      const idx = +e.target.dataset.idx;
      times.splice(idx,1);
      renderTimes();
    }
  });

  // === Annotation system (two canvases: base + ink) ===
  const canvas = $('#canvas');                // display canvas (composited for export)
  const ctx = canvas.getContext('2d');
  const fsCanvas = $('#fsCanvas');            // full-screen canvas
  const fsCtx = fsCanvas.getContext('2d');

  // We draw freehand on an offscreen ink canvas; circles are vector; background is image.
  const ink = document.createElement('canvas');
  ink.width = canvas.width; ink.height = canvas.height;
  const inkCtx = ink.getContext('2d');

  let bgImage = null;
  let mode = 'draw'; // 'draw' | 'circle'
  let drawing = false;
  let last = null;
  let circles = []; // {x,y,r}
  const RADIUS = 22;

  // canvas transform helper: map client (CSS) -> canvas pixels
  function toCanvasCoords(targetCanvas, touchOrMouse){
    const rect = targetCanvas.getBoundingClientRect();
    const scaleX = targetCanvas.width / rect.width;
    const scaleY = targetCanvas.height / rect.height;
    let cx, cy;
    if (touchOrMouse.touches && touchOrMouse.touches[0]){
      cx = touchOrMouse.touches[0].clientX - rect.left;
      cy = touchOrMouse.touches[0].clientY - rect.top;
    } else {
      cx = touchOrMouse.clientX - rect.left;
      cy = touchOrMouse.clientY - rect.top;
    }
    return {x: cx * scaleX, y: cy * scaleY};
  }

  function fitImageRect(img, target){
    const ratio = Math.min(target.width / img.width, target.height / img.height);
    const w = img.width * ratio;
    const h = img.height * ratio;
    const x = (target.width - w)/2;
    const y = (target.height - h)/2;
    return {x,y,w,h,ratio};
  }

  let imgRect = null;

  function composeTo(targetCtx, targetCanvas){
    // Clear
    targetCtx.clearRect(0,0,targetCanvas.width,targetCanvas.height);
    // background
    if (bgImage){
      if (!imgRect) imgRect = fitImageRect(bgImage, targetCanvas);
      targetCtx.drawImage(bgImage, imgRect.x, imgRect.y, imgRect.w, imgRect.h);
    } else {
      targetCtx.fillStyle = '#0a0a0f';
      targetCtx.fillRect(0,0,targetCanvas.width,targetCanvas.height);
      targetCtx.strokeStyle = '#222833';
      targetCtx.strokeRect(0.5,0.5,targetCanvas.width-1,targetCanvas.height-1);
    }
    // ink (freehand)
    targetCtx.drawImage(ink, 0, 0);
    // circles
    targetCtx.lineWidth = 3;
    targetCtx.strokeStyle = '#f5f5f5';
    circles.forEach(c => {
      targetCtx.beginPath();
      targetCtx.arc(c.x, c.y, c.r, 0, Math.PI*2);
      targetCtx.stroke();
    });
  }

  function redraw(){
    composeTo(ctx, canvas);
  }

  // Drawing handlers (bind to active canvas element: either canvas or fsCanvas)
  let activeCanvas = canvas;
  let activeCtx = ctx;

  function pointerDown(e){
    e.preventDefault();
    const p = toCanvasCoords(activeCanvas, e);
    if (mode === 'draw'){
      drawing = true;
      last = p;
    } else {
      const hit = circles.find(c => Math.hypot(c.x - p.x, c.y - p.y) <= c.r+6);
      if (!hit){
        circles.push({x:p.x, y:p.y, r:RADIUS});
        redrawAll();
      } else {
        drawing = true;
        last = p;
        hit._drag = true;
      }
    }
  }
  function pointerMove(e){
    if (!drawing) return;
    const p = toCanvasCoords(activeCanvas, e);
    if (mode === 'draw'){
      const st = inkCtx;
      st.lineWidth = 4;
      st.lineCap = 'round';
      st.strokeStyle = '#38bdf8';
      st.beginPath();
      st.moveTo(last.x, last.y);
      st.lineTo(p.x, p.y);
      st.stroke();
      last = p;
      redrawAll();
    } else {
      circles.forEach(c => {
        if (c._drag){
          c.x += (p.x - last.x);
          c.y += (p.y - last.y);
        }
      });
      last = p;
      redrawAll();
    }
  }
  function pointerUp(){
    drawing = false;
    circles.forEach(c => delete c._drag);
  }

  function bindPointerEvents(el){
    el.addEventListener('pointerdown', pointerDown);
    el.addEventListener('pointermove', pointerMove);
    el.addEventListener('pointerup', pointerUp);
    el.addEventListener('pointerleave', pointerUp);
  }
  bindPointerEvents(canvas);
  bindPointerEvents(fsCanvas);

  // Double tap delete (on both canvases)
  let lastTap = 0;
  function handleDoubleTap(e){
    const now = Date.now();
    const p = toCanvasCoords(activeCanvas, e);
    if (now - lastTap < 300){
      const idx = circles.findIndex(c => Math.hypot(c.x - p.x, c.y - p.y) <= c.r+6);
      if (idx >= 0){
        circles.splice(idx,1);
        redrawAll();
        lastTap = 0;
        return;
      }
    }
    lastTap = now;
  }
  canvas.addEventListener('pointerdown', handleDoubleTap);
  fsCanvas.addEventListener('pointerdown', handleDoubleTap);

  // Photo load
  $('#photoInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        bgImage = img;
        imgRect = null;
        redrawAll();
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });

  // Modes
  $('#modeDrawBtn').addEventListener('click', ()=>{
    mode = 'draw';
    $('#modeDrawBtn').classList.add('primary');
    $('#modeCircleBtn').classList.remove('primary');
  });
  $('#modeCircleBtn').addEventListener('click', ()=>{
    mode = 'circle';
    $('#modeCircleBtn').classList.add('primary');
    $('#modeDrawBtn').classList.remove('primary');
  });

  // Clear (only ink strokes; circles remain)
  $('#clearBtn').addEventListener('click', ()=>{
    inkCtx.clearRect(0,0,ink.width,ink.height);
    redrawAll();
  });

  // Fullscreen (CSS-based wrapper to preserve bitmap scale + correct coords)
  const fsWrap = $('#fsWrap');
  $('#fsBtn').addEventListener('click', () => {
    fsWrap.classList.add('show');
    activeCanvas = fsCanvas;
    activeCtx = fsCtx;
    redrawAll();
  });
  $('#exitFsBtn').addEventListener('click', () => {
    fsWrap.classList.remove('show');
    activeCanvas = canvas;
    activeCtx = ctx;
    redrawAll();
  });

  // Export annotated PNG
  function exportAnnotatedDataURL(){
    const tmp = document.createElement('canvas');
    tmp.width = canvas.width; tmp.height = canvas.height;
    const tctx = tmp.getContext('2d');
    composeTo(tctx, tmp);
    return tmp.toDataURL('image/png');
  }
  $('#downloadPngBtn').addEventListener('click', () => {
    const url = exportAnnotatedDataURL();
    const a = document.createElement('a');
    a.href = url;
    a.download = 'voie_annotee.png';
    a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href), 2000);
  });

  // Save route image locally
  function saveRouteImage(){
    const dataUrl = exportAnnotatedDataURL();
    const routeId = 'route-' + Date.now();
    try { localStorage.setItem(routeId, dataUrl); } catch(e) {}
    return routeId;
  }
  $('#saveRouteBtn').addEventListener('click', () => {
    const id = saveRouteImage();
    alert('Voie enregistrée avec id: ' + id + '\\n(Stockée localement)');
  });

  function getFormData(){
    const nom = $('#nom').value.trim();
    const prenom = $('#prenom').value.trim();
    const classe = $('#classe').value.trim();
    const sexe = $('#sexe').value;
    const timesClean = times.map(t => t === '' ? null : +t).filter(v => typeof v === 'number' && !isNaN(v));
    const bloc = { tops: +$('#bloc_tops').value || 0, zones: +$('#bloc_zones').value || 0, essais: +$('#bloc_essais').value || 0 };
    const difficulte = { cote: $('#diff_cote').value.trim(), hauteur_pct: +$('#diff_pct').value || 0, chute: $('#diff_chute').value === 'oui' };
    return {nom, prenom, classe, sexe, times: timesClean, bloc, difficulte};
  }

  function buildPayload(){
    const f = getFormData();
    const payload = {
      App: "EscaladeV5",
      Nom: f.nom, Prenom: f.prenom, Classe: f.classe, Sexe: f.sexe,
      Session: { date: new Date().toISOString().slice(0,10) },
      Vitesse: { temps_s: f.times },
      Bloc: f.bloc,
      Difficulte: f.difficulte,
    };
    return payload;
  }

  function redrawAll(){
    composeTo(ctx, canvas);
    composeTo(fsCtx, fsCanvas);
  }

  // Generate QR via public API
  $('#genBtn').addEventListener('click', () => {
    const p = buildPayload();
    if (bgImage){
      const id = saveRouteImage();
      p.Route = { id };
    }
    const jsonStr = JSON.stringify(p);
    $('#jsonOut').textContent = jsonStr;
    const url = 'https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=' + encodeURIComponent(jsonStr);
    $('#qrImg').src = url;
  });

  $('#copyJsonBtn').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText($('#jsonOut').textContent || JSON.stringify(buildPayload()));
      alert('JSON copié dans le presse-papiers.');
    } catch(e) {
      alert('Copie impossible. Sélectionnez le JSON et copiez-le manuellement.');
    }
  });
  $('#dlJsonBtn').addEventListener('click', () => {
    const blob = new Blob([$('#jsonOut').textContent || JSON.stringify(buildPayload())], {type:'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    const f = getFormData();
    const name = (f.nom||'eleve') + '_' + (f.prenom||'') + '_escalade.json';
    a.download = name.replace(/\s+/g,'_');
    a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href), 2000);
  });

  // First render
  redrawAll();
})();