# Zoho Invoice → Invoice intake

2026-09-30. User-asked: "fetch invoices info from our Zoho account, download invoice PDF, and some other features later".

## Decisions (the user's)

- **Product:** Zoho **Invoice** (not Books), India data centre (`invoice.zoho.in`), organisation `60070829320`.
- **Use:** a fetched invoice goes into **Invoice intake** with its lines, totals, dates and payment status already filled in, and its PDF attached. It still goes through the same review, submit and release. There is no PDF upload and no document read, so the reader's 20-a-day free limit no longer applies to these.
- **Cadence:** a **Fetch from Zoho** button on Invoice intake, plus an automatic fetch every 6 hours (`zoho_invoice_sync` job).

## What Zoho's documentation settles (zoho.com/invoice/api/v3)

- One API root per data centre: `https://www.zohoapis.in/invoice/v3` and `https://accounts.zoho.in`.
- **OAuth2.** A Self Client (api-console.zoho.in) suits one company's own account. Its grant code is single-use and short-lived, and is exchanged once for a refresh token, which lasts until it is revoked. Access tokens last one hour.
- **Headers.** Every call sends `Authorization: Zoho-oauthtoken …` and `X-com-zoho-invoice-organizationid`.
- **Endpoints:**
  - `GET /organizations` (scope `ZohoInvoice.settings.READ`);
  - `GET /invoices` (200 per page, `page_context.has_more_page`, `date_start`);
  - `GET /invoices/{id}`, which with `accept=pdf` returns the invoice's PDF.
- **Limits:** 100 requests a minute per organisation, 1,000 a day on the free plan. Calls are spaced 700 ms apart. The button fetches up to 25 new invoices; a 6-hourly pass fetches up to 100. The rest wait for the next pass.

## Rules

- **Read only by construction** (`src/lib/zoho-invoice.ts`). The client knows the token endpoint, the organisation list, and reading an invoice. It has no write call, and the scopes are READ only (`ZohoInvoice.invoices.READ,ZohoInvoice.settings.READ`).
- **Save-and-test.** Nothing is stored until Zoho accepts the credentials and lists the named organisation. The secret and the refresh token are write-only. Connecting is an operations act.
- **One intake, two ways in.** A Zoho invoice becomes the same `ExtractedInvoice` a PDF read produces (`src/lib/zoho-invoice-map.ts`, pure). It is proposed through the same `storeExtraction` as a PDF read. The society and month are still the operator's to confirm (INV-04). The month is read from a month or period custom field, then the reference number, notes and line descriptions — never from the invoice date. Zoho's payment status is a *proposal* for the paid choice (CON-47 (e)).
- **Which invoices.** Drafts and voids are not fetched.
- **No duplicates:**
  - An invoice number already on record (a submitted month or a retail invoice) is skipped.
  - An intake row uploaded as a PDF with the same number is linked to Zoho, and filled from Zoho if it had not been read yet.
  - A fetched invoice is keyed by its Zoho id (unique).
- **Changes in Zoho** after a fetch are flagged on the row ("Changed in Zoho since it was fetched"). They are never applied over the operator's review silently. "Fetch again from Zoho" on the review page replaces the review, after a confirmation.
- **Bytes before interpretation (CON-30).** The PDF is stored under `Invoices/_intake/` before the row is proposed. A refetch writes a new key, so the earlier copy is never overwritten.

## Setting it up

Settings → Zoho Invoice. Create a Self Client, paste its client id and secret, generate a code with the scopes above, paste the code, and Save and test.

## Not built yet ("other features later")

- payments;
- customers;
- credit notes;
- anything written back to Zoho.
