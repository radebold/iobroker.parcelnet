## 0.6.3-hotfix10

- Fix: Adapter startete nicht mehr, weil `ensureFileMetaObject()` fehlte.
- Datei-Metaobjekt `parcelnet.0.files` wird jetzt sauber angelegt.

# ioBroker.parcelnet

Ein schlanker ioBroker-Adapter in **TypeScript** für die Parcel-App-API.

## Funktionen

- Abruf von **aktiven** oder **letzten** Lieferungen über die Parcel-API
- API-Key bequem über die Admin-Oberfläche konfigurierbar
- Polling-Intervall frei einstellbar
- States für:
  - `deliveries.count`
  - `deliveries.json`
  - `deliveries.formatted`
  - `deliveries.nextEta`
  - `deliveries.arrivingToday`
  - `deliveries.list.XX.*`
  - `vis.html`
  - `vis.htmlCompact`
  - `tools.refreshNow`
- Manueller Refresh über `parcelnet.0.tools.refreshNow`

## Voraussetzungen

- ioBroker
- gültiger Parcel API-Key von `web.parcelapp.net`
- Das Parcel-API-Endpunkt liefert laut offizieller Doku nur gecachte Antworten und ist auf **20 Requests pro Stunde** limitiert. Deshalb erzwingt der Adapter mindestens **3 Minuten** Polling-Abstand.

## Installation über GitHub

Repository:
`https://github.com/radebold/parcelnet`

Beispiel:

```bash
iobroker url https://github.com/radebold/parcelnet --host this
```

Oder wie gewohnt über die URL-Installation in ioBroker Admin.

## Wichtige States

### Übersicht
- `parcelnet.0.info.connection`
- `parcelnet.0.info.lastUpdate`
- `parcelnet.0.info.lastError`

### Lieferungen
- `parcelnet.0.deliveries.count`
- `parcelnet.0.deliveries.json`
- `parcelnet.0.deliveries.formatted`
- `parcelnet.0.deliveries.nextEta`
- `parcelnet.0.deliveries.arrivingToday`

### Einzelne Lieferungen
Für jede Position wird ein Kanal angelegt, z. B.:

- `parcelnet.0.deliveries.list.01.description`
- `parcelnet.0.deliveries.list.01.statusText`
- `parcelnet.0.deliveries.list.01.eta`
- `parcelnet.0.deliveries.list.01.event`

Nicht mehr benötigte Slots werden geleert und auf `active = false` gesetzt.

### VIS
- `parcelnet.0.vis.html`
- `parcelnet.0.vis.htmlCompact`

### Tools
- `parcelnet.0.tools.refreshNow`

Zum manuellen Aktualisieren einfach `true` auf `tools.refreshNow` schreiben. Der Adapter setzt den State danach automatisch wieder auf `false`.

## Entwicklung

```bash
npm install
npm run build
```

## Hinweise

Der Adapter speichert den API-Key als `protectedNative` und `encryptedNative` in der Instanzkonfiguration.

## Lizenz

MIT


## VIS JSON

- `parcelnet.0.allProviderJson` enthält ein flaches JSON-Array für VIS json-Widgets
- `parcelnet.0.inDelivery` enthält nur Sendungen mit Status `In Zustellung`
- `parcelnet.0.inDeliveryCount` enthält die Anzahl dieser Sendungen

## VIS-HTML

Für VIS genügt ein HTML-/String-Widget mit einem dieser States:

- `parcelnet.0.vis.html`
- `parcelnet.0.vis.htmlCompact`

Die HTML-Ansicht ist transparent und für Scrollen innerhalb des Widgets ausgelegt.

## Carrier-Logos per Admin

Im Reiter **Carrier-Logos** kann pro Carrier ein eigenes Logo gewählt werden.

Empfohlener Ablauf:

1. Datei im ioBroker-Dateisystem hochladen, zum Beispiel nach `vis.0 / main / img / parcelnet`
2. Im Adapter unter **Carrier-Logos** das passende Bild pro Carrier auswählen
3. Adapter speichern

Unterstützte Formate:
- PNG
- SVG
- JPG/JPEG
- WEBP

## Demo-Ansicht

Wenn die Parcel-API keine Sendungen liefert, kann optional eine Demo-Ansicht für VIS eingeblendet werden.

Schalter dafür:
- **Allgemein → Demo-Carrier anzeigen, wenn die API keine Sendungen liefert**

Wichtig:
- Die Demo erscheint nur in `vis.html` und `vis.htmlCompact`
- Die echten Lieferstates unter `deliveries.*` bleiben dabei leer


## Hotfix 7

Die Carrier-Logos werden jetzt direkt in den eigenen Dateibereich des Adapters hochgeladen:

- Zielordner: `/parcelnet.0/carriers`
- nicht mehr: `vis.0/main/img/parcelnet`

Das vermeidet Probleme mit Berechtigungen, Pfaden und der Auswahl in der Admin-UI.


## 0.6.3-hotfix14

- GUI crash in the carrier logo tab removed
- direct upload fields replaced by stable text inputs for local paths, adapter paths, VIS paths or HTTPS URLs
- built-in fallback icons remain available when fields are empty


## Hotfix 13

- Carrier-Mapping für Amazon erweitert
- `amzlde` wird jetzt korrekt als **Amazon** erkannt
- zusätzliche Amazon-Aliasse ergänzt (`amzl`, `amazonde`)


## 0.6.3-hotfix15
- Fix: `getDisplayStatus is not a function`


## 0.6.3-hotfix16
- VIS: helle Logo-Kachel für bessere Lesbarkeit dunkler Carrier-Logos wie Amazon.
