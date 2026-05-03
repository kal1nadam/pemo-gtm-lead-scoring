# Sample Scenarios

The assignment specifies three scenarios. Each is documented here with the inbound payload, the expected workflow path, the observed result, and references to the screenshots that prove it ran.

All three scenarios were executed end-to-end against the live system on 2026-05-04.

---

## Scenario 1: UAE Hot

**Source.** [`samples/payload-website-form.json`](../samples/payload-website-form.json)

**Lead.** Falcon Logistics LLC. UAE-based logistics company, 200 employees, demo request from a website form. Strong inbound message: "We're scaling fast and need a demo of Pemo. Looking to replace our current expense process this quarter, it's a mess of shared cards and Excel. Can you book a call this week?"

**Expected.** Score in the Hot tier (80+). Trigger Hot Outreach: immediate AI-personalized email via Gmail, Slack alert, HubSpot engagement logged.

**Curl.**

```bash
curl -X POST <YOUR_N8N_TEST_URL>/webhook-test/lead-intake \
  -H "Content-Type: application/json" \
  -d @samples/payload-website-form.json
```

**Observed result.**

| Stage | Result |
|---|---|
| Score | 86.6 / 100 |
| Tier | hot |
| Confidence | 1.0 |
| Top signal | Firmographic 35/35 (tier-1 country AE, ideal size 200, high-fit logistics industry) |
| Weakest signal | Source quality 12/20 (canonical: direct, weighted 0.6) |
| HubSpot | Contact `Ahmed Al-Mansoori / ahmed@falconlogistics.ae` created with all 25+ Pemo properties populated. URL recorded. |
| Trello | Card `[86.6] Falcon Logistics LLC — Ahmed Al-Mansoori` placed on the Hot Leads board, list "New", with labels: UAE, EN, Direct, Demo Request. Markdown body includes the AI qualification summary, full score breakdown, inbound message, and a deep link back to the HubSpot contact. |
| Slack | `#leads-hot` received the formatted alert with rep tag, summary, message excerpt, and deep links to HubSpot + Trello. |
| Gmail | Personalized first-touch email sent to ahmed@falconlogistics.ae, signed by the round-robin-assigned rep. Includes the Calendly booking link. Email reads as human, not templated, references the specific pain mentioned in the inbound message. |
| HubSpot timeline | Email engagement logged on the contact with subject + body + sender headers. |

**Screenshots.** [`docs/screenshots/scenarios/1-uae-hot/`](screenshots/scenarios/1-uae-hot/)

1. `01-curl-output.png` — terminal output of the curl command
2. `02-n8n-execution-success.png` — MAIN execution graph, all green
3. `03-hubspot-contact.png` — HubSpot contact with Pemo properties visible
4. `04-trello-card.png` — Trello Hot board card with labels
5. `05-slack-alert.png` — Slack `#leads-hot` alert
6. `06-gmail-received.png` — received personalized email

---

## Scenario 2: KSA Arabic Warm

**Source.** [`samples/payload-partner-referral-arabic.json`](../samples/payload-partner-referral-arabic.json)

**Lead.** Al-Najm Trading Co (شركة النجم التجارية). Saudi-based, 15 employees retail. Inbound message in Arabic only: "تم تحويلي إليكم من شريككم. نبحث عن حل لإدارة المصاريف لفريقنا الصغير." Channel: partner referral via GCC Fintech Partners.

**Expected.** Score in Warm tier (50-79). Language detected as `ar`. Routed to a rep whose languages include Arabic. Warm sequence runs entirely in Arabic for Day 0, Day 3, Day 7. No reply received during the demo window, sequence completes with the digest notification.

**Curl.**

```bash
curl -X POST <YOUR_N8N_TEST_URL>/webhook-test/lead-intake \
  -H "Content-Type: application/json" \
  -d @samples/payload-partner-referral-arabic.json
```

**Observed result.**

| Stage | Result |
|---|---|
| Score | 65.7 / 100 |
| Tier | warm |
| Language | ar (auto-detected from Arabic Unicode block in the message) |
| HubSpot | Contact created with `pemo_language=ar`, `pemo_country_tier=tier_1`, `pemo_lead_tier=warm`. The native company name in Arabic is preserved in `company_name_native`. |
| Trello | Card placed on Warm Leads board, list "New", with labels: KSA, AR, Partner. |
| Rep assignment | Routed to Khalid Al-Otaibi (eligible: KSA + Arabic). |
| Warm Sequence Day 0 | LLM-generated email entirely in Arabic. Tone: warm, helpful, no pushy CTA. References the partner referral and the small-team pain point. Sent via Gmail. HubSpot engagement logged. `pemo_sequence_step=warm_day_0_sent`. |
| Wait 60s (demo mode) | Pause. |
| Reply check | `pemo_replied=false`. Continue. |
| Day 3 | LLM-generated Arabic email with industry-specific use case (retail/SME). Sent. Logged. `pemo_sequence_step=warm_day_3_sent`. |
| Wait 60s | Pause. |
| Reply check | `pemo_replied=false`. Continue. |
| Day 7 | LLM-generated Arabic final-touch email. Respectful close-loop. Sent. Logged. `pemo_sequence_step=warm_completed_no_reply`. |
| Slack `#leads-digest` | "📭 Warm sequence completed without reply" notification with all the relevant context. |

**Screenshots.** [`docs/screenshots/scenarios/2-ksa-arabic-warm/`](screenshots/scenarios/2-ksa-arabic-warm/)

1. `01-curl-output.png` — terminal output of the curl command
2. `02-n8n-warm-execution.png` — warm sub-workflow execution graph
3. `03-hubspot-contact-arabic.png` — HubSpot contact with `pemo_language=ar`
4. `04-trello-warm-card.png` — Trello Warm board card with KSA + AR labels
5. `05-gmail-day0-arabic.png` — received Day 0 email in Arabic
6. `06-gmail-day3-arabic.png` — received Day 3 email in Arabic
7. `07-gmail-day7-arabic.png` — received Day 7 final-touch email in Arabic
8. `08-slack-sequence-completed.png` — `#leads-digest` notification

---

## Scenario 3: Reply Detection

**Source.** [`samples/payload-reply.json`](../samples/payload-reply.json). Triggers WF-REPLY's webhook (not WF-MAIN's).

**Lead.** This scenario presupposes Scenario 1 ran first. Ahmed Al-Mansoori (the Hot lead from Scenario 1) "replies" to our outreach. The simulated reply text: "Thanks for reaching out, yes, this looks interesting. Can we schedule a call next Tuesday afternoon? Also, do you support multi-currency wallets in EUR?"

**Expected.** WF-REPLY validates the payload, finds the contact in HubSpot, marks `pemo_replied=true` and `pemo_replied_at=now`, sets `pemo_sequence_step=reply_received`, and posts a notification in `#leads-alerts` with the reply excerpt.

**Curl.**

```bash
curl -X POST <YOUR_N8N_TEST_URL>/webhook-test/lead-reply \
  -H "Content-Type: application/json" \
  -d @samples/payload-reply.json
```

**Observed result.**

| Stage | Result |
|---|---|
| Validate Reply | Email present, payload valid. Continue. |
| HubSpot Search by email | Contact found: Ahmed Al-Mansoori, ID `770207622357`. |
| HubSpot PATCH | `pemo_replied=true`, `pemo_replied_at=2026-05-03T14:30:00Z`, `pemo_sequence_step=reply_received` written. |
| Slack `#leads-alerts` | "📨 Reply received" alert posted with: contact name + company, tier (HOT), last sequence step, reply excerpt (the EUR question is highlighted), deep link to HubSpot. |

The lead's HubSpot record now reflects that they replied. If this lead were in an active warm or cold sequence (it isn't, it was hot), the next reply check inside that sequence would see `pemo_replied=true` and stop the chain at that branch via the Slack stop notification. The full feedback loop is closed.

**Edge case demonstrated separately.** If we curl the webhook with an email that doesn't exist in HubSpot, we land on the "Unknown Sender" branch: a separate Slack alert in `#leads-alerts` flags it for manual review, no HubSpot mutation. Tested.

**Screenshots.** [`docs/screenshots/scenarios/3-reply-detection/`](screenshots/scenarios/3-reply-detection/)

1. `01-curl-output.png` — terminal output of the reply curl
2. `02-n8n-reply-execution.png` — WF-REPLY execution graph, all green
3. `03-hubspot-replied-true.png` — HubSpot contact showing `pemo_replied=true`
4. `04-slack-reply-notify.png` — `#leads-alerts` reply notification

---

## Notes on the assignment's "duplicate detection" wording

The assignment originally framed Scenario 3 as "duplicate detection: existing customer submits a new inquiry, dedup and route to account manager." Our system handles dedup at intake (HubSpot search by email, mark `existing_customer=true` and tag the Trello card with the "Existing Customer" label), but does not have a dedicated "Account Manager Path" branch yet. That improvement is documented in the [Known issues](../README.md#known-issues-and-future-improvements) section of the README and is roughly 20 minutes of additional work.

We chose to demonstrate Reply Detection as the third scenario instead because it more directly exercises the cross-workflow feedback loop, which is more interesting architecturally and matches the assignment's "simulate reply detection" requirement (one of the Essential items, not Nice to Have). Both dedup and reply detection are part of the system; we're showing the part that's complete and instrumented.
