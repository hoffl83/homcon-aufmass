# Aufmaß Heizlast

Offline-Web-App (PWA) für ein Android-Tablet in der Energieberatung. Sie dient der Vor-Ort-Erfassung von Gebäudedaten für Energieberatung (iSFP, BEG) und Heizlastberechnung. Die verbindliche Berechnung erfolgt anschließend in **Hottgenroth / HSETU**; diese App liefert die Aufnahme und eine überschlägige Heizlast.

## Aufbau

- `index.html`: die komplette App (HTML, CSS, JavaScript in einer Datei, ohne Build-Schritt und ohne Framework)
- `sw.js`: Service Worker für den Offline-Betrieb. **Bei jeder Änderung an Dateien `CACHE` in `sw.js` und `APP_VERSION`/`APP_DATE` in `index.html` gemeinsam hochzählen** (gleiche Zahl: `aufmass-v11` ↔ `APP_VERSION = "11"`), sonst sehen installierte Tablets die neue Version nicht. Die Objektliste zeigt unten „Version 11 · Datum“; weicht der aktive Cache ab, steht er dahinter. Übernimmt ein neuer Service Worker die Seite, erscheint „Neue Version geladen – Jetzt neu laden“ (speichert vor dem Neuladen).
- `manifest.webmanifest`, `icon*.svg/png`: Installation als App
- Lokal testen: `python3 -m http.server 8000`, dann http://localhost:8000

## Datenmodell (in IndexedDB `aufmass-heizlast`, Store `projects`)

Ein Projekt = ein Objekt:
- `gebaeude`: Stammdaten (Adresse, Typ, Baujahr, Keller, DG, Wohnfläche …)
- `klima`: `te` Norm-Außentemperatur, `teSrc` Herkunft von `te` ("plz" aus PLZ-Tabelle, "hand" von Hand, "" Standard), `duwb` Wärmebrückenzuschlag, `fu` Faktor unbeheizt, `fe` Faktor Erdreich
- `anlage`: Wärmeerzeuger, Verteilung, Warmwasser, Lüftung, Verbräuche (3 Jahre)
- `einheiten[]`: Wohneinheiten `{id, name, lage}`. `ensureWE()` legt beim Anzeigen so viele an, wie `gebaeude.we` angibt, löscht aber nie automatisch. Bei genau einer WE werden alle Räume ihr zugeordnet; ältere Sicherungen ohne `einheiten` funktionieren so weiter.
- `raeume[]`: `we` (ID der Wohneinheit, "" = ohne Zuordnung), `ti`, `fl`, `h`, `n` (Luftwechsel), `bt[]` Bauteile, `geo` Eingaben für „Raum aus Maßen“ (`l`, `b`, `gh` Geschosshöhe, `dreh` "0"/"45", `s1`–`s4` Seiten Länge/Breite/Länge/Breite im Uhrzeigersinn ab N bzw. NO mit "", "aw", "iw", "ub", dazu `boden`, `decke` als Bauteiltyp). `geoBuild()` ersetzt `bt[]` komplett und setzt `fl`; auch Boden und Decke bekommen Maße (`b` = Länge, `h` = Breite) statt nur `a`. Außenwände und Dächer haben eigene Knöpfe „+ Fenster“/„+ Tür“ bzw. „+ Dachfenster“ (Aktion `btopen`), die die Öffnung direkt dieser Wand zuordnen. Wandhöhe = Geschosshöhe, Volumen weiter über die lichte Höhe `h`. Neue Räume übernehmen `gh`, `dreh`, `boden` und `decke` vom zuletzt erzeugten Raum.
- Bauteil: `typ` (aw, fe, tu, da, og, kd, bp, iw, dn), `b`, `h`, `a` (Fläche direkt), `anz`, `u`, `uSrc` ("vor" aus Baualterstabelle, "hand" von Hand geändert, "" Standardwert des Typs), `adj` (aussen, unbeheizt, erdreich, beheizt), `tn` (Nachbartemperatur), `in` (Öffnung wird von dieser Wand-ID abgezogen)
- `uvor`: Konstruktion je Bauteil für die U-Wert-Vorbelegung (`aw`, `da`, `og`, `kd`, `bp`, `fe`, `tu` als Schlüssel aus `UTAB`) und `feJahr` (Einbaujahr getauschter Fenster). Werte in `UTAB` stammen wörtlich aus der Bekanntmachung der Regeln zur Datenaufnahme im Wohngebäudebestand vom 8.10.2020 (BAnz AT 04.12.2020 B1), Tabelle 2 und 3; `null` = „keine Angabe“. Nicht aus TABULA (dort nur Einzel-Beispielgebäude bis 1994). Bei Änderung von Baujahr oder `uvor` zieht `applyUvor()` alle Bauteile nach, die nicht „hand“ sind; alte Bauteile ohne `uSrc` nur, wenn sie noch den Standardwert tragen. Wände zu unbeheizt (iw + adj unbeheizt) bekommen den Außenwandwert.
- Raum `hk[]`: Heizkörper `{id, typ ("10","11","21","22","33" Flach, "glied", "bad", "konv", "sonst"), bez, l, h (mm), anz, qg (W je Glied), qn (Normleistung W), norm ("75" = 75/65/20 EN 442, "90" = 90/70/20 alte DIN 4703), n}`; Raum `fbh` "ja"/"" = Fußbodenheizung (wird nicht berechnet). Normleistung: Eingabe > Glieder × W/Glied > Schätzung aus `HK_TAB` (Buderus Planungsunterlage Flachheizkörper 02/2002, Tab. 8/1: W/m und n bei 75/65/20, Bauhöhe 300–900 mm linear interpoliert). Umrechnung Q = Qn·(Δθ_ln/49,83)^n; `roomVL()` sucht per Bisektion die nötige Vorlauftemperatur bei Spreizung `anlage.wpSpreiz` (Standard 5 K), Ziel `anlage.wpVl` (Standard 55 °C). Einschätzung: ≤ 45 °C sehr gut, ≤ 55 °C geeignet, ≤ 60 °C bedingt, darüber Tausch nötig. Referenztest: Beispiel-Wohnzimmer (2434 W) mit 2× Typ 22/600/1400 → nötige VL 52,1 °C.
- `fotos[]`: JPEG als Data-URL (max. 1600 px), `ref` = "geb", "anl" oder Raum-ID, `kat` = Kategorie der Foto-Checkliste (`FKAT`: fassade, dach, heizraum, zstrom, zgas, zwaerme, fenster, schaden) oder ""
- Felder aus der Vor-Ort-Checkliste des Nutzers (Word-Datei, liegt nur lokal und nie im Repo; für HSETU): `gebaeude.nfl/vol/ausr/denkmal/personen/anbau.{wintergarten,erker,vorbau}`, `uvor.feGlas/tuJahr/tuGed`, `uvor.san.<aw|da|og|kd|bp>.{bj,d,lam,sj,zust,art}`, `klima.wbDoku/wbNachweis/blower/n50`, `anlage.traeger/rohrGed/rohrLage/puffer/pufferL/regel.{einzel,at,nacht,keine}/zirk/zirkGed/lueftBj/lueftZust/pv/pvKwp/pvBj/pvAusr/batt/st/stFl/wwSep/zaehler/leerstand`, `kunde.firma/mail/status/vollmacht/rechAdr`, `unterlagen.<UNTERLAGEN-Schlüssel>`. Ja/Nein-Felder speichern "ja"/"nein"/"" (`yn`), Checkboxen "ja"/"" (`chks`). Fehlen sie in alten Sicherungen, gelten sie als leer.
- `uvor.san.<k>.d` (nachträgliche Dämmung in cm) und `.lam` (Standard 0,040) rechnet `uTab()` nach Abschnitt 3.3 der Bekanntmachung um: U = 1/(1/U0 + d/λ), gerundet auf 2 Stellen; `.bj` ersetzt das Gebäudebaujahr für die Baualtersklasse dieses Bauteils.

PLZ-Tabelle für θe (DB-Version 2, Store `plz`, Schlüssel `plz`): `{plz, te, ort, src: "hand"|"import", t}`. Sie wird vor Ort gelernt (Wert aus der BWP-Klimakarte ablesen und merken) oder als CSV eingespielt (`PLZ;Ort;θe`). Die JSON-Sicherung enthält sie zusätzlich als `plz[]`; beim Import werden nur fehlende PLZ ergänzt. θe wird automatisch nur gesetzt, solange `teSrc` nicht "hand" ist. Die echte Tabelle der DIN/TS 12831-1 liegt noch nicht vor; keine geschätzten Werte einbauen.

Zahlen werden als Strings gespeichert, so wie getippt (deutsches Dezimalkomma). Gelesen wird über `num()` und `nz()`.

## Passwortschutz (Cloudflare Worker)

Die Seite läuft als **Cloudflare Worker mit statischen Dateien**, nicht als Pages-Projekt – ein `functions/`-Ordner wird dort nicht ausgeführt (am 23.10.2026 so festgestellt: die Middleware wurde als Datei ausgeliefert). Deploy über Workers Builds aus GitHub mit `npx wrangler deploy`. `wrangler.jsonc` (Name `homcon-aufmass`, muss zum Worker im Dashboard passen) setzt `worker.js` als Einstieg und `assets.run_worker_first`, damit jede Anfrage zuerst geprüft wird; `.assetsignore` hält Quelltext und Doku aus den ausgelieferten Dateien. Passwort und Signaturschlüssel stehen nur in den Cloudflare-Variablen `APP_PASSWORD` und `AUTH_SECRET`; fehlen sie, antwortet die Seite mit 503 (gesperrt statt offen). Nach der Anmeldung (`POST /login`) gilt ein HMAC-signiertes HttpOnly-Cookie 180 Tage. Ohne Anmeldung erreichbar sind nur Manifest und Icons. `/__auth` antwortet 204/401; die App prüft das beim Start und zeigt bei 401 „Anmeldung abgelaufen“, weil sonst still keine Updates mehr ankommen. Der Service Worker beantwortet `/__auth` und `/login` nie aus dem Cache. Lokal (python http.server) gibt es keine Middleware, `/__auth` liefert 404 und wird ignoriert.

## Laser-Entfernungsmesser (Web Bluetooth)

Bosch UniversalDistance 40C über Web Bluetooth (Chrome Android, nur HTTPS/localhost). Der 40C („Bosch UD 40C x1329“) meldet laut chrome://bluetooth-internals (23.10.2026) Service `00005301-0000-0041-5253-534f46540000` mit einer Characteristic `00004301-0000-0041-5253-534f46540000` (Write + Indicate), daneben 0x1800 und SPP 0x1101. Ob dort dasselbe Rahmenformat läuft, ist noch nicht am Gerät bestätigt. Das Protokoll ist nicht offiziell dokumentiert, sondern aus Community-Analysen anderer Bosch-Laser übernommen (AdvancedDistance 50C: Service 0xFDE8, Characteristic 02a6c0d2; GLM 50 C: Service/Characteristic 02a6c0d0/02a6c0d1). Web Bluetooth erreicht nur Services, die in `LASER_SVC` stehen. Rahmen `C0 55 <Länge> <Nutzdaten> <CRC-8 Poly 0xA6, Start 0xAA>`, Nutzdaten: Typ (u16 LE), Zähler (u16 LE), Wert float32 LE; Typ 0x0006 = Distanz in m. Nach dem Abonnieren wird `C0 55 02 01 00 1A` gesendet. **Mit einem echten 40C noch nicht getestet** – der Laser-Dialog zeigt unter „Diagnose“ die Rohrahmen. Messwerte landen nur in Längenfeldern (`isLenField`: Bauteil `b`/`h`, `geo.l/b/gh`, Raum `h`), danach springt der Fokus ins nächste Längenfeld.

## Heizlast (Funktion `calc`)

Vereinfacht nach DIN EN 12831-1:
- Transmission Φ_T = Σ A_netto · (U + ΔU_WB) · f · (θint − θe)
- f = 1 (außen), `fu` (unbeheizt), `fe` (Erdreich), bei beheizten Nachbarräumen (θint − θNachbar)/(θint − θe) ohne ΔU_WB
- Lüftung Φ_V = 0,34 · V · n · (θint − θe)
- Kein Aufheizzuschlag, keine Gleichzeitigkeit

Referenzwert für Tests (Beispielprojekt): Wohnzimmer Φ_T 2053 W, Φ_V 381 W, Φ_HL 2434 W. Die Summe aller Räume liegt bei 4239 W.

Gegenprüfung über den Verbrauch (`verbCheck`, Reiter „Ergebnis“): Φ = (Ø Verbrauch × Heizwert × η − Warmwasser) / Vollbenutzungsstunden. Richtwerte, je Projekt überschreibbar über `anlage.vEta`/`vJaz`/`vHw`/`vWw`/`vVbh`: Heizwerte Gas 10 kWh/m³, Heizöl 10 kWh/l, Flüssiggas 6,6 kWh/l, Pellets 4,8 kWh/kg, Scheitholz 1800 kWh/Rm; η Brennwert 0,90, NT 0,85, Konstanttemp. 0,75, Pellet/Holz 0,80, Fernwärme 0,95, Elektro 1,0; Wärmepumpe Strom × JAZ (3,0); Warmwasser 12,5 kWh/(m²·a) × Wohnfläche, nur wenn `anlage.ww` zentral und nicht separat ausgewiesen; 2000 h. Die Raumsumme wird auf die Wohnfläche hochgerechnet, wenn weniger als 95 % als Räume erfasst sind. Bewertung: ≤ 25 % plausibel, ≤ 50 % prüfen, darüber deutlich. Referenz Beispielprojekt: 9,38 kW aus Verbrauch, 10,54 kW hochgerechnet, +12 %.

## Konventionen

- Oberfläche komplett auf Deutsch, Fachbegriffe wie in der DIN (θint, θe, Φ_HL, U-Wert)
- Bedienung für Tablet: Touch-Ziele mindestens 44 px, numerische Felder mit `inputmode="decimal"`
- Farbschema: Anthrazit #2E3133, Salbeigrün #5A6E61, Sandbeige #CEC8BC, Warmweiß #F7F6F2. Farben nur über die CSS-Variablen in `:root` setzen; Hell- und Dunkelmodus pflegen.
- **Keine persönlichen oder Firmendaten im Repo** (öffentlich auf GitHub): kein Logo, kein Firmen- oder Personenname, keine Adressen, keine Domain. Briefkopf (`BK_DEF`) bleibt leer; Logo und Briefkopf lädt der Nutzer in der App hoch (localStorage `aufmass.briefkopf`, Feld `logo` als Data-URL; Rasterbilder auf 800 px verkleinert, SVG nur als `<img>` anzeigen). App-Symbol `icon.svg` ist neutral (Haus mit Maßlinie); PNGs neu erzeugen mit `magick -background none -density 300 icon.svg -resize 512x512 PNG32:icon-512.png`. Eigene Dateien des Nutzers (Logo, Checkliste) liegen im ignorierten Ordner `privat/`.
- Schriften: IBM Plex Sans / Condensed / Mono (Google Fonts, mit System-Fallback)
- Keine Cloud-Dienste, keine Tracker; Daten bleiben auf dem Gerät. Open Source bevorzugt.
- Bestehende Sicherungen (JSON-Export, `version: 1`) müssen importierbar bleiben. Neue Felder deshalb mit Standardwerten ergänzen, statt alte umzubenennen.

## Ideen für die nächsten Schritte

1. ~~Norm-Außentemperatur automatisch aus der PLZ~~ (umgesetzt als lernende PLZ-Tabelle; offizielle Tabelle noch beschaffen und als CSV einspielen)
2. ~~Aufnahmeprotokoll als PDF~~ (umgesetzt, **nur aufgenommene Daten** – auf Wunsch des Nutzers keine Heizlast-Ergebnisse, Bewertungen, Gegenprüfung oder Plausibilitätswarnungen; Briefkopf mit Logo und Wortmarke links, Kontakt rechts. `protokollHtml()` baut ein Druckdokument in `#printroot`, Chrome „Als PDF speichern“; eigene Druck-CSS nur unter `body.printing`, Klassen mit Präfix `pr-`, damit App-Stile nicht durchschlagen. Briefkopf global in localStorage `aufmass.briefkopf` (Felder `BK_FIELDS`, nur Firma/Zusatz/Name vorbelegt – Adressdaten nie erfinden), zusätzlich als `briefkopf` in der JSON-Sicherung; Optionen in `aufmass.protokoll`.)
3. Synchronisation bzw. Sicherung auf das TrueNAS (z. B. WebDAV) statt manuellem JSON-Export
4. Bauteilkatalog: eigene Aufbauten mit U-Wert speichern und wiederverwenden
5. ~~Heizkörper-Aufnahme je Raum~~ (umgesetzt; offen: Fußbodenheizung rechnen, Heizkörperliste als CSV)
6. ~~Plausibilitätswarnungen~~ (umgesetzt: `plaus()` mit Stufen Fehler/Prüfen/Hinweis; Anzeige im Raum, als ⚠-Zähler auf der Raumkarte und gesammelt im Reiter „Ergebnis“ mit Sprung zum Bauteil. Neue Prüfungen dort ergänzen; das Beispielprojekt darf nur den Hinweis „θe −12 °C Standard“ auslösen.)
