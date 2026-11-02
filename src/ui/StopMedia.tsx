/* eslint-disable @next/next/no-img-element -- pictures come through our own photo and thumbnail routes */
import type { ItemKind } from "@/domain/types";
import { KIND_CHIP, KIND_LABEL } from "./badges";
import { Icon, KIND_ICON } from "./Icon";

/*
 * The picture at the start of a stop's row: what the place looks like. Since
 * the photo route only returns pictures confirmed to show the place (or a
 * stand-in for the destination), this is information, not decoration.
 *
 * - Stays, activities and food get the photo; flights and transfers keep
 *   their icon tile, since a plane picture says nothing a plane icon doesn't.
 * - The kind stays readable on the photo as a small badge, so recognising a
 *   row never depends on the picture.
 * - The space is reserved (56px square) and a tinted tile with the kind's
 *   icon sits under the photo, so the first lookup (seconds) shows a calm
 *   placeholder and nothing moves when the picture arrives.
 * - alt="": the row's title already names the place.
 *
 * No hooks, so the app's rows and the viewing link's server-drawn rows share it.
 */

/** Kinds whose row shows the place's picture. */
export const PICTURED: ReadonlySet<ItemKind> = new Set(["stay", "activity", "food"]);

export function StopMedia({ kind, src, dim = false }: { kind: ItemKind; src?: string | null; dim?: boolean }) {
  const tint = KIND_CHIP[kind];
  if (!src || !PICTURED.has(kind)) {
    return (
      <span className={`chip relative flex size-14 shrink-0 items-center justify-center rounded-2xl ${tint} ${dim ? "opacity-60" : ""}`} title={KIND_LABEL[kind]}>
        <Icon name={KIND_ICON[kind]} className="size-6" />
      </span>
    );
  }
  return (
    <span className={`relative size-14 shrink-0 ${dim ? "opacity-60" : ""}`}>
      <span className={`absolute inset-0 flex items-center justify-center overflow-hidden rounded-2xl ${tint}`}>
        <Icon name={KIND_ICON[kind]} className="size-6" />
        <img src={src} alt="" width={56} height={56} loading="lazy" decoding="async" className="absolute inset-0 size-full object-cover" />
      </span>
      <span className={`chip absolute -right-1 -bottom-1 flex size-6 items-center justify-center rounded-full ring-2 ring-canvas ${tint}`} title={KIND_LABEL[kind]}>
        <Icon name={KIND_ICON[kind]} className="size-3.5" />
      </span>
    </span>
  );
}

/*
 * A day as a timeline: the rows' pictures sit on one rail, and the drive
 * between two stops sits on the rail between them. The rail runs through the
 * centre of the picture column: 0.5rem row padding + 4.5rem time column
 * ("11:30 AM" on one line) + 0.75rem gap + half of the 3.5rem picture =
 * 7.5rem (left-30). Text starts at 10rem (pl-40). The pictures are
 * positioned, so they paint over the rail.
 */
/** The list a day's rows go in, with its rail. `endsAtAdd`: the last row is the small "Add to …" stop. Class names in full, so Tailwind sees them. */
export function railList(endsAtAdd: boolean): string {
  return endsAtAdd
    ? "relative -mx-2 flex flex-col before:pointer-events-none before:absolute before:top-10 before:bottom-6 before:left-30 before:w-0.5 before:-translate-x-1/2 before:rounded-full before:bg-line"
    : "relative -mx-2 flex flex-col before:pointer-events-none before:absolute before:top-10 before:bottom-10 before:left-30 before:w-0.5 before:-translate-x-1/2 before:rounded-full before:bg-line";
}
