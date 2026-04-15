# ioBroker.parcelnet

ioBroker-Adapter für die **Parcel App API**. Der Adapter holt aktive oder letzte Sendungen von Parcel ab und schreibt sie in States, die sich direkt in VIS, Skripten oder eigenen Widgets verwenden lassen.

## Funktionen

- Abruf der Parcel-API im Modus **active** oder **recent**
- API-Key sicher über die Admin-Oberfläche konfigurierbar
- Polling mit Mindestabstand von 3 Minuten
- fertige States für Logik, JSON und VIS
- manuelles Aktualisieren über `parcelnet.0.tools.refreshNow`
- fertiger HTML-State für VIS mit **Carrier-Icons**
- **Demoansicht mit bekannten Carriern**, wenn die API aktuell keine Sendungen liefert

## Konfiguration

Die Konfiguration erfolgt in der Adapter-Instanz über Admin:

- **API Key**: dein Parcel API-Key
- **Filter mode**: `active` oder `recent`
- **Polling interval**: Abrufintervall in Minuten, mindestens 3
- **Request timeout**: Timeout für den HTTP-Abruf
- **Max items in HTML**: maximale Anzahl Karten in der VIS-HTML-Ansicht
- **Show tracking number in HTML**: Trackingnummer in der HTML-Ansicht einblenden
- **Log raw response**: Rohantwort der API in Debug-Logs ausgeben

## Wichtige States

### Info

- `parcelnet.0.info.connection`
- `parcelnet.0.info.lastUpdate`
- `parcelnet.0.info.lastUpdateTs`
- `parcelnet.0.info.lastSource`
- `parcelnet.0.info.lastError`

### Lieferungen

- `parcelnet.0.deliveries.count`
- `parcelnet.0.deliveries.json`
- `parcelnet.0.deliveries.formatted`
- `parcelnet.0.deliveries.nextEta`
- `parcelnet.0.deliveries.arrivingToday`

### Einzelne Lieferungen

Je Lieferung wird ein Kanal erzeugt:

- `parcelnet.0.deliveries.list.01.active`
- `parcelnet.0.deliveries.list.01.description`
- `parcelnet.0.deliveries.list.01.carrierName`
- `parcelnet.0.deliveries.list.01.carrierCode`
- `parcelnet.0.deliveries.list.01.carrierIcon`
- `parcelnet.0.deliveries.list.01.trackingNumber`
- `parcelnet.0.deliveries.list.01.statusCode`
- `parcelnet.0.deliveries.list.01.statusText`
- `parcelnet.0.deliveries.list.01.eta`
- `parcelnet.0.deliveries.list.01.event`
- `parcelnet.0.deliveries.list.01.eventLocation`
- `parcelnet.0.deliveries.list.01.json`

Nicht mehr benötigte Slots werden geleert und auf `active = false` gesetzt.

### JSON

- `parcelnet.0.allProviderJson`
- `parcelnet.0.inDelivery`
- `parcelnet.0.inDeliveryCount`

### VIS / HTML

- `parcelnet.0.vis.html`
- `parcelnet.0.vis.htmlCompact`

Diese States enthalten direkt fertigen HTML-Code. In VIS reicht daher ein String-/HTML-Widget mit genau diesem Datenpunkt.

### Tools

- `parcelnet.0.tools.refreshNow`

Einfach `true` schreiben, der Adapter setzt den State nach dem manuellen Abruf wieder auf `false`.

## VIS einbinden

### Einfachste Variante

1. In VIS ein **HTML-Widget** oder **String-Widget** einfügen
2. Als Datenpunkt setzen:
   - `parcelnet.0.vis.html`
   - oder `parcelnet.0.vis.htmlCompact`
3. Fertig

Die HTML-Ansicht zeigt pro Sendung:

- Carrier-Icon
- Bezeichnung der Sendung
- Carrier-Name
- Status
- Trackingnummer
- ETA
- letztes Event
- Ort des letzten Events

## Demo-Carrier bei leerer API

Wenn die Parcel-API aktuell **keine aktiven Sendungen** zurückliefert, bleiben die eigentlichen Datenstates korrekt leer bzw. auf 0.

Für die VIS-Vorschau zeigt der Adapter in `vis.html` und `vis.htmlCompact` trotzdem Demo-Karten für bekannte Carrier an, zum Beispiel:

- DHL
- Hermes
- DPD
- UPS
- Amazon
- GLS
- Deutsche Post
- FedEx

Das hilft beim Testen des VIS-Layouts, auch wenn gerade kein echtes Paket in Parcel vorhanden ist.

## Bekannte Carrier-Icons

Die im Adapter enthaltenen Carrier-Grafiken liegen unter:

- `/adapter/parcelnet/carriers/dhl.svg`
- `/adapter/parcelnet/carriers/hermes.svg`
- `/adapter/parcelnet/carriers/dpd.svg`
- `/adapter/parcelnet/carriers/ups.svg`
- `/adapter/parcelnet/carriers/amazon.svg`
- `/adapter/parcelnet/carriers/gls.svg`
- `/adapter/parcelnet/carriers/deutschepost.svg`
- `/adapter/parcelnet/carriers/fedex.svg`
- `/adapter/parcelnet/carriers/parcel.svg`

## Installation

### ZIP / GitHub

Repository:

`https://github.com/radebold/parcelnet`

Installation wie gewohnt per URL oder ZIP in ioBroker Admin.

## Entwicklung

```bash
npm install
tsc
```

Die TypeScript-Quellen liegen unter `src/`, die kompilierten Dateien unter `build/`. Für ZIP-Installationen liegt zusätzlich eine lauffähige `main.js` im Repo-Root.

## Hinweise

- Der API-Key ist in `protectedNative` und `encryptedNative` hinterlegt.
- Das Polling wird aus Rücksicht auf die Parcel-API nicht unter 3 Minuten zugelassen.
- Die Demo-Carrier werden **nur in der HTML-Ansicht** verwendet, nicht als echte Lieferdaten.

## Changelog

### 0.6.2

- Carrier-Icons in der VIS-HTML-Ansicht ergänzt
- Demo-Carrier für leere API-Antworten ergänzt
- `carrierIcon` wird in den Einzelstates gefüllt
- README für Benutzer und GitHub erweitert

### 0.6.1

- stilisierte Carrier-Icons entfernt
- Parcel-artige VIS-JSON-States beibehalten

## Lizenz

MIT


## Changelog

### 0.6.3
- VIS-HTML kompakter gestaltet
- Scrollbalken in der HTML-Ansicht ergänzt
- Carrier-Icons größer dargestellt
- weiße Kachel hinter den Icons entfernt, damit der transparente Hintergrund sichtbar bleibt
