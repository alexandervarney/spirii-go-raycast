import { Action, ActionPanel, getPreferenceValues, Icon, List } from "@raycast/api";
import { useFetch } from "@raycast/utils";
import { useMemo } from "react";
import { evseUrl } from "../api";
import { Evse, PriceElement } from "../types";
import {
  formatDkk,
  formatTimeWindow,
  prettyDate,
  isCurrent,
  isFallback,
  isUpcoming,
  statusColor,
  statusText,
  tierColor,
  tierForPrices,
} from "../utils";

type Props = { evseId: string };

export default function PriceSchedule({ evseId }: Props) {
  const { data, isLoading, error, revalidate } = useFetch<Evse>(evseUrl(evseId), { keepPreviousData: true });

  const { priceGranularity } = getPreferenceValues<{ priceGranularity?: "hour" | "15min" }>();
  const granularity: "hour" | "15min" = priceGranularity ?? "hour";

  const { currentEl, upcoming, currentPrice, isFixed } = useMemo(() => {
    const empty = { currentEl: null, upcoming: [], currentPrice: null, isFixed: false };
    if (!data?.price) return empty;
    const els = data.price.elements ?? [];
    const now = new Date();
    const current = els.find((e) => !isFallback(e) && isCurrent(e, now)) ?? null;
    const futureEls = els.filter((e) => !isFallback(e) && isUpcoming(e, now));
    const future = granularity === "hour" ? groupByHour(futureEls) : toRawBuckets(futureEls);
    const hasSchedule = current !== null || futureEls.length > 0;
    if (current) {
      return {
        currentEl: current,
        upcoming: future,
        currentPrice: current.price_components[0]?.price ?? null,
        isFixed: false,
      };
    }
    if (!hasSchedule && typeof data.price.perKwh === "number") {
      return { currentEl: null, upcoming: [], currentPrice: data.price.perKwh, isFixed: true };
    }
    const fallback = !hasSchedule ? (els.find(isFallback) ?? null) : null;
    return {
      currentEl: fallback,
      upcoming: future,
      currentPrice: fallback?.price_components[0]?.price ?? null,
      isFixed: !hasSchedule && fallback !== null,
    };
  }, [data, granularity]);

  if (error) {
    return (
      <List navigationTitle={evseId}>
        <List.EmptyView
          icon={Icon.Warning}
          title="Could not load chargepoint"
          description={error.message}
          actions={
            <ActionPanel>
              <Action title="Retry" icon={Icon.RotateClockwise} onAction={() => revalidate()} />
            </ActionPanel>
          }
        />
      </List>
    );
  }

  const tier = tierForPrices(upcoming.map((u) => u.price));
  const topCheapest = [...upcoming].sort((a, b) => a.price - b.price).slice(0, 3);

  const nowTitle = currentPrice !== null ? `${currentPrice.toFixed(2)} DKK/kWh` : "Price unavailable";
  const nowSubtitle = isFixed ? "Fixed price" : currentEl ? formatTimeWindow(currentEl) : "";

  return (
    <List isLoading={isLoading} navigationTitle={evseId} searchBarPlaceholder="Filter time windows…">
      {data && (
        <List.Section title="Now">
          <List.Item
            icon={{ source: Icon.Bolt, tintColor: statusColor(data.status) }}
            title={nowTitle}
            subtitle={nowSubtitle}
            accessories={[
              { tag: { value: statusText(data.status), color: statusColor(data.status) } },
            ]}
            actions={
              <ActionPanel>
                <Action.CopyToClipboard title="Copy Chargepoint ID" content={data.evseId} />
                {currentPrice !== null && (
                  <Action.CopyToClipboard title="Copy Current Price" content={formatDkk(currentPrice)} />
                )}
                <Action
                  title="Refresh"
                  icon={Icon.RotateClockwise}
                  onAction={() => revalidate()}
                  shortcut={{ modifiers: ["cmd"], key: "r" }}
                />
              </ActionPanel>
            }
          />
        </List.Section>
      )}
      {topCheapest.length > 0 && (
        <List.Section title="Cheapest">
          {topCheapest.map((hour, i) => {
            const t = tier(hour.price);
            return (
              <List.Item
                key={`cheap-${hour.date}-${hour.startTime}-${i}`}
                icon={{ source: Icon.Star, tintColor: tierColor(t) }}
                title={`${hour.startTime} – ${hour.endTime}`}
                subtitle={prettyDate(hour.date)}
                accessories={[{ tag: { value: formatDkk(hour.price), color: tierColor(t) } }]}
                actions={
                  <ActionPanel>
                    <Action.CopyToClipboard title="Copy Price" content={formatDkk(hour.price)} />
                    <Action
                      title="Refresh"
                      icon={Icon.RotateClockwise}
                      onAction={() => revalidate()}
                      shortcut={{ modifiers: ["cmd"], key: "r" }}
                    />
                  </ActionPanel>
                }
              />
            );
          })}
        </List.Section>
      )}
      <List.Section title="Upcoming">
        {upcoming.map((hour, i) => {
          const t = tier(hour.price);
          return (
            <List.Item
              key={`${hour.date}-${hour.startTime}-${i}`}
              icon={{ source: Icon.Clock, tintColor: tierColor(t) }}
              title={`${hour.startTime} – ${hour.endTime}`}
              subtitle={prettyDate(hour.date)}
              accessories={[{ tag: { value: formatDkk(hour.price), color: tierColor(t) } }]}
              actions={
                <ActionPanel>
                  <Action.CopyToClipboard title="Copy Price" content={formatDkk(hour.price)} />
                  <Action
                    title="Refresh"
                    icon={Icon.RotateClockwise}
                    onAction={() => revalidate()}
                    shortcut={{ modifiers: ["cmd"], key: "r" }}
                  />
                </ActionPanel>
              }
            />
          );
        })}
      </List.Section>
      {!isLoading && upcoming.length === 0 && !currentEl && (
        <List.EmptyView icon={Icon.Info} title="No price data" description="This chargepoint has no pricing schedule." />
      )}
    </List>
  );
}

type HourBucket = {
  date: string;
  startTime: string;
  endTime: string;
  price: number;
};

function toRawBuckets(els: PriceElement[]): HourBucket[] {
  return els
    .map((el) => {
      const r = el.restrictions;
      return {
        date: r?.start_date ?? "",
        startTime: r?.start_time ?? "",
        endTime: r?.end_time ?? "",
        price: el.price_components[0]?.price ?? 0,
      };
    })
    .sort((a, b) => `${a.date}T${a.startTime}`.localeCompare(`${b.date}T${b.startTime}`));
}

function groupByHour(els: PriceElement[]): HourBucket[] {
  const buckets = new Map<string, { date: string; hour: number; sum: number; count: number }>();
  for (const el of els) {
    const r = el.restrictions;
    if (!r?.start_date || !r?.start_time) continue;
    const hour = parseInt(r.start_time.slice(0, 2), 10);
    if (!Number.isFinite(hour)) continue;
    const key = `${r.start_date}T${String(hour).padStart(2, "0")}`;
    const price = el.price_components[0]?.price ?? 0;
    const existing = buckets.get(key);
    if (existing) {
      existing.sum += price;
      existing.count += 1;
    } else {
      buckets.set(key, { date: r.start_date, hour, sum: price, count: 1 });
    }
  }
  return Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, v]) => ({
      date: v.date,
      startTime: `${String(v.hour).padStart(2, "0")}:00`,
      endTime: `${String((v.hour + 1) % 24).padStart(2, "0")}:00`,
      price: v.sum / v.count,
    }));
}

