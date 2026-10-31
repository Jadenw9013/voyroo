"use client";

import { useState } from "react";
import { everyone, expensesFor } from "@/domain/expenses";
import { formatMoney } from "@/domain/money";
import type { Expense, Item } from "@/domain/types";
import { useTrip } from "@/client/store";
import { Icon } from "@/ui/Icon";
import { btn } from "@/ui/kit";
import { ExpenseSheet, type ExpenseStart } from "./ExpenseForm";
import { splitWords } from "./Expenses";

/** On an item's page: what's been paid for it, and "Log expense" filled in from the booking's price. */
export function ItemExpenses({ item }: { item: Item }) {
  const { trip, me } = useTrip();
  const [open, setOpen] = useState<{ expense?: Expense; start?: ExpenseStart } | null>(null);
  const logged = expensesFor(trip, item.id);
  const price = item.booking?.price;
  const by = item.booking?.by;
  const start: ExpenseStart = {
    title: item.title,
    itemId: item.id,
    ...(price ? { amount: price.amount, currency: price.currency } : {}),
    ...(by && everyone(trip, me).includes(by) ? { paidBy: by } : {}),
  };
  return (
    <div className="flex flex-col gap-2">
      {logged.length > 0 ? (
        <ul className="flex flex-col divide-y divide-line">
          {logged.map((e) => (
            <li key={e.id}>
              <button type="button" onClick={() => setOpen({ expense: e })} className="flex min-h-12 w-full items-center gap-3 py-2 text-left">
                <Icon name="receipt" className="size-5 text-muted" />
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-semibold">{e.title}</span>
                  <span className="block text-sm text-muted">{splitWords(e, me)}</span>
                </span>
                <span className="tnum text-base font-bold">{formatMoney(e.amount, e.currency)}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-base text-muted">{price ? `Booked for ${formatMoney(price.amount, price.currency)}. Paid for it? Log it and it's split with the group.` : "Paid for this? Log it and it's split with the group."}</p>
      )}
      <button type="button" onClick={() => setOpen({ start })} className={`${btn.secondary} self-start`}>
        <Icon name="receipt" />
        Log expense
      </button>
      {open && <ExpenseSheet expense={open.expense} start={open.start} onClose={() => setOpen(null)} />}
    </div>
  );
}
