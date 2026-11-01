"use client";

import { useState } from "react";
import { driverLines, driverPhrase, driverText } from "@/domain/essentials";
import { directionsUrl } from "@/domain/links";
import type { Item, Trip } from "@/domain/types";
import { actionClass } from "@/ui/action";
import { Icon } from "@/ui/Icon";
import { Sheet } from "@/ui/Sheet";

/**
 * "Show to driver" on the viewing link: the place's name and where it is in
 * big type, under "please take me to" in the local language. The same card
 * as in the app, without the trip's store behind it.
 */
export function ShareDriver({ item, trip, tone = "default" }: { item: Item; trip: Pick<Trip, "tz" | "destination">; tone?: "default" | "ticket" }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const phrase = driverPhrase(trip);
  const { name, rest } = driverLines(item);
  const dir = directionsUrl(item.place, trip);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={actionClass(tone)}>
        <Icon name="bus" className="size-5" />
        Show to driver
      </button>
      {open && (
        <Sheet open onClose={() => setOpen(false)} title="Show to driver" wide>
          <div className="flex flex-col gap-4 pb-2">
            <div lang={phrase.lang} className="flex flex-col gap-3 rounded-2xl border-2 border-ink bg-surface p-5 text-ink">
              <p className="text-xl leading-snug font-bold sm:text-2xl">{phrase.please}</p>
              <p className="text-3xl leading-tight font-bold break-words sm:text-4xl">{name}</p>
              {rest.map((line) => (
                <p key={line} className="text-2xl leading-snug font-bold break-words sm:text-3xl">
                  {line}
                </p>
              ))}
              <p className="text-xl font-semibold">{phrase.thanks}</p>
            </div>
            <p className="text-sm text-muted">
              {phrase.lang === "en" ? "Turn your phone toward the driver." : `In ${phrase.language}. Turn your phone toward the driver.`}
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(driverText(item));
                    setCopied("Name and address copied");
                  } catch {
                    setCopied(`Couldn't copy. ${driverText(item).replace(/\n/g, ", ")}`);
                  }
                }}
                className={actionClass()}
              >
                <Icon name="copy" className="size-5" />
                Copy name and address
              </button>
              {dir && (
                <a href={dir} target="_blank" rel="noreferrer" className={actionClass()}>
                  <Icon name="directions" className="size-5" />
                  Directions
                </a>
              )}
            </div>
            <p role="status" className="text-sm text-muted">
              {copied}
            </p>
          </div>
        </Sheet>
      )}
    </>
  );
}
