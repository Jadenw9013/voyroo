"use client";

import { driverPhrase, driverText } from "@/domain/essentials";
import { directionsUrl } from "@/domain/links";
import type { Item } from "@/domain/types";
import { useTrip } from "@/client/store";
import { Icon } from "@/ui/Icon";
import { ActionChip, useCopy } from "@/ui/kit";
import { Sheet } from "@/ui/Sheet";

/**
 * A stay's name and address in big type, under "please take me to" in the
 * local language, to turn toward a taxi or tuk-tuk driver.
 */
export function DriverSheet({ item, onClose }: { item: Item; onClose: () => void }) {
  const { trip } = useTrip();
  const copy = useCopy();
  const phrase = driverPhrase(trip);
  const name = item.place?.name || item.title;
  const address = item.place?.address && item.place.address !== name ? item.place.address : null;
  const dir = directionsUrl(item.place, trip);
  return (
    <Sheet open onClose={onClose} title="Show to driver" wide>
      <div className="flex flex-col gap-4 pb-2">
        <div lang={phrase.lang} className="flex flex-col gap-3 rounded-2xl border-2 border-ink bg-surface p-5 text-ink">
          <p className="text-xl leading-snug font-bold sm:text-2xl">{phrase.please}</p>
          <p className="text-3xl leading-tight font-extrabold break-words sm:text-4xl">{name}</p>
          {address && <p className="text-2xl leading-snug font-bold break-words sm:text-3xl">{address}</p>}
          <p className="text-xl font-semibold">{phrase.thanks}</p>
        </div>
        <p className="text-sm text-muted">
          {phrase.lang === "en" ? "Turn your phone toward the driver." : `In ${phrase.language}. Turn your phone toward the driver.`}
        </p>
        <div className="flex flex-wrap gap-2">
          <ActionChip icon="copy" onClick={() => void copy(driverText(item), "Name and address")}>
            Copy name and address
          </ActionChip>
          {dir && (
            <ActionChip icon="directions" href={dir}>
              Directions
            </ActionChip>
          )}
        </div>
      </div>
    </Sheet>
  );
}

/** The chip that opens it, for a stay with somewhere to go. */
export function DriverChip({ item, onOpen }: { item: Item; onOpen: () => void }) {
  if (!item.place?.address && !item.place?.name) return null;
  return (
    <button type="button" onClick={onOpen} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-surface px-4 text-base font-semibold text-ink hover:bg-sunken">
      <Icon name="bus" className="size-[1.1rem]" />
      Show to driver
    </button>
  );
}
