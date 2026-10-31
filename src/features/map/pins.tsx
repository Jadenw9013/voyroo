"use client";

import type { LatLng } from "@/domain/geo";
import type { ItemKind } from "@/domain/types";
import { KIND_CHIP } from "@/ui/badges";
import { Icon, KIND_ICON } from "@/ui/Icon";

/*
 * Pins as price-tag pills, like a stay map: the kind's icon (or the stop's
 * number on a day) on its color, then "Sat 9 AM · Pacaya hike". Each is a
 * button 44px tall; the pill inside is smaller so neighbours stay readable.
 */

export interface MapPin extends LatLng {
  id: string;
  kind: ItemKind;
  /** On the pill. */
  label: string;
  /** Read out: number, when, what, kind and status. */
  name: string;
  /** Order in the day, on a day's map. */
  n?: number;
  /** An idea with no day: drawn quieter. */
  idea?: boolean;
}

function Caret({ selected }: { selected: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`-mt-[7px] size-3 rotate-45 border-r border-b ${selected ? "border-accent bg-accent" : "border-line bg-surface"}`}
    />
  );
}

export function PinButton({ pin, selected, onClick }: { pin: MapPin; selected: boolean; onClick: () => void }) {
  return (
    <button type="button" data-pins={pin.id} onClick={onClick} aria-label={pin.name} aria-current={selected ? "true" : undefined} className="flex min-h-11 flex-col items-center justify-end rounded-full pt-1">
      <span
        className={`relative z-[1] flex max-w-[13.5rem] items-center gap-1.5 rounded-full border py-1 pr-3 pl-1 text-sm leading-tight font-bold whitespace-nowrap shadow-lift transition-transform ${
          selected ? "scale-110 border-accent bg-accent text-on-accent" : pin.idea ? "border-dashed border-line bg-surface text-ink" : "border-line bg-surface text-ink"
        }`}
      >
        <span className={`chip tnum flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-extrabold ${KIND_CHIP[pin.kind]}`}>
          {pin.n ?? <Icon name={KIND_ICON[pin.kind]} className="size-3.5" />}
        </span>
        <span className="truncate">{pin.label}</span>
      </span>
      <Caret selected={selected} />
    </button>
  );
}

export function GroupButton({ pins, selected, onClick }: { pins: MapPin[]; selected: boolean; onClick: () => void }) {
  const kinds = [...new Set(pins.map((p) => p.kind))].slice(0, 3);
  const names = pins.map((p) => p.label.split(" · ").at(-1)).join(", ");
  return (
    <button type="button" data-pins={pins.map((p) => p.id).join(" ")} onClick={onClick} aria-label={`${pins.length} places here: ${names}. Show them.`} className="flex min-h-11 flex-col items-center justify-end rounded-full pt-1">
      <span
        className={`relative z-[1] flex items-center gap-1.5 rounded-full border py-1 pr-3 pl-1 text-sm leading-tight font-extrabold whitespace-nowrap shadow-lift ${
          selected ? "border-accent bg-accent text-on-accent" : "border-line bg-surface text-ink"
        }`}
      >
        <span className="flex -space-x-2">
          {kinds.map((k) => (
            <span key={k} className={`chip flex size-6 items-center justify-center rounded-full ring-2 ring-surface ${KIND_CHIP[k]}`}>
              <Icon name={KIND_ICON[k]} className="size-3.5" />
            </span>
          ))}
        </span>
        <span className="tnum">{pins.length} places</span>
      </span>
      <Caret selected={selected} />
    </button>
  );
}
