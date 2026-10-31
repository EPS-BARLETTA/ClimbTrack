/* ClimbTrack v2 — Escalade (Bloc, Difficulté, Vitesse, Mes voies)
 * Le QR de fin de séance garde EXACTEMENT le format de la v1, lu par ScanProf :
 *   [{"nom","prenom","classe","bloc_1":"vert R3","difficulte_1":"M R8 5C E","vitesse":"00:09:45"}]
 */
(function () {
  "use strict";

  /* =========================================================
   * Constantes
   * ======================================================= */
  var KEY_ID = "ct2_identite";
  var KEY_SEANCE = "ct2_seance";
  var KEY_TAB = "ct2_tab";
  var OLD_KEY_ID = "ct_identite";
  var OLD_KEY_GALLERY = "ct_route_gallery";
  var KEY_ROUTES_MIGRATED = "ct2_routes_migrated";
  var CARNET_URL = "https://carnetentrainementv2.vercel.app/";

  var COLORS = [
    { id: "jaune", label: "Jaune", lvl: "facile", txt: "facile", dot: "#facc15" },
    { id: "vert", label: "Vert", lvl: "peu_difficile", txt: "peu difficile", dot: "#22c55e" },
    { id: "bleu", label: "Bleu", lvl: "assez_difficile", txt: "assez difficile", dot: "#3b82f6" },
    { id: "rouge", label: "Rouge", lvl: "difficile", txt: "difficile", dot: "#ef4444" },
    { id: "noir", label: "Noir", lvl: "tres_difficile", txt: "très difficile", dot: "#111111" },
    { id: "mauve", label: "Mauve", lvl: "abominable", txt: "abominable", dot: "#a855f7" },
  ];
  var COLOR_BY_ID = {};
  COLORS.forEach(function (c) { COLOR_BY_ID[c.id] = c; });

  var GRADES = ["3", "3+", "4", "4+", "5A", "5A+", "5B", "5B+", "5C", "5C+",
    "6A", "6A+", "6B", "6B+", "6C", "6C+", "7A", "7A+"];
  var STYLES = { moulinette: { code: "M", label: "Moulinette" }, en_tete: { code: "T", label: "En tête" }, mouli_tete: { code: "MT", label: "Mouli-tête" } };
  var RESULTS = { e1: "Enchaînée (1er essai)", e2: "Enchaînée (2e essai)", ne: "Pas enchaînée" };

  /* =========================================================
   * Utilitaires
   * ======================================================= */
  function $(id) { return document.getElementById(id); }
  function esc(v) {
    return String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function load(key, fallback) {
    try { var v = JSON.parse(localStorage.getItem(key)); return v == null ? fallback : v; }
    catch (e) { return fallback; }
  }
  function store(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (e) {
      toast("⚠️ Mémoire pleine : impossible d'enregistrer. Supprime des voies dans « Mes voies ».", true);
      return false;
    }
  }
  var toastTimer = null;
  function toast(msg, isError) {
    var t = $("toast");
    t.textContent = msg;
    t.classList.toggle("err", !!isError);
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove("show"); }, isError ? 4000 : 1800);
  }
  function pad2(n) { n = Math.max(0, Math.floor(n)); return (n < 10 ? "0" : "") + n; }
  function formatTime(m, s, c) {
    m = +m || 0; s = +s || 0; c = +c || 0;
    if (s >= 60) { m += Math.floor(s / 60); s %= 60; }
    return pad2(m) + ":" + pad2(s) + ":" + pad2(c);
  }
  function timeToCentis(t) {
    var p = String(t).split(":");
    return (+p[0] || 0) * 6000 + (+p[1] || 0) * 100 + (+p[2] || 0);
  }
  function prettyTime(t) {
    var p = String(t).split(":");
    var m = +p[0] || 0, s = +p[1] || 0, c = p[2] || "00";
    return (m ? m + " min " : "") + s + "," + c + " s";
  }
  function todayFr() { return new Date().toLocaleDateString("fr-FR"); }
  function fileSafe(s) {
    return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9_-]+/g, "_");
  }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  /* =========================================================
   * Classe : « 5ème A » → 5A, « Terminale B » → TB, « 2nde C » → 2C
   * ======================================================= */
  function normalizeClasse(raw) {
    var s = String(raw || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
      .toLowerCase().replace(/[\s_\-.°/]+/g, " ").trim();
    if (!s) return "";
    var tail = "\\s*([a-z0-9]{0,3})$";
    var m;
    var words = { sixieme: "6", cinquieme: "5", quatrieme: "4", troisieme: "3" };
    if ((m = s.match(new RegExp("^(terminale|term|tale|tle|tl|t)" + tail)))) return "T" + m[2].toUpperCase();
    if ((m = s.match(new RegExp("^(premiere|1ere|1re|1er|1e)" + tail)))) return "1" + m[2].toUpperCase();
    if ((m = s.match(new RegExp("^(seconde|2nde|2nd|2de|2eme|2e)" + tail)))) return "2" + m[2].toUpperCase();
    if ((m = s.match(new RegExp("^(sixieme|cinquieme|quatrieme|troisieme)" + tail)))) return words[m[1]] + m[2].toUpperCase();
    if ((m = s.match(new RegExp("^([3-6])\\s*(?:eme|ieme|em|e)?" + tail)))) return m[1] + m[2].toUpperCase();
    if ((m = s.match(/^([12])\s*([a-z][a-z0-9]{0,2})?$/))) return m[1] + (m[2] || "").toUpperCase();
    return String(raw).trim().toUpperCase().replace(/\s+/g, "");
  }

  /* =========================================================
   * Données : identité + séance
   * ======================================================= */
  var identite = load(KEY_ID, null);
  if (!identite) {
    var old = load(OLD_KEY_ID, null); // reprise de l'identité de la v1
    if (old && old.nom && old.prenom && old.classe) {
      identite = { nom: old.nom, prenom: old.prenom, classe: normalizeClasse(old.classe) };
      store(KEY_ID, identite);
    }
  }

  function newSeance() {
    return { id: uid(), startedAt: new Date().toISOString(), bloc: [], difficulte: [], vitesse: [] };
  }
  var seance = load(KEY_SEANCE, null);
  if (!seance || typeof seance !== "object") {
    seance = newSeance();
    // Reprise d'une séance commencée sur l'ancienne version (clé ct_seance)
    var oldS = load("ct_seance", null);
    if (oldS && typeof oldS === "object") {
      if (Array.isArray(oldS.bloc)) seance.bloc = oldS.bloc.filter(function (b) { return b && b.c && b.n; });
      if (Array.isArray(oldS.difficulte)) seance.difficulte = oldS.difficulte.filter(function (d) { return d && d.cotation; });
      if (oldS.vitesse && Array.isArray(oldS.vitesse.essais)) seance.vitesse = oldS.vitesse.essais.filter(Boolean);
      if (seance.bloc.length || seance.difficulte.length || seance.vitesse.length) store(KEY_SEANCE, seance);
    }
  }
  ["bloc", "difficulte", "vitesse"].forEach(function (k) { if (!Array.isArray(seance[k])) seance[k] = []; });

  function saveSeance() {
    seance.updatedAt = new Date().toISOString();
    store(KEY_SEANCE, seance);
    updateCounts();
  }
  function seanceIsEmpty() {
    return !seance.bloc.length && !seance.difficulte.length && !seance.vitesse.length;
  }

  /* ---------- Fenêtres (avec secours pour les anciens iPad sans <dialog>) ---------- */
  function openDialog(id) {
    var d = $(id);
    if (typeof d.showModal === "function") {
      try { if (!d.open) d.showModal(); return; } catch (e) {}
    }
    d.setAttribute("open", "");
    d.classList.add("dlg-fallback");
    document.body.classList.add("dlg-fallback-open");
  }
  function closeDialog(id) {
    var d = $(id);
    if (typeof d.close === "function" && d.open && !d.classList.contains("dlg-fallback")) { d.close(); return; }
    d.removeAttribute("open");
    d.classList.remove("dlg-fallback");
    document.body.classList.remove("dlg-fallback-open");
  }
  // Les boutons « Fermer » des fenêtres ne doivent jamais recharger la page
  document.querySelectorAll("dialog form").forEach(function (f) {
    f.addEventListener("submit", function (e) {
      e.preventDefault();
      closeDialog(f.closest("dialog").id);
    });
  });

  /* =========================================================
   * Écrans
   * ======================================================= */
  function showIdentity(canCancel) {
    $("screen-app").hidden = true;
    $("screen-id").hidden = false;
    $("id-cancel").hidden = !canCancel;
    if (identite) {
      $("id-nom").value = identite.nom || "";
      $("id-prenom").value = identite.prenom || "";
      $("id-classe").value = identite.classeSaisie || identite.classe || "";
    }
    updateClassePreview();
  }

  function showApp() {
    $("screen-id").hidden = true;
    $("screen-app").hidden = false;
    $("who-name").textContent = identite.prenom + " " + identite.nom;
    $("who-classe").textContent = identite.classe;
    var hashTab = (location.hash || "").replace("#", "");
    selectTab(PANELS[hashTab] ? hashTab : (load(KEY_TAB, "bloc") || "bloc"));
    checkOldSeance();
  }

  function updateClassePreview() {
    var c = normalizeClasse($("id-classe").value);
    $("id-classe-preview").textContent = c ? "→ Classe enregistrée : " + c : "";
  }

  $("id-classe").addEventListener("input", updateClassePreview);
  $("id-cancel").addEventListener("click", function () { if (identite) showApp(); });
  $("btn-change-id").addEventListener("click", function () { showIdentity(true); });

  $("id-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var nom = $("id-nom").value.trim();
    var prenom = $("id-prenom").value.trim();
    var classeSaisie = $("id-classe").value.trim();
    var classe = normalizeClasse(classeSaisie);
    if (!nom || !prenom || !classe) return;
    var changed = identite && (identite.nom.toLowerCase() !== nom.toLowerCase() || identite.prenom.toLowerCase() !== prenom.toLowerCase());
    if (changed && !seanceIsEmpty()) {
      var ok = confirm(
        "La séance de " + identite.prenom + " " + identite.nom + " n'est pas vide.\n\n" +
        "Commencer une nouvelle séance pour " + prenom + " " + nom + " ?\n" +
        "(La séance de " + identite.prenom + " sera effacée de cette tablette.)"
      );
      if (!ok) return;
      seance = newSeance();
      saveSeance();
    }
    identite = { nom: nom, prenom: prenom, classe: classe, classeSaisie: classeSaisie };
    store(KEY_ID, identite);
    renderAll();
    showApp();
  });

  /* =========================================================
   * Onglets
   * ======================================================= */
  var PANELS = { bloc: 1, diff: 1, vit: 1, voies: 1, fin: 1 };
  function selectTab(tab) {
    if (!PANELS[tab]) tab = "bloc";
    document.querySelectorAll(".tab").forEach(function (b) {
      b.setAttribute("aria-selected", b.dataset.tab === tab ? "true" : "false");
    });
    document.querySelectorAll(".panel").forEach(function (p) { p.hidden = p.dataset.panel !== tab; });
    try { localStorage.setItem(KEY_TAB, JSON.stringify(tab)); } catch (e) {}
    if (history.replaceState) history.replaceState(null, "", "#" + tab);
    if (tab === "fin") renderFin();
    if (tab === "voies") renderGallery();
    window.scrollTo(0, 0);
  }
  document.querySelectorAll(".tab").forEach(function (b) {
    b.addEventListener("click", function () { selectTab(b.dataset.tab); });
  });

  function updateCounts() {
    $("count-bloc").textContent = seance.bloc.length || "";
    $("count-diff").textContent = seance.difficulte.length || "";
    $("count-vit").textContent = seance.vitesse.length || "";
  }

  /* =========================================================
   * BLOC
   * ======================================================= */
  var blocColor = "jaune";
  function renderBlocColors() {
    $("bloc-colors").innerHTML = COLORS.map(function (c) {
      return '<button type="button" class="color-btn c-' + c.id + '" data-color="' + c.id + '" aria-pressed="' +
        (c.id === blocColor) + '">' + c.label + "<small>" + c.txt + "</small></button>";
    }).join("");
  }
  $("bloc-colors").addEventListener("click", function (e) {
    var b = e.target.closest("[data-color]");
    if (!b) return;
    blocColor = b.dataset.color;
    renderBlocColors();
    $("bloc-num").focus();
  });

  function addBloc() {
    var n = parseInt($("bloc-num").value, 10);
    if (!n || n < 1) { toast("Tape le numéro du bloc.", true); $("bloc-num").focus(); return; }
    var dup = seance.bloc.some(function (b) { return b.c === blocColor && b.n === n; });
    if (dup && !confirm("Le bloc " + COLOR_BY_ID[blocColor].label + " n°" + n + " est déjà dans ta liste. L'ajouter encore ?")) return;
    seance.bloc.push({ c: blocColor, n: n, lvl: COLOR_BY_ID[blocColor].lvl });
    saveSeance();
    $("bloc-num").value = "";
    renderBlocList();
    toast("✅ Bloc " + COLOR_BY_ID[blocColor].label + " n°" + n + " ajouté");
  }
  $("bloc-add").addEventListener("click", addBloc);
  $("bloc-num").addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); addBloc(); } });

  function renderBlocList() {
    var list = seance.bloc;
    $("bloc-total").textContent = list.length ? "(" + list.length + ")" : "";
    if (!list.length) { $("bloc-list").innerHTML = '<p class="empty">Aucun bloc pour l\'instant.</p>'; return; }
    $("bloc-list").innerHTML = list.map(function (b, i) {
      var c = COLOR_BY_ID[b.c] || { label: b.c, dot: "#999" };
      return '<span class="chip"><span class="dot" style="background:' + c.dot + '"></span>' + esc(c.label) +
        " n°" + esc(b.n) + '<button class="x" data-del-bloc="' + i + '" aria-label="Retirer">✕</button></span>';
    }).join("");
  }
  $("bloc-list").addEventListener("click", function (e) {
    var b = e.target.closest("[data-del-bloc]");
    if (!b) return;
    seance.bloc.splice(+b.dataset.delBloc, 1);
    saveSeance();
    renderBlocList();
  });

  /* =========================================================
   * DIFFICULTÉ
   * ======================================================= */
  var diff = { cotation: "", relais: 0, style: "moulinette", res: "", degx: 0, nbprise: 0, td: false };

  function renderDiffForm() {
    var isCustom = diff.cotation && GRADES.indexOf(diff.cotation) === -1;
    $("diff-grades").innerHTML = GRADES.map(function (g) {
      return '<button type="button" data-grade="' + g + '" aria-pressed="' + (diff.cotation === g) + '">' + g + "</button>";
    }).join("") + '<button type="button" data-grade="__other" aria-pressed="' + !!isCustom + '">' +
      (isCustom ? esc(diff.cotation) : "Autre…") + "</button>";
    $("diff-degx").textContent = diff.degx;
    $("diff-nbprise").textContent = diff.nbprise;
    document.querySelectorAll("#diff-style button").forEach(function (b) { b.setAttribute("aria-pressed", b.dataset.val === diff.style); });
    document.querySelectorAll("#diff-result button").forEach(function (b) { b.setAttribute("aria-pressed", b.dataset.val === diff.res); });
    $("diff-ne").hidden = diff.res !== "ne";
    $("diff-td").setAttribute("aria-pressed", diff.td);
    $("diff-td").textContent = diff.td ? "Oui" : "Non";
  }

  $("diff-grades").addEventListener("click", function (e) {
    var b = e.target.closest("[data-grade]");
    if (!b) return;
    if (b.dataset.grade === "__other") {
      var v = prompt("Cotation de la voie (ex. 5B+, 6A) :", diff.cotation || "");
      if (v == null) return;
      v = v.trim().toUpperCase().replace(/\s+/g, "");
      if (!v) return;
      diff.cotation = v;
    } else {
      diff.cotation = b.dataset.grade;
    }
    $("diff-hint").textContent = "";
    renderDiffForm();
  });

  document.querySelectorAll(".stepper").forEach(function (st) {
    st.addEventListener("click", function (e) {
      var b = e.target.closest("[data-step]");
      if (!b) return;
      var key = st.dataset.stepper;
      var max = key === "nbprise" ? 20 : 60;
      diff[key] = Math.max(0, Math.min(max, (diff[key] || 0) + (+b.dataset.step)));
      renderDiffForm();
    });
  });
  $("diff-style").addEventListener("click", function (e) {
    var b = e.target.closest("[data-val]");
    if (!b) return;
    diff.style = b.dataset.val;
    renderDiffForm();
  });
  $("diff-result").addEventListener("click", function (e) {
    var b = e.target.closest("[data-val]");
    if (!b) return;
    diff.res = b.dataset.val;
    $("diff-hint").textContent = "";
    renderDiffForm();
  });
  $("diff-td").addEventListener("click", function () { diff.td = !diff.td; renderDiffForm(); });

  $("diff-relais").addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); e.target.blur(); } });
  $("diff-add").addEventListener("click", function () {
    if (!diff.cotation) { $("diff-hint").textContent = "Choisis d'abord la cotation (étape 1)."; return; }
    if (!diff.res) { $("diff-hint").textContent = "Choisis le résultat (étape 4)."; return; }
    var relaisTxt = $("diff-relais").value.trim();
    var relais = parseInt(relaisTxt, 10);
    if (relaisTxt && (isNaN(relais) || relais < 0 || relais > 999)) { $("diff-hint").textContent = "Numéro de relais invalide."; return; }
    diff.relais = isNaN(relais) ? 0 : relais;
    var it = { cotation: diff.cotation, relais: diff.relais, style: diff.style, res: diff.res };
    if (diff.res === "ne") { it.degx = diff.degx; it.nbprise = diff.nbprise; it.td = diff.td; }
    seance.difficulte.push(it);
    saveSeance();
    toast("✅ Voie " + it.cotation + " ajoutée");
    // On garde cotation / relais / style (2e essai fréquent), on remet le résultat à zéro
    diff.res = ""; diff.degx = 0; diff.nbprise = 0; diff.td = false;
    renderDiffForm();
    renderDiffList();
  });

  function neDetails(d) {
    var parts = [];
    if (d.degx > 0) parts.push("arrêt dégaine " + d.degx);
    if (d.nbprise > 0) parts.push(d.nbprise + " prise(s) en plus");
    if (d.td) parts.push("trop difficile");
    return parts.join(", ");
  }

  function renderDiffList() {
    var list = seance.difficulte;
    $("diff-total").textContent = list.length ? "(" + list.length + ")" : "";
    if (!list.length) { $("diff-list").innerHTML = '<p class="empty">Aucune voie pour l\'instant.</p>'; return; }
    $("diff-list").innerHTML = list.map(function (d, i) {
      var icon = d.res === "e1" ? "✅" : d.res === "e2" ? "🔁" : "✋";
      var det = d.res === "ne" ? neDetails(d) : "";
      return '<div class="line"><span class="grade">' + esc(d.cotation) + '</span><span class="meta"><b>' + icon + " " +
        esc(RESULTS[d.res] || "") + "</b>Relais " + esc(d.relais) + " · " + esc((STYLES[d.style] || {}).label || d.style) +
        (det ? " · " + esc(det) : "") + '</span><button class="x" data-del-diff="' + i + '" aria-label="Retirer">✕</button></div>';
    }).join("");
  }
  $("diff-list").addEventListener("click", function (e) {
    var b = e.target.closest("[data-del-diff]");
    if (!b) return;
    var d = seance.difficulte[+b.dataset.delDiff];
    if (!confirm("Retirer la voie " + d.cotation + " ?")) return;
    seance.difficulte.splice(+b.dataset.delDiff, 1);
    saveSeance();
    renderDiffList();
  });

  /* =========================================================
   * VITESSE
   * ======================================================= */
  function addRun(t) {
    seance.vitesse.push(t);
    saveSeance();
    renderVitList();
    toast("✅ Temps " + prettyTime(t) + " ajouté");
  }
  $("vit-add").addEventListener("click", function () {
    var m = parseInt($("vit-m").value || "0", 10);
    var s = parseInt($("vit-s").value || "0", 10);
    var c = parseInt($("vit-c").value || "0", 10);
    if (isNaN(m) || m < 0 || m > 59) { toast("Minutes : entre 0 et 59.", true); return; }
    if (isNaN(s) || s < 0) { toast("Secondes : nombre positif.", true); return; }
    if (isNaN(c) || c < 0 || c > 99) { toast("Centièmes : entre 0 et 99.", true); return; }
    if (!$("vit-s").value && !$("vit-m").value) { toast("Tape le temps (secondes, et minutes si besoin).", true); $("vit-s").focus(); return; }
    if (m === 0 && s === 0 && c === 0) { toast("Le temps ne peut pas être 0.", true); return; }
    addRun(formatTime(m, s, c));
    $("vit-m").value = ""; $("vit-s").value = ""; $("vit-c").value = "";
  });

  var chronoStart = 0, chronoRAF = null;
  function chronoText(ms) {
    var c = Math.floor(ms / 10) % 100, s = Math.floor(ms / 1000) % 60, m = Math.floor(ms / 60000);
    return pad2(m) + ":" + pad2(s) + ":" + pad2(c);
  }
  function chronoTick() {
    $("vit-chrono").textContent = chronoText(performance.now() - chronoStart);
    chronoRAF = requestAnimationFrame(chronoTick);
  }
  $("vit-startstop").addEventListener("click", function () {
    var btn = $("vit-startstop");
    if (!chronoRAF) {
      chronoStart = performance.now();
      chronoRAF = requestAnimationFrame(chronoTick);
      btn.textContent = "⏹ Stop";
      btn.classList.add("stop");
      $("vit-chrono").classList.add("running");
    } else {
      cancelAnimationFrame(chronoRAF);
      chronoRAF = null;
      var t = chronoText(performance.now() - chronoStart);
      $("vit-chrono").textContent = t;
      btn.textContent = "▶️ Départ";
      btn.classList.remove("stop");
      $("vit-chrono").classList.remove("running");
      addRun(t);
    }
  });

  function bestRun() {
    var best = null;
    seance.vitesse.forEach(function (t) { if (best === null || timeToCentis(t) < timeToCentis(best)) best = t; });
    return best;
  }
  function renderVitList() {
    var list = seance.vitesse;
    var best = bestRun();
    $("vit-total").textContent = list.length ? "(" + list.length + ")" : "";
    $("vit-best").textContent = best ? "🏆 Meilleur temps : " + prettyTime(best) : "";
    if (!list.length) { $("vit-list").innerHTML = '<p class="empty">Aucun essai pour l\'instant.</p>'; return; }
    var bestShown = false;
    $("vit-list").innerHTML = list.map(function (t, i) {
      var isBest = !bestShown && t === best;
      if (isBest) bestShown = true;
      return '<span class="chip' + (isBest ? " best" : "") + '">' + (isBest ? "🏆 " : "") + "Essai " + (i + 1) + " : " +
        esc(prettyTime(t)) + '<button class="x" data-del-vit="' + i + '" aria-label="Retirer">✕</button></span>';
    }).join("");
  }
  $("vit-list").addEventListener("click", function (e) {
    var b = e.target.closest("[data-del-vit]");
    if (!b) return;
    seance.vitesse.splice(+b.dataset.delVit, 1);
    saveSeance();
    renderVitList();
  });

  /* =========================================================
   * QR — format identique à la v1 (lu par ScanProf)
   * ======================================================= */
  function diffCode(d) {
    var sc = (STYLES[d.style] || {}).code || "";
    var code;
    if (d.res === "e1") code = "E";
    else if (d.res === "e2") code = "E2";
    else {
      var parts = [];
      if (d.degx && d.degx > 0) parts.push("NED" + d.degx);
      if (d.nbprise && d.nbprise > 0) parts.push("MC" + d.nbprise);
      if (d.td) parts.push("TD");
      code = "NE" + (parts.length ? " " + parts.join(" ") : "");
    }
    return sc + " R" + d.relais + " " + d.cotation + " " + code;
  }
  function buildQrObject() {
    var obj = { nom: identite.nom, prenom: identite.prenom, classe: identite.classe };
    seance.bloc.forEach(function (b, i) { obj["bloc_" + (i + 1)] = b.c + " R" + b.n; });
    seance.difficulte.forEach(function (d, i) { obj["difficulte_" + (i + 1)] = diffCode(d); });
    var best = bestRun();
    if (best) obj.vitesse = best;
    return obj;
  }
  // Les accents sont écrits sous forme é : le QR ne contient que de l'ASCII,
  // donc aucun lecteur ne peut abîmer les accents (JSON.parse les restitue).
  function asciiJson(value) {
    return JSON.stringify(value).replace(/[\u007f-￿]/g, function (ch) {
      return "\\u" + ("0000" + ch.charCodeAt(0).toString(16)).slice(-4);
    });
  }
  function qrText() { return asciiJson([buildQrObject()]); }

  function makeQrImg(text, cellSize) {
    var qr = qrcode(0, "M");
    qr.addData(text, "Byte");
    qr.make();
    var img = new Image();
    img.alt = "QR code de la séance";
    img.src = qr.createDataURL(cellSize || 8, 4);
    return { img: img, modules: qr.getModuleCount() };
  }

  /* =========================================================
   * FIN DE SÉANCE
   * ======================================================= */
  function recapHtml() {
    var h = "";
    var nb = seance.bloc.length, nd = seance.difficulte.length, nv = seance.vitesse.length;
    h += '<section class="r-bloc"><h3>🧱 Bloc — ' + nb + " réussi" + (nb > 1 ? "s" : "") + "</h3>";
    if (nb) {
      var byColor = {};
      seance.bloc.forEach(function (b) { (byColor[b.c] = byColor[b.c] || []).push(b.n); });
      COLORS.forEach(function (c) {
        if (byColor[c.id]) h += "<p>" + c.label + " : n° " + byColor[c.id].join(", ") + "</p>";
      });
    } else h += "<p>—</p>";
    h += "</section>";
    h += '<section class="r-diff"><h3>🧗 Difficulté — ' + nd + " voie" + (nd > 1 ? "s" : "") + "</h3>";
    if (nd) {
      seance.difficulte.forEach(function (d) {
        h += "<p>" + esc(d.cotation) + " · relais " + esc(d.relais) + " · " + esc((STYLES[d.style] || {}).label || "") + " — " +
          esc(RESULTS[d.res] || "") + (d.res === "ne" && neDetails(d) ? " (" + esc(neDetails(d)) + ")" : "") + "</p>";
      });
    } else h += "<p>—</p>";
    h += "</section>";
    var best = bestRun();
    h += '<section class="r-vit"><h3>⚡ Vitesse — ' + nv + " essai" + (nv > 1 ? "s" : "") + "</h3>";
    h += best ? "<p>Meilleur temps : <b>" + esc(prettyTime(best)) + "</b></p>" : "<p>—</p>";
    h += "</section>";
    return h;
  }

  function renderFin() {
    $("fin-recap").innerHTML = recapHtml();
    var box = $("fin-qr");
    box.innerHTML = "";
    var text = qrText();
    try {
      var q = makeQrImg(text, 6);
      box.appendChild(q.img);
      var n = seanceIsEmpty() ? "Séance vide : le QR ne contient que ton identité." : "";
      $("fin-qr-info").textContent = (n ? n + " · " : "") + text.length + " caractères";
    } catch (err) {
      box.innerHTML = "<p style='color:#b00'>QR impossible : séance trop longue.</p>";
      $("fin-qr-info").textContent = "";
    }
  }

  $("fin-fullscreen").addEventListener("click", function () {
    var holder = $("qr-full-code");
    holder.innerHTML = "";
    try { holder.appendChild(makeQrImg(qrText(), 10).img); }
    catch (e) { holder.textContent = "QR impossible : séance trop longue."; }
    $("qr-full-name").textContent = identite.prenom + " " + identite.nom + " · " + identite.classe;
    $("qr-full").hidden = false;
    if (!seanceIsEmpty()) { seance.qrShownAt = new Date().toISOString(); saveSeance(); }
  });
  $("qr-full-close").addEventListener("click", function () { $("qr-full").hidden = true; });

  /* ---------- Nouvelle séance (avec vérification) ---------- */
  function timeFr(iso) {
    try { return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }); } catch (e) { return ""; }
  }
  function dayKey(iso) { try { return new Date(iso).toDateString(); } catch (e) { return ""; } }
  function dateFr(iso) { try { return new Date(iso).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }); } catch (e) { return ""; } }
  function seanceSummary() {
    var parts = [];
    if (seance.bloc.length) parts.push(seance.bloc.length + " bloc" + (seance.bloc.length > 1 ? "s" : ""));
    if (seance.difficulte.length) parts.push(seance.difficulte.length + " voie" + (seance.difficulte.length > 1 ? "s" : ""));
    if (seance.vitesse.length) parts.push(seance.vitesse.length + " temps de vitesse");
    return parts.join(", ");
  }
  function lastActivity() { return seance.updatedAt || seance.startedAt; }

  function startNewSeance() {
    seance = newSeance();
    saveSeance();
    renderAll();
    $("old-banner").hidden = true;
    selectTab("bloc");
    toast("🆕 Nouvelle séance : tout est prêt");
  }

  function askNewSeance() {
    if (seanceIsEmpty()) {
      seance = newSeance();
      saveSeance();
      $("old-banner").hidden = true;
      toast("La séance est déjà vide : tu peux commencer.");
      return;
    }
    $("new-summary").textContent = "(" + seanceSummary() + ")";
    var q = $("new-status-qr"), c = $("new-status-carnet");
    if (seance.qrShownAt) { q.textContent = "✅ QR affiché en grand à " + timeFr(seance.qrShownAt); q.className = "done"; }
    else { q.textContent = "⚠️ Ton QR n'a pas encore été affiché en grand"; q.className = "todo"; }
    if (seance.carnetAt) { c.textContent = "✅ Carnet enregistré à " + timeFr(seance.carnetAt); c.className = "done"; }
    else { c.textContent = "⚠️ Carnet : pas encore enregistré sur cette tablette"; c.className = "todo"; }
    $("new-step1").hidden = false;
    $("new-step2").hidden = true;
    openDialog("new-dialog");
  }

  $("new-no").addEventListener("click", function () { closeDialog("new-dialog"); });
  $("new-yes").addEventListener("click", function () {
    $("new-step1").hidden = true;
    $("new-step2").hidden = false;
  });
  $("new-back").addEventListener("click", function () {
    closeDialog("new-dialog");
    selectTab("fin");
  });
  $("new-confirm").addEventListener("click", function () {
    closeDialog("new-dialog");
    startNewSeance();
  });
  $("fin-new").addEventListener("click", askNewSeance);
  $("btn-new-top").addEventListener("click", askNewSeance);
  $("old-banner-new").addEventListener("click", askNewSeance);
  $("old-banner-keep").addEventListener("click", function () {
    $("old-banner").hidden = true;
    try { sessionStorage.setItem("ct2_keep_" + seance.id, "1"); } catch (e) {}
  });

  // Séance d'un autre jour encore en mémoire : on prévient l'élève
  function checkOldSeance() {
    var last = lastActivity();
    var kept = false;
    try { kept = sessionStorage.getItem("ct2_keep_" + seance.id) === "1"; } catch (e) {}
    var isOld = !seanceIsEmpty() && last && dayKey(last) !== new Date().toDateString();
    $("old-banner").hidden = !isOld || kept;
    if (isOld) {
      $("old-banner-text").textContent = "📅 Ta séance du " + dateFr(last) + " est encore en mémoire (" + seanceSummary() +
        "). C'est une nouvelle séance aujourd'hui ?";
    }
  }

  /* =========================================================
   * CARNET DE SUIVI (même fonctionnement que Chrono Carnet)
   * ======================================================= */
  function carnetText() {
    var L = [];
    L.push("🧗 ESCALADE — ClimbTrack");
    L.push(identite.nom.toUpperCase() + " " + identite.prenom + " · " + identite.classe);
    L.push("Séance du " + todayFr());
    if (seance.bloc.length) {
      L.push("");
      L.push("🧱 BLOC — " + seance.bloc.length + " bloc(s) réussi(s)");
      var byColor = {};
      seance.bloc.forEach(function (b) { (byColor[b.c] = byColor[b.c] || []).push(b.n); });
      COLORS.forEach(function (c) {
        if (byColor[c.id]) L.push("• " + c.label + " (" + c.txt + ") : n° " + byColor[c.id].join(", "));
      });
    }
    if (seance.difficulte.length) {
      L.push("");
      L.push("🧗 DIFFICULTÉ — " + seance.difficulte.length + " voie(s)");
      seance.difficulte.forEach(function (d) {
        var det = d.res === "ne" && neDetails(d) ? " (" + neDetails(d) + ")" : "";
        L.push("• " + d.cotation + " — relais " + d.relais + " — " + ((STYLES[d.style] || {}).label || "") + " — " + (RESULTS[d.res] || "") + det);
      });
      var done = seance.difficulte.filter(function (d) { return d.res !== "ne"; });
      if (done.length) {
        var maxG = done.reduce(function (a, d) { return GRADES.indexOf(d.cotation) > GRADES.indexOf(a) ? d.cotation : a; }, done[0].cotation);
        L.push("Plus haute cotation enchaînée : " + maxG);
      }
    }
    if (seance.vitesse.length) {
      L.push("");
      L.push("⚡ VITESSE — " + seance.vitesse.length + " essai(s)");
      L.push("Meilleur temps : " + prettyTime(bestRun()));
      L.push("Essais : " + seance.vitesse.map(prettyTime).join(" · "));
    }
    if (seanceIsEmpty()) { L.push(""); L.push("(Aucun résultat enregistré pendant cette séance.)"); }
    return L.join("\n");
  }

  function carnetFile() {
    var text = carnetText();
    var html = text.split(/\r?\n/).map(function (line) { return "<div>" + (esc(line) || "<br>") + "</div>"; }).join("");
    var name = "ClimbTrack_" + fileSafe(identite.nom) + "_" + fileSafe(identite.prenom) + "_" + new Date().toISOString().slice(0, 10) + ".json";
    var content = JSON.stringify({ html: html, text: text }, null, 2);
    try { return new File([content], name, { type: "application/json" }); }
    catch (e) { var b = new Blob([content], { type: "application/json" }); b.name = name; return b; }
  }

  function downloadFile(file) {
    var url = URL.createObjectURL(file);
    var a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
  }

  $("fin-carnet").addEventListener("click", function () {
    $("carnet-preview").textContent = carnetText();
    openDialog("carnet-dialog");
  });

  function markCarnet() { seance.carnetAt = new Date().toISOString(); saveSeance(); }

  $("carnet-open").addEventListener("click", function () {
    markCarnet();
    var text = carnetText();
    var opened = window.open(CARNET_URL, "_blank");
    var done = function (ok) {
      toast(ok ? "📋 Résultats copiés : colle-les dans ta séance du carnet." : "Copie impossible : utilise « Je n'ai pas ma tablette ».", !ok);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(false); });
    } else done(false);
    if (!opened) location.href = CARNET_URL;
    closeDialog("carnet-dialog");
  });

  $("carnet-file").addEventListener("click", function () {
    markCarnet();
    downloadFile(carnetFile());
    toast("💾 Fichier enregistré dans Téléchargements : importe-le dans ton carnet.");
    closeDialog("carnet-dialog");
  });

  $("carnet-share").addEventListener("click", function () {
    markCarnet();
    var file = carnetFile();
    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], title: "Mes résultats ClimbTrack" }).catch(function (err) {
        if (err && err.name !== "AbortError") toast("Partage impossible : utilise « Je n'ai pas ma tablette ».", true);
      });
    } else {
      downloadFile(file);
      toast("Partage indisponible : fichier enregistré dans Téléchargements.");
    }
    closeDialog("carnet-dialog");
  });

  $("btn-help").addEventListener("click", function () { openDialog("help-dialog"); });
  $("btn-safety").addEventListener("click", function () { openDialog("safety-dialog"); });

  /* =========================================================
   * MES VOIES — stockage IndexedDB (les photos ne saturent plus la mémoire)
   * ======================================================= */
  var DB_NAME = "climbtrack_v2", STORE = "routes";
  function openDb() {
    return new Promise(function (resolve, reject) {
      if (!window.indexedDB) return reject(new Error("IndexedDB indisponible"));
      var req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }
  function dbOp(mode, fn) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, mode);
        var st = tx.objectStore(STORE);
        var result = fn(st);
        tx.oncomplete = function () { resolve(result && result.result !== undefined ? result.result : result); };
        tx.onerror = function () { reject(tx.error); };
        tx.onabort = function () { reject(tx.error); };
      });
    });
  }
  function getAllRoutes() {
    return dbOp("readonly", function (st) { return st.getAll(); }).then(function (r) {
      return (r || []).sort(function (a, b) { return (b.createdAt || "").localeCompare(a.createdAt || ""); });
    });
  }
  function putRoute(r) { return dbOp("readwrite", function (st) { return st.put(r); }); }
  function deleteRoute(id) { return dbOp("readwrite", function (st) { return st.delete(id); }); }
  function getRoute(id) { return dbOp("readonly", function (st) { return st.get(id); }); }

  function dataUrlToBlob(dataUrl) {
    var parts = dataUrl.split(",");
    var mime = (parts[0].match(/:(.*?);/) || [])[1] || "image/png";
    var bin = atob(parts[1]);
    var arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  }

  // Reprise des voies de la v1 (stockées en texte dans la mémoire) — sans les supprimer
  function migrateOldRoutes() {
    if (localStorage.getItem(KEY_ROUTES_MIGRATED)) return Promise.resolve();
    var old = load(OLD_KEY_GALLERY, []);
    if (!Array.isArray(old) || !old.length) { try { localStorage.setItem(KEY_ROUTES_MIGRATED, "1"); } catch (e) {} return Promise.resolve(); }
    var jobs = old.map(function (it, i) {
      try {
        var blob = dataUrlToBlob(it.img);
        return putRoute({ id: "old_" + (it.id || i), createdAt: new Date(it.id || Date.now()).toISOString(),
          name: "Voie (ancienne version)", couleur: "", cotation: "", notes: "", author: "", image: blob, base: null, shapes: [] });
      } catch (e) { return Promise.resolve(); }
    });
    return Promise.all(jobs).then(function () { try { localStorage.setItem(KEY_ROUTES_MIGRATED, "1"); } catch (e) {} });
  }

  var galleryUrls = [];
  var galleryToken = 0;
  function renderGallery() {
    var el = $("route-gallery");
    var token = ++galleryToken; // ignore les affichages plus anciens arrivés en retard
    migrateOldRoutes().then(getAllRoutes).then(function (routes) {
      if (token !== galleryToken) return;
      galleryUrls.forEach(function (u) { URL.revokeObjectURL(u); });
      galleryUrls = [];
      if (!routes.length) { el.innerHTML = '<p class="empty">Aucune voie enregistrée.</p>'; return; }
      el.innerHTML = routes.map(function (r) {
        var url = URL.createObjectURL(r.image);
        galleryUrls.push(url);
        var sub = [r.cotation, r.couleur].filter(Boolean).join(" · ");
        return '<div class="route-card"><button type="button" class="view" data-view="' + esc(r.id) + '" aria-label="Voir en grand">' +
          '<img src="' + url + '" alt=""></button><div class="info"><b>' + esc(r.name || "Sans nom") + "</b>" +
          '<span class="muted small">' + esc(sub) + (r.author ? (sub ? " · " : "") + "par " + esc(r.author) : "") + "</span></div>" +
          '<div class="acts"><button class="btn" data-view="' + esc(r.id) + '">👁 Voir</button>' +
          '<button class="btn btn-voies" data-share="' + esc(r.id) + '">📤 Partager</button>' +
          (r.base ? '<button class="btn" data-edit="' + esc(r.id) + '">✏️ Modifier</button>' : '<span></span>') +
          '<button class="btn danger" data-delroute="' + esc(r.id) + '">🗑 Supprimer</button></div></div>';
      }).join("");
    }).catch(function () {
      el.innerHTML = '<p class="empty">Impossible d\'ouvrir la galerie sur ce navigateur.</p>';
    });
  }

  function shareRoute(r) {
    var name = "Voie_" + fileSafe(r.name || "climbtrack") + ".jpg";
    var file;
    try { file = new File([r.image], name, { type: r.image.type || "image/jpeg" }); }
    catch (err) { file = r.image; file.name = name; }
    var text = (r.name || "Ma voie") + (r.cotation ? " — " + r.cotation : "") + (r.notes ? "\n" + r.notes : "");
    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], title: r.name || "Ma voie", text: text }).catch(function () {});
    } else {
      downloadFile(file);
      toast("Image enregistrée : envoie-la à tes amis.");
    }
  }

  var viewerRoute = null, viewerUrl = null;
  function openViewer(r) {
    viewerRoute = r;
    if (viewerUrl) URL.revokeObjectURL(viewerUrl);
    viewerUrl = URL.createObjectURL(r.image);
    $("viewer-img").src = viewerUrl;
    $("viewer-title").textContent = r.name || "Sans nom";
    $("viewer-sub").textContent = [r.cotation, r.couleur ? "prises " + r.couleur.toLowerCase() : "", r.author ? "par " + r.author : ""].filter(Boolean).join(" · ");
    $("viewer-notes").textContent = r.notes || "";
    $("viewer-edit").hidden = !r.base;
    $("route-viewer").hidden = false;
    document.body.style.overflow = "hidden";
  }
  function closeViewer() {
    $("route-viewer").hidden = true;
    document.body.style.overflow = "";
    viewerRoute = null;
  }
  $("viewer-close").addEventListener("click", closeViewer);
  $("viewer-share").addEventListener("click", function () { if (viewerRoute) shareRoute(viewerRoute); });
  $("viewer-edit").addEventListener("click", function () {
    var r = viewerRoute;
    if (!r || !r.base) return;
    closeViewer();
    openEditor(r.base, r);
  });

  $("route-gallery").addEventListener("click", function (e) {
    var v = e.target.closest("[data-view]"), s = e.target.closest("[data-share]"),
      d = e.target.closest("[data-delroute]"), ed = e.target.closest("[data-edit]");
    if (v) {
      getRoute(v.dataset.view).then(function (r) { if (r) openViewer(r); });
    } else if (s) {
      getRoute(s.dataset.share).then(function (r) { if (r) shareRoute(r); });
    } else if (d) {
      if (!confirm("Supprimer cette voie ?")) return;
      deleteRoute(d.dataset.delroute).then(renderGallery);
    } else if (ed) {
      getRoute(ed.dataset.edit).then(function (r) { if (r) openEditor(r.base, r); });
    }
  });

  /* ---------- Éditeur de voie ---------- */
  var ED = { img: null, baseBlob: null, shapes: [], tool: "pen", color: "#ff2d55", drawing: null, editing: null };
  var ED_COLORS = ["#ff2d55", "#ffd60a", "#32d74b", "#0a84ff", "#ffffff"];
  var canvas = $("route-canvas"), cctx = canvas.getContext("2d");

  $("route-colors").innerHTML = ED_COLORS.map(function (c, i) {
    return '<button type="button" data-ecolor="' + c + '" style="background:' + c + '" class="' + (i === 0 ? "active" : "") + '" aria-label="Couleur"></button>';
  }).join("");
  $("route-colors").addEventListener("click", function (e) {
    var b = e.target.closest("[data-ecolor]");
    if (!b) return;
    ED.color = b.dataset.ecolor;
    document.querySelectorAll("#route-colors button").forEach(function (x) { x.classList.toggle("active", x === b); });
  });
  $("route-tools").addEventListener("click", function (e) {
    var b = e.target.closest("[data-tool]");
    if (!b) return;
    ED.tool = b.dataset.tool;
    document.querySelectorAll("#route-tools button").forEach(function (x) { x.classList.toggle("active", x === b); });
  });

  function compressImage(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        var MAX = 1600;
        var r = Math.min(1, MAX / Math.max(img.naturalWidth, img.naturalHeight));
        var c = document.createElement("canvas");
        c.width = Math.round(img.naturalWidth * r);
        c.height = Math.round(img.naturalHeight * r);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob(function (blob) { blob ? resolve(blob) : reject(new Error("compression")); }, "image/jpeg", 0.85);
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error("image illisible")); };
      img.src = url;
    });
  }

  function blobToImage(blob) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(blob);
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = reject;
      img.src = url;
    });
  }

  $("route-photo").addEventListener("change", function (e) {
    var f = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!f) return;
    compressImage(f).then(function (blob) { openEditor(blob, null); })
      .catch(function () { toast("Photo illisible. Essaie une autre image.", true); });
  });

  function openEditor(baseBlob, existing) {
    blobToImage(baseBlob).then(function (img) {
      ED.img = img;
      ED.baseBlob = baseBlob;
      ED.editing = existing ? existing.id : null;
      ED.shapes = existing && existing.shapes ? JSON.parse(JSON.stringify(existing.shapes)) : [];
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      $("route-name").value = existing ? existing.name || "" : "";
      $("route-couleur").value = existing ? existing.couleur || "" : "";
      $("route-cotation").value = existing ? existing.cotation || "" : "";
      $("route-notes").value = existing ? existing.notes || "" : "";
      $("route-editor").hidden = false;
      document.body.style.overflow = "hidden";
      drawEditor();
    });
  }
  function closeEditor() {
    $("route-editor").hidden = true;
    document.body.style.overflow = "";
    ED.img = null; ED.shapes = []; ED.drawing = null;
  }

  function lineW() { return Math.max(4, Math.round(canvas.width / 220)); }
  function drawShape(ctx, s, scale) {
    scale = scale || 1;
    var lw = lineW() * scale;
    ctx.save();
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.strokeStyle = s.color; ctx.fillStyle = s.color;
    if (s.type === "pen") {
      ctx.lineWidth = lw;
      ctx.beginPath();
      s.pts.forEach(function (p, i) { if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); });
      ctx.stroke();
    } else if (s.type === "hold") {
      ctx.lineWidth = lw;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.stroke();
    } else if (s.type === "start" || s.type === "top") {
      var label = s.type === "start" ? "DÉPART" : "TOP";
      var bg = s.type === "start" ? "#16a34a" : "#dc2626";
      ctx.lineWidth = lw;
      ctx.strokeStyle = bg;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.stroke();
      var fs = Math.round(s.r * 0.75);
      ctx.font = "900 " + fs + "px system-ui, sans-serif";
      var w = ctx.measureText(label).width + fs * 0.8;
      var y = s.y - s.r - fs * 1.4;
      ctx.fillStyle = bg;
      ctx.fillRect(s.x - w / 2, y, w, fs * 1.3);
      ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(label, s.x, y + fs * 0.67);
    }
    ctx.restore();
  }
  function drawEditor() {
    if (!ED.img) return;
    cctx.drawImage(ED.img, 0, 0, canvas.width, canvas.height);
    ED.shapes.forEach(function (s) { drawShape(cctx, s); });
    if (ED.drawing) drawShape(cctx, ED.drawing);
  }
  function canvasPoint(e) {
    var rect = canvas.getBoundingClientRect();
    return [(e.clientX - rect.left) * canvas.width / rect.width, (e.clientY - rect.top) * canvas.height / rect.height];
  }
  canvas.addEventListener("pointerdown", function (e) {
    if (!ED.img) return;
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    var p = canvasPoint(e);
    var r = Math.max(18, Math.round(canvas.width / 28));
    if (ED.tool === "pen") ED.drawing = { type: "pen", color: ED.color, pts: [p] };
    else ED.drawing = { type: ED.tool, color: ED.color, x: p[0], y: p[1], r: r, sx: p[0], sy: p[1] };
    drawEditor();
  });
  canvas.addEventListener("pointermove", function (e) {
    if (!ED.drawing) return;
    var p = canvasPoint(e);
    if (ED.drawing.type === "pen") ED.drawing.pts.push(p);
    else {
      // glisser après l'appui = agrandir le cercle
      var d = Math.hypot(p[0] - ED.drawing.sx, p[1] - ED.drawing.sy);
      ED.drawing.r = Math.max(Math.max(18, Math.round(canvas.width / 28)), d);
    }
    drawEditor();
  });
  function endStroke() {
    if (!ED.drawing) return;
    var s = ED.drawing;
    delete s.sx; delete s.sy;
    if (s.type !== "pen" || s.pts.length > 1) ED.shapes.push(s);
    ED.drawing = null;
    drawEditor();
  }
  canvas.addEventListener("pointerup", endStroke);
  canvas.addEventListener("pointercancel", endStroke);

  $("route-undo").addEventListener("click", function () { ED.shapes.pop(); drawEditor(); });
  $("route-clear").addEventListener("click", function () {
    if (ED.shapes.length && confirm("Effacer tous les dessins ?")) { ED.shapes = []; drawEditor(); }
  });
  $("route-cancel").addEventListener("click", function () {
    if (ED.shapes.length && !confirm("Quitter sans enregistrer ?")) return;
    closeEditor();
  });

  // Image finale : photo + dessins + bandeau d'informations (lisible une fois partagée)
  function exportRouteImage(meta) {
    var W = canvas.width, H = canvas.height;
    var band = Math.round(Math.max(70, W / 12));
    var out = document.createElement("canvas");
    out.width = W; out.height = H + band;
    var o = out.getContext("2d");
    o.drawImage(ED.img, 0, 0, W, H);
    ED.shapes.forEach(function (s) { drawShape(o, s); });
    o.fillStyle = "#0b1023";
    o.fillRect(0, H, W, band);
    o.fillStyle = "#fff";
    o.textBaseline = "middle";
    var fs = Math.round(band * 0.36);
    o.font = "900 " + fs + "px system-ui, sans-serif";
    var title = "🧗 " + (meta.name || "Ma voie") + (meta.cotation ? " — " + meta.cotation : "");
    o.fillText(title, band * 0.25, H + band * 0.35, W - band * 0.5);
    o.font = "600 " + Math.round(fs * 0.7) + "px system-ui, sans-serif";
    o.fillStyle = "#a9b3c7";
    var sub = [meta.couleur ? "Prises " + meta.couleur.toLowerCase() : "", meta.author ? "par " + meta.author : "", meta.notes].filter(Boolean).join(" · ");
    o.fillText(sub, band * 0.25, H + band * 0.74, W - band * 0.5);
    return new Promise(function (resolve) { out.toBlob(resolve, "image/jpeg", 0.88); });
  }

  $("route-save").addEventListener("click", function () {
    var meta = {
      name: $("route-name").value.trim(),
      couleur: $("route-couleur").value,
      cotation: $("route-cotation").value.trim().toUpperCase(),
      notes: $("route-notes").value.trim(),
      author: identite ? identite.prenom + " " + identite.nom.charAt(0).toUpperCase() + "." : "",
    };
    if (!meta.name) { toast("Donne un nom à ta voie.", true); $("route-name").focus(); return; }
    var saveBtn = $("route-save");
    if (saveBtn.disabled) return;
    saveBtn.disabled = true;
    saveBtn.textContent = "⏳ Enregistrement…";
    var resetBtn = function () { saveBtn.disabled = false; saveBtn.textContent = "💾 Enregistrer la voie"; };
    exportRouteImage(meta).then(function (blob) {
      var rec = {
        id: ED.editing || uid(),
        createdAt: new Date().toISOString(),
        name: meta.name, couleur: meta.couleur, cotation: meta.cotation, notes: meta.notes, author: meta.author,
        image: blob, base: ED.baseBlob, shapes: ED.shapes,
      };
      return putRoute(rec);
    }).then(function () {
      resetBtn();
      closeEditor();
      toast("✅ Voie enregistrée");
      renderGallery();
    }).catch(function () {
      resetBtn();
      toast("⚠️ Impossible d'enregistrer la voie (mémoire pleine ?).", true);
    });
  });

  /* =========================================================
   * Démarrage
   * ======================================================= */
  function renderAll() {
    renderBlocColors();
    renderBlocList();
    renderDiffForm();
    renderDiffList();
    renderVitList();
    updateCounts();
  }

  renderAll();
  if (identite && identite.nom && identite.prenom && identite.classe) showApp();
  else showIdentity(false);

  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("sw.js", { scope: "./" }).catch(function () {});
    });
  }

  // Exposé pour les tests
  window.ClimbTrack = { normalizeClasse: normalizeClasse, buildQrObject: buildQrObject, qrText: qrText, carnetText: carnetText };
})();
