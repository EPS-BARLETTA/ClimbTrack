# ClimbTrack

Application élève d'escalade (Bloc, Difficulté, Vitesse, création de voies) — Équipe EPS Lycée Vauban, Luxembourg.

- `index.html`, `app.js`, `app.css` : l'application (une seule page à onglets).
- QR de fin de séance au format JSON lu par ScanProf : `[{"nom","prenom","classe","bloc_1","difficulte_1","vitesse"}]` (texte ASCII, accents en `é`).
- « Enregistrer dans mon carnet » : même fonctionnement que Chrono Carnet (copie + ouverture du carnet, ou fichier `{html, text}` à importer).
- `sw.js` : mode hors-ligne — **augmenter `VERSION` à chaque mise en ligne**.
- Les anciennes pages (`difficulte.html`, `bloc.html`, `menu.html`…) redirigent vers l'onglet correspondant.
- `lib/qrcode.js` : qrcode-generator (Kazuhiko Arase, licence MIT).
