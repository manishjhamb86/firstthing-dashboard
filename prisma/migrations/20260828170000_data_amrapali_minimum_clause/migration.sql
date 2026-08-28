-- Amrapali Princely Estate departed from its minimum-light clause too.
--
-- 2,310 lights went in against an agreed minimum of 3,000, and the clause
-- saying the full charge stays payable below that minimum was not enforced —
-- the charge was scaled to the actual count instead. Its prose note already
-- said so; this adds the named code, so the record is queryable the same way
-- every other society's is.
UPDATE agreements
   SET deviation_note = replace(deviation_note,
        'Departures from the standard: fee-device-charge-plus-share-of-net, report-share-differs-from-agreement.',
        'Departures from the standard: fee-device-charge-plus-share-of-net, report-share-differs-from-agreement, minimum-light-clause-not-enforced.')
 WHERE id = 'bf-amrapali-princely-estate-agreement'
   AND deviation_note NOT LIKE '%minimum-light-clause-not-enforced%';
