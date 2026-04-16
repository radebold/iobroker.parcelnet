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
