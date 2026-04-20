import { Action, ActionPanel, Color, Icon, List, openExtensionPreferences, showToast, Toast } from "@raycast/api";
import { useEffect, useMemo } from "react";
import { useCachedPromise, useFetch } from "@raycast/utils";
import { locationsUrl } from "./api";
import { getCoords } from "./location";
import { Location } from "./types";
import { availabilityColor, haversine } from "./utils";
import ChargepointsList from "./components/ChargepointsList";

export default function Command() {
  const {
    data: coords,
    isLoading: coordsLoading,
    error: coordsError,
    revalidate: revalidateCoords,
  } = useCachedPromise(getCoords);

  const url = coords ? locationsUrl(coords.lat, coords.lon) : "";
  const {
    data: locations,
    isLoading: listLoading,
    error: listError,
    revalidate,
  } = useFetch<Location[]>(url, {
    execute: Boolean(url),
    keepPreviousData: true,
  });

  const isLoading = coordsLoading || listLoading;

  const sorted = useMemo(() => {
    if (!locations) return [];
    const own = locations.filter((l) => l.platform === "spirii");
    return [...own].sort((a, b) => {
      if (!coords) return 0;
      const da = haversine(coords.lat, coords.lon, a.coordinates.latitude, a.coordinates.longitude);
      const db = haversine(coords.lat, coords.lon, b.coordinates.latitude, b.coordinates.longitude);
      return da - db;
    });
  }, [locations, coords]);

  useEffect(() => {
    if (coords?.warning) {
      showToast({ style: Toast.Style.Failure, title: "Location fallback", message: coords.warning });
    }
  }, [coords?.warning]);

  const retry = () => {
    revalidateCoords();
    if (url) revalidate();
  };

  if (coordsError || listError) {
    return (
      <List>
        <List.EmptyView
          icon={Icon.Warning}
          title="Could not load chargers"
          description={(coordsError || listError)?.message ?? "Network error"}
          actions={
            <ActionPanel>
              <Action title="Retry" icon={Icon.RotateClockwise} onAction={retry} />
            </ActionPanel>
          }
        />
      </List>
    );
  }

  const sourceLabel = coords ? sourceToLabel(coords.source) : "Locating…";

  return (
    <List isLoading={isLoading} searchBarPlaceholder={`Filter by name, address, or city… (${sourceLabel})`}>
      {sorted.length === 0 && !isLoading ? (
        <List.EmptyView
          icon={Icon.MagnifyingGlass}
          title="No nearby chargers"
          description={`Using ${sourceLabel}. Install CoreLocationCLI for precise GPS or set a manual override in preferences.`}
          actions={
            <ActionPanel>
              <Action title="Open Extension Preferences" icon={Icon.Gear} onAction={openExtensionPreferences} />
            </ActionPanel>
          }
        />
      ) : (
        sorted.map((loc) => {
          const distanceKm = coords
            ? haversine(coords.lat, coords.lon, loc.coordinates.latitude, loc.coordinates.longitude)
            : null;
          return (
            <List.Item
              key={loc.id}
              icon={{ source: Icon.Plug, tintColor: availabilityColor(loc.available, loc.evseCount) }}
              title={loc.name}
              subtitle={`${loc.address}, ${loc.zipCode} ${loc.city}`}
              accessories={[
                { tag: { value: `${loc.power.max} kW`, color: Color.Blue } },
                ...(distanceKm !== null
                  ? [{ text: distanceKm < 1 ? `${Math.round(distanceKm * 1000)} m` : `${distanceKm.toFixed(1)} km` }]
                  : []),
                {
                  tag: {
                    value: `${loc.available}/${loc.evseCount} available`,
                    color: availabilityColor(loc.available, loc.evseCount),
                  },
                },
              ]}
              actions={
                <ActionPanel>
                  <Action.Push
                    title="View Chargepoints"
                    icon={Icon.List}
                    target={<ChargepointsList location={loc} />}
                  />
                  <Action.OpenInBrowser
                    title="Open in Maps"
                    url={`https://maps.apple.com/?q=${encodeURIComponent(loc.name)}&ll=${loc.coordinates.latitude},${loc.coordinates.longitude}`}
                  />
                  <Action.CopyToClipboard title="Copy Location ID" content={loc.id} />
                  <Action title="Refresh" icon={Icon.RotateClockwise} onAction={() => revalidate()} shortcut={{ modifiers: ["cmd"], key: "r" }} />
                  <Action title="Open Extension Preferences" icon={Icon.Gear} onAction={openExtensionPreferences} />
                </ActionPanel>
              }
            />
          );
        })
      )}
    </List>
  );
}

function sourceToLabel(source: string): string {
  if (source === "corelocation") return "GPS";
  if (source === "preference") return "manual override";
  if (source === "ip") return "IP geolocation";
  return "default: Copenhagen";
}

