# Reputation Appeals V2 production test

Use one completed trip whose Rider and Driver ratings are already disclosed because both sides
submitted. Do not use personal information in appeal or resolution notes.

1. Open Rider **My trips** and locate the completed trip under **Post-trip ratings**.
2. Confirm **Appeal received rating** appears only beside the disclosed Driver rating. Submit a
   clearly labeled test reason of at least 10 characters.
3. Confirm the Rider card now shows the appeal as `submitted`, its reason, and no second appeal
   button.
4. In Admin **Reputation**, confirm the appeal identifies the correct trip and appellant role but
   does not expose cross-tenant data.
5. Choose **Uphold rating**, enter resolution notes of at least five characters, and refresh Rider.
   Confirm the appeal shows `upheld`, the notes are visible, and the received rating remains.
6. For a different disclosed received rating, repeat submission from Driver **Reputation**.
7. In Admin resolve that appeal with **Remove rating** and required notes.
8. Refresh Driver. Confirm the appeal shows `removed` and its resolution while the received Rider
   rating is no longer disclosed. Confirm the submitter's original rating record remains in Admin
   as hidden rather than being deleted.
9. Attempt a duplicate appeal, an appeal against an undisclosed rating, and a resolution without
   notes. Each must be rejected without changing rating or appeal state.
10. Review tenant audit history for `reputation.rating_appealed` and
    `reputation.rating_appeal_resolved` events tied to the correct tenant and records.

Pass requires role-derived trip ownership, delayed-disclosure enforcement, one appeal per received
rating, required bounded reasons and resolution notes, tenant-scoped Admin review, immutable source
ratings, audited resolution, and Rider/Driver visibility of the decision.
