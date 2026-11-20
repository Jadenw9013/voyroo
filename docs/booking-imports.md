# Booking emails, receipts and offline bookings

In Plan → Import booking email, paste a confirmation or copy the private trip address.
Email imports save reservations with dates, location, provider (e.g. Expedia.com),
confirmation number, booking link and price when stated. Open the item to review or
edit details. Missing/unclear fields stay empty. Importing a reservation does not
log an expense: the reservation might not yet have been paid.

## Inbound email deployment

1. Configure durable Upstash Redis and `GEMINI_API_KEY` as for the rest of the app.
2. Create a Postmark Inbound Message Stream and set `POSTMARK_INBOUND_ADDRESS` to
   its address, e.g. `yourhash@inbound.postmarkapp.com`.
3. Generate a random secret of at least 32 characters (hex recommended) and set
   `BOOKING_EMAIL_SECRET`.
4. Set Postmark's inbound webhook to
   `https://voyroo:YOUR_SECRET@YOUR_HOST/api/inbound/postmark`.
   HTTPS Basic authentication is verified before parsing any message.
5. Open Import booking email while joined to the trip to create its private
   plus-address. Forward a confirmation to it and check the itinerary.

Provider references: [Inbound webhook](https://postmarkapp.com/developer/webhooks/inbound-webhook)
and [Basic authentication setup](https://postmarkapp.com/developer/user-guide/inbound/configure-an-inbound-server).

The private address authorizes additions to the trip; share it only within the
travel group. Rotate `BOOKING_EMAIL_SECRET` to invalidate all old addresses; open
the panel again to generate current ones. No sender identity is assumed from From.
The webhook accepts text and HTML email bodies, not attachment-only confirmations
or PDFs. HTML is never rendered and remote links/images are never fetched. Paste
imports are available without Postmark. Both paths require the configured model.
The itinerary change and delivery completion are saved atomically. Retries
after a successful import reuse the saved outcome. Existing reservations are not overwritten. Duplicate matching
uses source, confirmation, title, kind and start/end to preserve separate legs.
Different wording or missing references can still require manual duplicate cleanup.
No outbound emails are sent; check Plan/history for results. Postmark's delivery
log exposes rejected payloads or transient failures for the site operator.

## Receipt photos

Expenses → Log expense → Upload receipt photo. The photo is attached and AI suggests
merchant, total, currency and date. Review these and select payer/split before
saving. Existing equal, shares and exact splits feed balances and settlement.
Without a model or after a read failure, the photo still attaches and manual entry
works. Upload from the expense editor to attach a receipt to an existing expense.
The older Add screenshot flow remains a quick booking/expense reader; use the
expense form when the original receipt image needs to be retained.

Photos are decoded/re-encoded as JPEG, metadata stripped, capped at 600 KB, and
stored outside trip JSON in durable Redis documents. Only trip members can fetch
them; viewing links exclude expenses and receipt references. The service worker
never caches these private API responses. Crop sensitive payment details before
uploading. Identical normalized images reuse a stored photo and show a duplicate
warning. An uploaded photo expires after seven days unless an expense is saved
with it. Saving the expense keeps the photo for as long as any expense on that
trip references it. After the last reference is removed, the photo remains
available for undo for 30 days. Reattaching it during this period keeps it again.

## Offline

The existing service worker and local trip snapshot retain booking fields on a
previously opened trip. Load the trip on each device while connected before travel.
Plan → Save bookings offline also downloads a standalone HTML document containing
all reservation details, with no scripts or remote assets. Open it in Files /
Downloads without a connection, or print it. It is a private snapshot and must be
saved again after changes. Receipts, email imports and AI scanning need a connection.

## Checks

`npm run typecheck`, `npm run lint`, `npm test`, and
`npx playwright test e2e/booking-imports.spec.ts` (mock AI, no external services).
Actual Postmark delivery and Gemini extraction need deployment credentials and a
real confirmation/receipt smoke test after deployment.
