# Spirii Go

Find nearby [Spirii Go](https://spirii.dk) EV charging locations, check availability, and view current and upcoming prices for individual chargepoints — directly from Raycast.

## Commands

- **Nearby Chargers** — Lists Spirii Go locations sorted by distance, with live availability and power.
- **My Chargepoint** — Shows the live status and price schedule for a saved chargepoint ID.

## Location

The extension determines your location in this order:

1. **Manual override** — set `Latitude` and `Longitude` in preferences.
2. **macOS GPS** — via [`CoreLocationCLI`](https://github.com/fulldecent/corelocationcli) (`brew install corelocationcli`).

If neither is available the extension will prompt you — it won't fall back to a default location. No location data leaves your machine; only the Spirii API is contacted.

## Preferences

| Name | Description |
| --- | --- |
| My Chargepoint ID | Used by the "My Chargepoint" command (e.g. `DK.SPI.Z165227*1`). |
| Price Granularity | Hourly average or raw 15-minute buckets for the schedule. |
| Latitude / Longitude | Optional manual overrides for location. |

## Data source

Uses the public `app.spirii.dk` API. Unaffiliated with Spirii.
