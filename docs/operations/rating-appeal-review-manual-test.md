# Rating review acceptance

Owner applied `20261013000100_rating_appeal_review.sql` and pushed `5d1a5c3`.
The follow-up integrating reviews into completed-trip cards requires only a hosted UI release,
with no additional migration or native rebuild. For initial installation in another environment:

    corepack pnpm exec supabase db push --dry-run

Confirm only `20261013000100_rating_appeal_review.sql` before the real push. Old appeal foundation is
reused, not recreated. Share-link migration 20261012000100 is owner-applied. Commit/push explicit
feature files and confirm Rider, Driver, Admin and Transportation Ready. No APK/IPA, new credential
or notification configuration is needed. Use identifiable tests and restore unfinished bookings/
Driver Offline; no production payment or ride is created by local checks.

1. In Rider Trips → Show history, find a completed trip. In Driver, use menu → Recent orders.
   The participant, own score, received score and review belong to the same trip card.
   Request rating review appears beside the received score, not your own rating. Before disclosure,
   the card explains that no received rating is available; no review action is offered.
2. Open Request rating review, enter 10–1000 characters and submit. Under review replaces the form. Reopen/
   refresh: the existing request persists and cannot be submitted twice. Network failure must retain
   the reason and permit a safe retry. Initial list failure must not falsely offer an enabled form.
3. Transportation → Reputation → Rating reviews: find the test request. Review the score/comment and
   reason. Explicitly choose Keep rating or Remove rating, explain the decision, and save. Failed saves
   preserve the explanation. Repeating the same committed decision is safe; a different later decision
   cannot overwrite it. Use All reviews to see resolved requests.
4. Requester refreshes rating reviews: Rating kept/Rating removed and the Admin explanation appear.
   Removed received score/comment disappears while decision history and own submitted score remain.
   No new notification is sent by this feature; checking Ratings is the current delivery contract.
5. Verify both Rider and Driver, another account/tenant and inactive access. Opposite participants
   must not read each other's appeals. Ordinary ratings, reminders, messages, booking and payments
   remain unchanged. Check 414 × 896, 320px, short keyboard viewport and accessible controls.

Local checks:

    node tooling/scripts/rating-appeals-sql-check.cjs
    node tooling/scripts/trip-support-preview.cjs --ratings

SQL uses a disposable minimal PGlite database; browser checks mock identity/business data. Real-account
RLS, physical keyboards and production Supabase/concurrency acceptance remain owner responsibilities.
