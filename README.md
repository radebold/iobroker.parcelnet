# ioBroker.parcelnet

ParcelNet is an ioBroker adapter for the Parcel App API. It reads active or recent deliveries and exposes them as ioBroker states plus ready-to-use VIS HTML output.

## Features

- Poll active or recent deliveries from the Parcel API
- Secure API key configuration in the admin UI
- Delivery overview states and per-delivery detail states
- Ready-to-use VIS HTML for desktop and compact/mobile views
- Manual refresh via `parcelnet.0.tools.refreshNow`
- Carrier logo mapping with custom logo paths from the admin UI

## Configuration

Configure the adapter instance with:

- Parcel API key
- Filter mode (`active` or `recent`)
- Polling interval
- Request timeout
- Maximum items in VIS HTML
- Optional custom carrier logo paths

## Important states

### General
- `parcelnet.0.info.connection`
- `parcelnet.0.info.lastUpdate`
- `parcelnet.0.info.lastUpdateTs`
- `parcelnet.0.info.lastSource`
- `parcelnet.0.info.lastError`

### Delivery overview
- `parcelnet.0.deliveries.count`
- `parcelnet.0.deliveries.activeCount`
- `parcelnet.0.deliveries.arrivingToday`
- `parcelnet.0.deliveries.json`
- `parcelnet.0.deliveries.formatted`
- `parcelnet.0.deliveries.nextEta`

### VIS
- `parcelnet.0.vis.html`
- `parcelnet.0.vis.htmlCompact`

## Changelog

### 0.7.0-beta.21
- repository checker cleanup
- updated admin dependency requirement
- aligned package metadata
- kept standard CI workflow

## License

MIT License

Copyright (c) Thomas Radebold
