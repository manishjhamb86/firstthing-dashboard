# Change requests with admin approval (maker-checker / four-eyes) for recorded dates

Scope: how systems let staff request a correction to an already-recorded date (or other field), have an administrator accept or reject it before it takes effect, show the pending request on the record, and keep an audit trail. Also covers the pre-go-live "edit directly" mode and the switch to "request and approve". Research done 2026-09-28; 18 tool calls. Primary vendor docs were used where reachable. Several vendor pages returned only search-snippet summaries, and this is flagged where it applies.

## 1. How banking, ERP and service-management systems implement maker-checker, and what states a request goes through

### Takeaway
Every mature system uses the same core idea: a proposed change is held apart from the live record until a second, different person decides on it.
- **SAP MDG** uses a "staging area" vs "active area".
- **FLEXCUBE** uses an "unauthorized" record.
- **Salesforce** locks the record while approval is in flight.

States converge on: draft → pending/in progress → approved | rejected. Two more exit states are common:
- recalled/withdrawn by the requester;
- cancelled / "no longer required", set by the system when the request becomes moot.

Approved and rejected are terminal. They are never reopened.

### Cited Findings

**Oracle FLEXCUBE**
- An unauthorized record can be authorized by anyone other than the maker (authorize rights required).
- The maker can still modify the record (edit rights) before it is authorized.
- When a checker authorizes, the system displays any validations the maker overrode during Save. If an override results in an error, the checker must reject the record.

Sources: [Oracle FLEXCUBE Investor Servicing docs, "Authorize Selected UH Record"](https://docs.oracle.com/en/industries/financial-services/flexcube-investor-servicing/14.7.6.0.0/divis/authorize-selected-uh-record.html) (the rules on who may authorize and modify came through the search snippet across the FLEXCUBE "Authorize … Record" pages; the page fetch itself confirmed only the override-display rule).

**SAP Master Data Governance (MDG)**
- The staging area temporarily stores the working version of master data while it goes through a change request. The active area permanently stores the approved instances.
- After the final approval step, the record is read from staging and written to active ("activation").
- The object is locked while assigned to a change request, until the step configured as the "unlocking step" runs.
- A material to be changed must not already be locked by another change request.
- With parallel change requests, a user sees the snapshot data for locked entities.

Source: [SAP MDG search results incl. SAP Help / SAP Press reading sample](https://s3-eu-west-1.amazonaws.com/gxmedia.galileo-press.de/leseproben/4883/reading_sample_sappress_1835_master_data_governance.pdf); [SAP KBA 3070316 on change-request locks](https://userapps.support.sap.com/sap/support/knowledge/en/3070316).

**SAP change documents (the after-the-fact log)**
- `CDHDR` holds the header: object, change number, user, date/time, transaction.
- `CDPOS` holds, per field, the old value, the new value and a change flag.

Source: [SAP Community on CDHDR/CDPOS](https://community.sap.com/t5/enterprise-resource-planning-blog-posts-by-members/utilizing-standard-cds-views-for-change-document-tables-cdhdr-cdpos/ba-p/13573692).

**Salesforce Classic Approval Processes**
- In-flight approvals lock the record. A locked record can't be resubmitted: someone must approve or reject it, the submitter must recall it, or an admin must unlock it (if the step allows) — [Medium, S. Peng](https://medium.com/@shirley_peng/stuck-approvals-in-salesforce-a-fast-troubleshooting-playbook-6cf8639aef62).
- Submitters can be allowed to recall a request. The "Recall Approval Request" button appears in the Approval History related list; if submitter recall is not enabled, only admins see it — [Salesforce Help: Withdraw an approval request](https://help.salesforce.com/apex/HTViewHelpDoc?id=approvals_recall_actions.htm&language=en_US).
- A "Record Editability" setting chooses who may edit a locked record: admins only, or admins plus the current approver — [Salesforce Help: Specify who can edit locked records](https://help.salesforce.com/s/articleView?id=platform.approvals_create_recordeditability.htm&language=en_US&type=5).
- Changing that setting applies only to records submitted afterwards. Records already pending keep the old rules, and the fix is to recall and resubmit — [Salesforce KB 000213116](https://help.salesforce.com/s/articleView?id=000213116&language=en_US&type=1).

**Salesforce Flow Approvals (the newer engine)**
- Submission statuses include In Progress, Approved, Rejected and Recalled. Only in-progress submissions can be recalled or cancelled.
- Recall cancels the in-progress stage and its open work items.

Sources: [Salesforce Help: Manage approval submissions](https://help.salesforce.com/s/articleView?id=platform.automate_automated_approvals_manage.htm&language=en_US&type=5); [Recall Approval Submission action](https://help.salesforce.com/s/articleView?id=platform.core_actions_recall_approval_submission.htm&language=en_US&type=5). The detail that final rejection unlocks and sets Status=Rejected, and that recall unlocks and returns the record to Draft, came from a secondary source ([Medium, S. Peng](https://medium.com/@shirley_peng/approval-processes-in-salesforce-same-actions-different-moments-95247fad6855)) and is a typical configuration rather than a fixed behaviour.

**ServiceNow approvals (`sysapproval_approver`)**
- States: requested, approved, rejected, no longer required, cancelled.
- Once a terminal state (approved/rejected) is reached, it should never be moved back to requested.
- An out-of-box business rule, "Moot Approvals Upon Cancellation", sets approvals to "No longer required" when the parent record becomes inactive.

Source: [ServiceNow Community threads](https://www.servicenow.com/community/developer-forum/restrict-state-field-on-the-sysapproval-approver-table-for/m-p/3124441), [(moot approvals)](https://www.servicenow.com/community/itsm-forum/approvals-are-going-to-no-longer-required-state/m-p/3001608). This is community, not official docs.

**Workday**
- An approval step lets the assignee approve, send back, or deny, depending on configuration.
- Send-back can return the request to a prior step, where the initiator revises the data and resubmits. A subprocess sent back gets status "Revised" — [Workday Admin Guide: Concept: Approval Step](https://doc.workday.com/admin-guide/en-us/manage-workday/business-processes/business-process-step-types/dan1370797855296.html).
- "Correct", "Cancel" and "Rescind" are separate after-the-fact tasks. Rescind cancels a completed process. These tasks do not route to other roles for approval — [TAMUS Workday job aid](https://it.tamus.edu/workdayservices/training/job_aid/correct-cancel-and-rescind/); [UT Austin rescind guidance](https://workday.utexas.edu/support/rescind-guidance).
- Correcting a completed event is recommended over rescinding it, because rescinding forces all the data to be re-entered.

**Jira Service Management**
- An approval step can exclude people in named fields (Reporter, Assignee) from approving.
- This shipped in 2022 as the fix for JSDCLOUD-6249, "requester approved their own request".
- The exclusion blocks the decision, not the selection: an excluded person can still be listed as an approver but cannot act.

Sources: [Atlassian Community article](https://community.atlassian.com/forums/App-Central-articles/Who-Can-Approve-in-JSM-Restricting-and-Mapping-Approvers-Company/ba-p/3272822); [Atlassian docs: Configuring JSM approvals](https://confluence.atlassian.com/adminjiraserver/configuring-jira-service-management-approvals-938847527.html).

### Inferences
- A workable state set for a FirsThing date-change request, taken from the union of the above:
  - `pending`
  - `approved` — applied
  - `rejected` — with the approver's note
  - `withdrawn` — requester recall, Salesforce "Recall"
  - `superseded` / `no_longer_needed` — system-set when the record changed underneath or the parent was voided; ServiceNow's "no longer required"
- "Send back for changes" (Workday) is optional. It can be modelled as a reject with a note plus a fresh request.
- An `expired` state appears in none of the sources as a standard. It would be a local design choice.
- The Salesforce and SAP MDG pattern — the live value stays in force while the request is pending, and is written only at approval ("activation") — fits FirsThing's existing ADR-005 "versioned, not mutated" and ChangeLog conventions. The request row is the staging copy.
- FLEXCUBE shows overrides to the checker. By analogy, the approver should see every validation warning the requester acknowledged.

### Gaps
- Official Oracle FLEXCUBE documentation of the old-vs-new comparison shown to the checker was not found. Only the override display is confirmed.
- ServiceNow states come from community threads, not the product docs.
- No source found a standard "expired" state or a time-to-live on pending requests.

## 2. Rules commonly enforced: no self-approval, reason required, side-by-side review, stale-request detection, one pending request vs many, bulk

### Takeaway
- **No self-approval** is universal and should be enforced in the decision action, not only in who is listed. FLEXCUBE ("anyone other than the maker"), JSM (excluded approvers) and ISO 27001 A.5.3 all require it.
- **Stale requests.** Systems either lock the record while a request is open (SAP MDG, Salesforce), or invalidate the approval when the underlying data changes (GitHub's "dismiss stale approvals").
- **A reason is required** for changes to regulated data (EU GMP Annex 11 §9).

### Cited Findings
- **ISO 27001:2022 Annex A 5.3 (segregation of duties).** Controls should ensure no single person can both initiate and complete a high-risk action without independent oversight. Requester, approver and implementer should be different people, and systems should block a user from approving their own change request — [ISMS.online on A.5.3](https://www.isms.online/iso-27001/annex-a-2022/5-3-segregation-of-duties-2022/); [High Table on A.5.3](https://hightable.io/iso-27001-annex-a-5-3-segregation-of-duties/). These are secondary explanations; the standard text itself is paywalled.
- **Reason required.** EU GMP Annex 11 §9: "For change or deletion of GMP-relevant data the reason should be documented". Commentary says systems should at minimum provide a free-text reason entry when a change is made — [EC Annex 11 PDF](https://health.ec.europa.eu/system/files/2016-11/annex11_01-2011_en_0.pdf); [LCGC: Can you meet the technical requirements of Annex 11](https://www.chromatographyonline.com/view/can-you-meet-technical-requirements-annex-11).
- **Stale detection, lock model.** SAP MDG locks the object for the life of the change request and refuses a second change request on a locked object — [SAP KBA 3070316](https://userapps.support.sap.com/sap/support/knowledge/en/3070316). Salesforce locks the record, and a locked record can't be resubmitted — [Medium, S. Peng](https://medium.com/@shirley_peng/stuck-approvals-in-salesforce-a-fast-troubleshooting-playbook-6cf8639aef62).
- **Stale detection, invalidate model.** GitHub records the state of the diff at the moment of approval. "Dismiss stale pull request approvals when new commits are pushed" invalidates approvals when the reviewed content changes, and the change cannot merge until someone approves again — [GitHub Docs: About protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches).
- **Most-recent-change approval.** GitHub's related rule, "require approval of the most recent reviewable push", requires that approval come from someone other than the person who pushed last. This was added in 2023 as a security enhancement — [GitHub Changelog 2023-06-06](https://github.blog/changelog/2023-06-06-security-enhancements-to-required-approvals-on-pull-requests/).
- **Pending requests follow the rules they were submitted under.** In Salesforce, a pending request keeps the process settings that were in force at submission. Fixing it requires recall and resubmit — [Salesforce KB 000213116](https://help.salesforce.com/s/articleView?id=000213116&language=en_US&type=1).
- **Bulk.** Workday allows mass rescind, correct, cancel and approve — [Workday search result / UT Austin BP services](https://workday.utexas.edu/askus/bp-services).

### Inferences
- **One pending request per field (date).** This is the SAP MDG lock model, and it is the simpler choice for FirsThing. A second request for the same date should be refused and should name the open one. This matches the codebase's "refuse, don't flag" rule for duplicates.
- **Stale detection** should store the value the requester saw (`oldValue`). At approval, compare it with the current value; if they differ, move the request to `superseded` rather than apply it. This is the GitHub "state at approval time" idea applied to one field, and it catches direct edits made in demo mode or by operations while the request was open.
- **Self-approval refusal** should be checked server-side at the approve action and logged (JSM: "blocks the decision, not the selection"). This matches the repo's rule that a hidden button proves nothing.
- **Reason field:**
  - the request needs a mandatory reason from the requester;
  - a rejection needs a mandatory note from the approver;
  - an approval note is optional.
- **Bulk approval** should re-validate each row individually. This mirrors the repo's existing batch patterns: `releaseRoutineBatch`, `submitReadyBatch`.

### Gaps
- No primary source found for a documented "side-by-side old/new/reason" layout requirement in FLEXCUBE, Salesforce or Workday. The convention is inferred from SAP CDPOS (old/new) plus the Annex 11 reason requirement.
- SOX-specific control text was not retrieved. SOX 404 obligations are typically met through ITGC change-management controls, but no citable primary text was gathered here.

## 3. UI patterns: pending badge on the field, diff view, approvals inbox, notifications, comments, history

### Takeaway
The recurring UI pieces are:
- an **approvals inbox**: SAP Fiori "My Inbox", Workday Inbox, Salesforce's Items to Approve / Approval Submissions list;
- an **approval history list on the record itself**: Salesforce's Approval History related list;
- a **field-level change log with old and new values**: SAP change documents;
- **comments** on approve/reject.

No authoritative UX-research source (NN/g, Smashing) specifically on maker-checker UI was found.

### Cited Findings
- **SAP Fiori "My Inbox"** is the successor to "Approve Requests". The approver is notified, sees the task with all relevant data, can add comments, and approves or rejects from mobile or desktop. The business document then updates automatically — [SAP Community: Fiori My Inbox](https://community.sap.com/t5/technology-blog-posts-by-members/fiori-my-inbox-approve-requests-unified-inbox/ba-p/13285425); [SAP Help: Fiori 2.0 for request approvals](https://help.sap.com/docs/SAP_FIORI/d2c296c4f32d4f2a9e3752f58d5ef222/15d41b54e3baa37ee10000000a44176d.html).
- **Salesforce Approval History** is a related list on the record page. It shows the request status and the workflow, and holds the Recall button — [Salesforce Help: withdraw a request](https://help.salesforce.com/apex/HTViewHelpDoc?id=approvals_recall_actions.htm&language=en_US).
- **Salesforce Flow Approvals** add an Approval Submissions list view for recalling and cancelling — [Salesforce Help: manage approval submissions](https://help.salesforce.com/s/articleView?id=platform.automate_automated_approvals_manage.htm&language=en_US&type=5).
- **Workday** shows a custom revision page in the worker's Inbox when a step is sent back, where the worker revises the data and resubmits — [Workday Admin Guide: approval step](https://doc.workday.com/admin-guide/en-us/manage-workday/business-processes/business-process-step-types/dan1370797855296.html).
- **SAP MDG parallel change requests.** Users see the snapshot data for locked entities, so the UI distinguishes the locked, in-flight record from its active version — [SAP MDG sources](https://s3-eu-west-1.amazonaws.com/gxmedia.galileo-press.de/leseproben/4883/reading_sample_sappress_1835_master_data_governance.pdf).

### Inferences (design proposals for FirsThing, grounded in the above plus the repo's own conventions)

**On the timeline row**
- Keep showing the **recorded** date. The live value stays in force until approval, as with SAP's active area.
- Add a small "Change requested → DD-MM-YYYY" chip (warn tone) naming the requester, with a link to the request.
- A row with an open request offers no second "Request a change". It says one is open.

**Approvals queue** (admin; one inbox; slotted into the existing notifications feed as a derived source)
- Each row shows record · field · **old → new** · reason · requester · requested-at · Approve / Reject (reject needs a note).
- Stale rows (the current value no longer equals the requested-from value) show "Recorded date changed since this was asked — can no longer be applied" and offer only "Close".

**Requester's view:** "My requests", showing pending, approved and rejected with the approver's note, plus Withdraw while pending (Salesforce recall).

**History:** after a decision, the record's change history shows both the request and the decision: requested by X on D1 (reason), approved or rejected by Y on D2 (note), old → new. SAP CDHDR/CDPOS map onto FirsThing's `ChangeLog` rows.

**Notifications:** the requester is notified of the decision, and approvers are notified of new requests. This fits the existing notification centre's "derived from rows of record, no shadow table" rule.

### Gaps
- No NN/g, Smashing Magazine or design-system (Carbon, Atlassian, Polaris) pattern page on approval or pending-change UI was retrieved within the call budget. The UI guidance above relies on vendor product behaviour, not UX research.
- No source was found describing a field-level "pending change" badge as a named pattern. It is a design inference.

## 4. Audit-trail requirements that apply to editing recorded dates

### Takeaway
Regulators converge on who, what, when and old/new value, a trail that cannot be disabled or altered, and (EU GMP) why. India's rule for accounting software applies from 1 April 2023 and requires an edit log of every change with its date, which cannot be disabled, with records kept for 8 years.

FirsThing's lifecycle dates (contract term start, certificate/billing start) feed invoices. Those are arguably books-of-account-adjacent, so the Indian rule is the relevant benchmark.

### Cited Findings
- **21 CFR 11.10(e):** "Use of secure, computer-generated, time-stamped audit trails to independently record the date and time of operator entries and actions that create, modify, or delete electronic records." The provision (full text, beyond this quote) also requires that record changes not obscure previously recorded information, and that the trail be retained.
- **21 CFR 11.10(f):** "operational system checks to enforce permitted sequencing of steps and events."
- **21 CFR 11.10(g):** "authority checks to ensure that only authorized individuals can … alter a record."

  Source for all three: [21 CFR 11.10 via Cornell LII](https://www.law.cornell.edu/cfr/text/21/11.10). Only (e), (f) and (g) were quoted verbatim in the fetch; the "not obscure previously recorded information" clause of (e) comes from general knowledge of the regulation and was not re-verified in this session.
- **EU GMP Annex 11 §9:** an audit trail of GMP-relevant changes and deletions; "the reason should be documented"; audit trails must be available in intelligible form and regularly reviewed — [EC Annex 11](https://health.ec.europa.eu/system/files/2016-11/annex11_01-2011_en_0.pdf).
- **India, Rule 3(1) Companies (Accounts) Rules, 2014.** Text: every company using accounting software "shall use only such accounting software which has a feature of recording audit trail of each and every transaction, creating an edit log of each change made in books of account along with the date when such changes were made and ensuring that the audit trail cannot be disabled" — [ca2013.com, Rule 3](https://ca2013.com/rule-3-companies-accounts-rules2014/).
  - **Effective date, a conflict to note.** That page shows the original "financial year commencing on or after 1 April 2021". Other sources state it was deferred and applies from **1 April 2023** — [Tally Solutions](https://tallysolutions.com/accounting/key-requirements-of-audit-trail-rule-issued-by-mca/); [Vishnu Daya & Co](https://vishnudaya.com/mca-mandates-companies-to-use-accounting-software-with-audit-trail-which-cannot-be-disabled/). The 2023 date is the operative one; the ca2013 page reflects the original notification text.
- **ICAI Implementation Guide on reporting of audit trail.**
  - The edit log should capture what data changed, when (timestamp) and who (user ID).
  - The auditor reports whether the audit-trail feature operated throughout the year for all transactions and was not tampered with.
  - Records must be preserved for at least **8 years**.

  Sources: [ICAI Implementation Guide (EIRC copy, revised 2024)](https://eirc-icai.org/uploads/background_materials/Revised%202024_Implementation%20Guide%20on%20Reporting%20of%20Audit%20Trail%20(1)_1712114860.pdf); [TaxScan summary](https://www.taxscan.in/icai-issues-implementation-guide-on-reporting-of-audit-trail/265954). The details come from the search-snippet summary; the PDF itself was not fetched in full.
- **ICH E6(R3) (adopted by FDA 2025).** Audit trails may not be disabled, and audit-trail review should be a planned, documented activity — [IntuitionLabs summary of E6(R3)](https://intuitionlabs.ai/articles/ich-e6-r3-gcp-guidelines-2025); [FDA E6(R3) guidance PDF](https://www.fda.gov/media/169090/download). This is a secondary summary; GCP is not directly applicable to FirsThing but indicates the direction of regulators.
- **SAP's reference implementation:** per field, old value, new value, user, date/time, transaction (CDHDR/CDPOS) — [SAP Community](https://community.sap.com/t5/enterprise-resource-planning-blog-posts-by-members/utilizing-standard-cds-views-for-change-document-tables-cdhdr-cdpos/ba-p/13573692).

### Inferences
- **The minimum audit record for a date change** is record id, field, old value, new value, reason, requested-by/at, decided-by/at, decision note, and applied-at.
  - The request table plus a `ChangeLog` row written at application meets all four regimes above.
  - Direct edits (demo mode, or operations with a reason) should write the same `ChangeLog` shape, so the trail is uniform whichever path made the change.
- **"Cannot be disabled"** (MCA) implies:
  - the log must not be switchable off in demo mode or any other mode;
  - log rows must never be updated or deleted by the app.

  **Caution:** FirsThing's recent "demo mode delete completely" purges ChangeLog lines for a demo. That is acceptable only because it happens before go-live. It must not survive into the live mode for anything touching billing.
- **Two separate log events.** 21 CFR 11.10(f) ("permitted sequencing") and (g) ("authority checks") map onto two things: ordering validation (e.g. `refuseInstallationDates`) and approver-role checks. Both refusals should be logged.

### Gaps
- SOX primary text or PCAOB guidance on change controls was not retrieved.
- Whether FirsThing's operational dates legally fall under "books of account" for Rule 3(1) is a legal question. It is not answerable from these sources.

## 5. Validating the requested date: at submission vs at approval; and moving from "edit freely" to "request and approve"

### Takeaway
Validate twice:
1. **At submission**, reject impossible values (ordering, future dates) so bad requests never reach an approver.
2. **At approval**, re-check against current data, because the record may have moved. FLEXCUBE re-surfaces the maker's overrides to the checker; GitHub and SAP invalidate or block on changed underlying state.

For the switch from free editing to approval, the closest documented analogue is GitHub rulesets:
- **Evaluate** mode: rules are logged but not enforced;
- **Active** mode: rules are enforced;
- a **bypass list**, whose members can approve bypass requests.

### Cited Findings
- **FLEXCUBE** validates at the maker's Save (overrides allowed) and shows those overrides to the checker, who must reject if an override leads to an error — [Oracle FLEXCUBE docs](https://docs.oracle.com/en/industries/financial-services/flexcube-investor-servicing/14.7.6.0.0/divis/authorize-selected-uh-record.html).
- **SAP MDG** checks at change-request creation that the object exists in the active area and is not locked by another change request — [SAP MDG sources](https://userapps.support.sap.com/sap/support/knowledge/en/3070316).
- **GitHub** invalidates approvals when the reviewed state changes (see §2) — [GitHub Docs](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches).
- **GitHub rulesets:**
  - enforcement status is Active (enforced), Evaluate (not enforced; "Rule Insights" shows what would have passed or failed) or Disabled;
  - a bypass list can grant roles or teams permission to bypass and to approve bypass requests;
  - a designated bypass team gives "break-glass" intervention.

  Source: [GitHub Docs: Creating rulesets](https://docs.github.com/en/enterprise-cloud@latest/organizations/managing-organization-settings/creating-rulesets-for-repositories-in-your-organization).
- **Workday** "Correct", "Cancel" and "Rescind" are privileged tasks that do not route for approval — [TAMUS job aid](https://it.tamus.edu/workdayservices/training/job_aid/correct-cancel-and-rescind/). This is an example of an admin-direct-edit path coexisting with approval-routed processes for everyone else.
- **Rule changes are not retroactive to open requests.** In Salesforce, changing approval rules does not affect requests already pending — [Salesforce KB 000213116](https://help.salesforce.com/s/articleView?id=000213116&language=en_US&type=1).

### Inferences

**Submit-time validation.** Run the same pure ordering rules the direct-edit path already uses (e.g. `refuseInstallationDates`, `refuseAgreementDates`) against the proposed state. A request that would be refused as a direct edit is refused as a request, with the same words.

**Approval-time validation.** Re-run the same rules against current data, plus the stale check (`current == oldValue`) and the GATE-02 released-month check. If any fails, the request cannot be applied. It becomes `superseded` or `rejected` with the reason, never partially applied.

**Mode switch** (FirsThing's `DEMO_MODE` / go-live):
- **Pre-go-live (demo mode):** authorised users edit directly. Every edit still writes `ChangeLog`, and a reason is optional. This is analogous to GitHub's Evaluate, since logging never stops.
- **Live:**
  - non-admins get "Request a change";
  - operations keep direct edit with a mandatory reason, as Workday "Correct" and GitHub's bypass list do;
  - self-approval is refused.
- **Requests created in demo mode.** If requests existed before the switch, they should keep the rules they were submitted under, or be explicitly closed as "no longer needed" at the switch (Salesforce precedent).
- **Rehearsal.** An optional "log what would have needed approval" period (GitHub Evaluate) could help before switching, but is likely unnecessary for a small team.

### Gaps
- No source found describing a vendor's migration from open editing to approval-gated editing, beyond GitHub's enforcement statuses.
- Submission-time vs approval-time validation practice in Salesforce and Workday (e.g. whether validation rules re-fire on approval) was not confirmed from primary docs.
