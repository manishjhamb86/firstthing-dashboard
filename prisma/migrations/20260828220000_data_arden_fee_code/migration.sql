-- Arihant Arden's fee code was wrong.
--
-- It was recorded as fee-device-charge-plus-share-of-net, which is Amrapali's
-- and Bestech's shape. Arden's agreement sets a flat Rs 14,000/month service
-- charge with Rs 20 per light beyond the contracted 750 — a flat charge, the
-- same shape as The Hyde Park's Rs 32,500. Corrected so the record answers
-- "which societies pay a flat fee" truthfully.
UPDATE agreements
   SET deviation_note = replace(deviation_note,
        'fee-device-charge-plus-share-of-net, report-share-differs-from-agreement',
        'fee-flat-monthly-charge, report-share-differs-from-agreement')
 WHERE id = 'bf-arihant-arden-agreement'
   AND deviation_note LIKE '%fee-device-charge-plus-share-of-net%';
