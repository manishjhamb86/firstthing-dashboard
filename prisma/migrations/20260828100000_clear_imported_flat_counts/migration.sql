-- Light counts were imported into the flats column.
--
-- Every society whose documents have since been read carries a flat_count
-- exactly equal to a light count on one of its own circuits — six for six,
-- which is not coincidence. Ace City's 2,508 is its first invoice's own
-- "Number of lights"; Arihant Arden's 750 is its agreement's contracted
-- minimum; Aditya Urban Casa's 736 is its basement circuit's represented
-- count, not the society's total of 1,889. Amrapali Princely Estate's was
-- cleared already, the user confirming the real figure is not available.
--
-- So these are wrong, not merely unverified, and this repo states a gap
-- rather than carrying a number nobody trusts — which is why flat_count is
-- nullable. Cleared with the user's agreement (2026-08-28).
--
-- Each is guarded on its own wrong value: if someone has since entered a real
-- figure, or a circuit's represented count has been corrected, this must not
-- reach it. The 13 societies whose documents have not been read yet are left
-- alone — there is no light count to compare them against, so there is no
-- evidence either way.
UPDATE societies SET flat_count = NULL WHERE name = 'Ace Aspire'        AND flat_count = 1265;
UPDATE societies SET flat_count = NULL WHERE name = 'Ace City'          AND flat_count = 2508;
UPDATE societies SET flat_count = NULL WHERE name = 'Aditya Mega City'  AND flat_count = 605;
UPDATE societies SET flat_count = NULL WHERE name = 'Aditya Urban Casa' AND flat_count = 736;
UPDATE societies SET flat_count = NULL WHERE name = 'Arihant Arden'     AND flat_count = 750;
