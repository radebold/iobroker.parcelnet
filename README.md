# ioBroker.parcelnet

ParcelNet is an ioBroker adapter for the [Parcel App API](https://parcelapp.net/help/api-view-deliveries.html). It polls active or recent deliveries from the Parcel cloud API and exposes them as ioBroker states and ready-to-use HTML output for VIS.

## Features

- Poll active or recent deliveries from the Parcel API
- Secure API key in the admin UI
- Ready-to-use VIS HTML states
  - `parcelnet.0.vis.html`
  - `parcelnet.0.vis.htmlCompact`
- Manual refresh via `parcelnet.0.tools.refreshNow`
- Per-delivery states below `parcelnet.0.deliveries.list.*`
- Optional demo view for VIS when the API returns no deliveries
- Carrier mapping including Amazon Logistics aliases such as `amzlde`

## Supported Parcel API fields

The adapter consumes Parcel delivery objects such as:
- `carrier_code`
- `description`
- `status_code`
- `tracking_number`
- `date_expected`
- `date_expected_end`
- `timestamp_expected`
- `timestamp_expected_end`
- `event`
- `date`
- `location`
- `additional`
- `extra_information`

Reference: [Parcel API – View Deliveries](https://parcelapp.net/help/api-view-deliveries.html)

## Installation

### GitHub / manual beta installation

Until the adapter is listed in the official repository, install it from GitHub:

```bash
iobroker url https://github.com/ioBroker/ioBroker.parcelnet --host this
```

### Later via official latest repository

After acceptance into the official ioBroker **latest** repository, users can install it directly from the adapter list.

## Configuration

Open the adapter instance and configure:

- **Parcel API key**
- **Filter mode**: `active` or `recent`
- **Polling interval**
- **Request timeout**
- **VIS sort order**
- **Demo view when API is empty**
- **Optional logo paths / URLs**

The Parcel API endpoint is cached and rate-limited. The adapter therefore enforces a minimum polling interval of 3 minutes.

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
- `parcelnet.0.deliveries.inDeliveryCount`
- `parcelnet.0.deliveries.json`
- `parcelnet.0.deliveries.formatted`
- `parcelnet.0.deliveries.nextEta`
- `parcelnet.0.deliveries.arrivingToday`

### Per delivery
Example:
- `parcelnet.0.deliveries.list.01.active`
- `parcelnet.0.deliveries.list.01.carrierCode`
- `parcelnet.0.deliveries.list.01.carrierName`
- `parcelnet.0.deliveries.list.01.carrierIcon`
- `parcelnet.0.deliveries.list.01.description`
- `parcelnet.0.deliveries.list.01.statusCode`
- `parcelnet.0.deliveries.list.01.statusText`
- `parcelnet.0.deliveries.list.01.event`
- `parcelnet.0.deliveries.list.01.eventDate`
- `parcelnet.0.deliveries.list.01.eventAdditional`
- `parcelnet.0.deliveries.list.01.eta`
- `parcelnet.0.deliveries.list.01.trackingNumber`

### VIS
- `parcelnet.0.vis.html`
- `parcelnet.0.vis.htmlCompact`

### Tools
- `parcelnet.0.tools.refreshNow`

## VIS usage

For desktop/tablet:
- bind an HTML/string widget to `parcelnet.0.vis.html`

For mobile:
- bind an HTML/string widget to `parcelnet.0.vis.htmlCompact`

## Carrier logos

In the current beta state, carrier logos are configured by path or URL in the admin UI. Examples:

- `/adapter/parcelnet/carriers/dhl.svg`
- `/vis.0/main/img/parcelnet/amazon.png`
- `https://example.com/logo.svg`

If no custom logo is configured, the built-in fallback icon is used.

## Development status

This package contains the current beta preparation based on the 0.6.3 hotfix line. The goal is public testing in the official **latest** repository first, then later a move to **stable**.

## Changelog

### 0.7.0-beta.1
- beta release preparation
- cleaned metadata for repository submission
- GitHub Actions workflow added
- public beta checklist added
- includes current hotfix level from the 0.6.3 line

### 0.6.3-hotfix21
- mobile/compact text shifted slightly to the right to avoid overlap with logos

### 0.6.3-hotfix20
- mobile/compact layout optimization for phones

### 0.6.3-hotfix19
- cleanup attempt for legacy `files` object

### 0.6.3-hotfix17
- manual refresh reacts more reliably

### 0.6.3-hotfix16
- better logo visibility on dark backgrounds

### 0.6.3-hotfix15
- fixed missing `getDisplayStatus()` method

### 0.6.3-hotfix14
- event is preferred over generic status text in VIS
- activeCount corrected

## License

MIT
