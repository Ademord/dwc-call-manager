# Prototype demo walkthrough

Open `demo/dist/index.html` in Edge/Chrome, or start the local app from the README. The portable file resets on reload; the local app saves confirmed changes in SQLite. All records and identities are synthetic.

## Guided journey

1. Select **Tour starten**. This resets synthetic changes to the fixed baseline.
2. DEMO-011's existing event is replayed. It is already one of the 12 calls and does not increase the total.
3. The tour opens the real form, selects Problem DWC, Tuma Classic / Comfort, Entkalkung / Filterwechsel and Service angefordert.
4. The actual submission handler commits one revision. The summary uses returned values; no external service order is created.
5. The tour closes the summary and switches the synthetic role to Manager. The report shows 12 calls, 11 evaluated and 1 pending; reason counts are 4 / 3 / 3 / 1.

Tour controls remain accessible inside an active modal. The active control stays bright while surrounding regions darken. An anchored card shows the step and explanation. **Tempo** selects 1.3, 2.6 or 6 seconds between automatic actions; waiting for real responses can take longer. Pause stops later actions while an accepted save may settle. Backgrounding the page also pauses it, including during reset. A real click/key inside the business interface pauses the tour. Resume preserves your choices; if an earlier required field was cleared, it asks you to complete the form rather than replacing that choice. **Beenden** (accessible name: Tour überspringen) keeps the draft and committed data. Reset restores the baseline and is disabled while a form command is in flight.

Closing the guided call, navigating or switching roles during a pause may require manual completion or restart. Resume explains this instead of switching the view back. A late call response cannot reopen the form after Pause or Beenden. Report completion waits for the applied range's confirmed response.

Tab/Shift+Tab navigate the target, relevant help and tour controls. While the call tour is paused, the whole active form remains reachable for corrections. Escape closes an open hint first; otherwise it dismisses the tour and restores visible focus to a useful control. An additional Escape closes the call form when no command is pending. Reduced-motion settings disable transitions.

## Explore the report at your own pace

1. In the Manager dashboard, select **Bericht erkunden**. This keeps your current records and report range.
2. The actual plotted lines are highlighted. Select **Filter zeigen**.
3. Change Von/Bis and choose the real **Anwenden** button. The card shows the returned range and counts; typed dates alone do not change them. Try 4 September 2026: the baseline contains three calls that day. **Demo-Zeitraum** restores all twelve.
4. Select **Zum Export**, then the highlighted **CSV exportieren** button. No download starts automatically. Success is shown only after the export response is handed to the browser. The CSV contains the displayed snapshot's actual IDs, dates, reasons and pending rows.
5. Close the completed tour. Navigation or a role change also dismisses report guidance. A failed export stays retryable; an older export finishing after a different report was applied cannot falsely complete the new report's walkthrough.

Use the **i** buttons beside Hauptgrund, DWC-Details, Zeitraum, Zeitverlauf and CSV for short hover/focus/tap explanations. Hints remain open while the pointer moves into them; tap again, move focus away or press Escape to dismiss.

## Manual exploration

- Open DEMO-011 or DEMO-012 in **Arbeitsplatz**. Normal reasons need a selection and Speichern; DWC needs three details. Unbekannt/Unklar are valid answers.
- **Später** leaves a call pending. Confirmed drafts restore on reopening; the local app also restores them after browser/service restart.
- **Demo-Anruf beenden** creates a genuinely new synthetic call. New arrivals do not replace an active form.
- In **Anrufauswertungen**, inspect a saved call and submit a correction. The previous result stays in reports until the replacement commits.
- Manager mode offers reporting and assignment. The default fixture has one active synthetic agent; tests separately exercise multiple-agent ownership.
- Enter Von/Bis and select **Anwenden**. Both dates are inclusive in the UI; the service uses an exclusive next-date boundary in Europe/Zurich. **Demo-Zeitraum** restores the fixture interval.
- CSV uses the displayed report snapshot, including pending rows. A later correction does not alter it. After five minutes or a session change, reload before exporting.

## Failure demonstrations

In **Demo & Daten**, choose a one-shot failure for the next submission. A failure before storage does not commit; a lost response after storage commits without acknowledgement. Both keep the original envelope. **Erneut versuchen** reuses its key, body and version and does not duplicate the revision.

An uncertain submit cannot be silently replaced by a new request. A confirmed version conflict retains inputs and requires explicit review. Drafts have a separate retry action; if a newer writer changed the call after the original draft committed, the UI reports that conflict before another save.

The portable page deliberately uses memory, not browser localStorage or IndexedDB. It loses edits on reload; the local server preserves acknowledged state. Neither synthetic role selection nor successful local testing establishes company authentication or telephony integration.
