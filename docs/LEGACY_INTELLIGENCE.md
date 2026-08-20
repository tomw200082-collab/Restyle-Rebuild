# LEGACY_INTELLIGENCE.md
**Restyle — Read-Only Forensic Audit for Rebuild Handover**
Generated: 2026-08-20 · Platform: Base44 · Production domain: `https://restyle.co.il` · All data read-only; nothing was modified.

---

## 0. Executive Summary

- **What it is:** Hebrew, RTL, mobile-first marketplace for premium secondhand furniture in Gush Dan (Tel Aviv metro), operating a **"request-first" model**: buyer submits a purchase request with 2 delivery windows, ops confirms seller by phone, payment collected manually by phone. Zero negotiation, fixed GROSS pricing, managed delivery.
- **Scale:** 17 users (3 admin, 14 user), 25 items (22 approved/published, 3 rejected), 94 orders, 61 delivery windows, 338 email events, 0 disputes, 0 promo subscribers.
- **Maturity: pilot/MVP.** Real traffic is thin; ~72% of orders (68/94) ended in `cancelled_due_to_inactivity`. Exactly **1 completed order** end-to-end (paid via Sumit, payout released).
- **Data spans** Sep 2025 → Feb 2026 (latest item 2026-02-17).
- **Payments:** Sumit (Israeli PSP) via direct API from backend functions with a live `SUMIT_SECRET_KEY`; but the current pilot flow is **manual phone payment** — Sumit functions are mostly dormant. J5 auth/capture endpoints were never confirmed (probe function exists, TODOs remain).
- **Email is sent from the FRONTEND** via Base44 `Core.SendEmail`, through a client-side `HandledMailer` class with inlined HTML templates. "SendGrid template IDs" are vestigial fake strings.
- **The Order state machine in the data does NOT match the schema enum** — 4 live statuses (`window_confirmed`, `awaiting_buyer_window_selection`, `reschedule_loop`, `payment_received`) don't exist in the schema, and `payment_status=held_in_escrow` is set on 88/94 orders even though no money was ever held.
- **No RLS is configured on any entity** — all entities use platform default permissions. Privacy separation (buyer/seller phone hiding) is UI-level only, not enforced at the data layer.
- **Automations:** 4 scheduled; 2 active (escalate stuck orders, auto-cancel stuck orders, both every 30 min), 2 **disabled after 5 consecutive failures** (reservation cleanup, weekly newsletter).
- **Multiple abandoned generations of admin UI** exist; **AdminV2 is the real one** (all system emails deep-link to `/AdminV2?screen=...`).

---

## 1. Entity Schemas

**Security/permissions — applies to ALL entities:** No `rls` key exists in any entity file. Every entity runs on Base44 platform defaults (authenticated users can create/read/update/delete; the built-in User entity restricts listing/updating other users to admins). **There is no row-level isolation anywhere** — any logged-in user could technically read any Order, including other buyers' phone numbers and addresses. The rebuild must add proper access rules.

**Built-in fields actually relied upon by code:** `id` (all joins), `created_date` (timeout math in autoCancel/escalate, sorting everywhere), `updated_date` (reports), `created_by` (Item: used as seller identity — see warts), `created_by_id`.

### 1.1 Item
```json
{
  "name": "Item",
  "required": ["title","description","category","condition","images","exact_address","latitude","longitude","floor","elevator","seller_phone","seller_email","location"],
  "fields": {
    "title": {"type":"string"},
    "description": {"type":"string"},
    "category": {"type":"string"},
    "subcategory": {"type":"string"},
    "style": {"type":"string"},
    "material": {"type":"string"},
    "condition": {"type":"string","enum":["בסדר","טוב","מצב טוב","כמו חדש","מצב מצוין","חדש לגמרי"]},
    "age": {"type":"string"},
    "brand": {"type":"string"},
    "color": {"type":"string"},
    "original_price": {"type":"number"},
    "seller_desired_price": {"type":"number","note":"LEGACY NET price — superseded by pricing.requested_price but still 100% filled"},
    "pricing": {"type":"object","properties":{
      "requested_price":{"type":"number","note":"NET per unit — what seller receives"},
      "display_price":{"type":"number","note":"GROSS per unit — what buyer sees"},
      "platform_fee":{"type":"number","note":"display_price - requested_price"},
      "platform_fee_override":{"type":"number","note":"manual override; 0 = fee-free resale"},
      "calculated_at":{"type":"string","format":"date-time"}}},
    "defects": {"type":"string"},
    "dimensions": {"type":"object","properties":{"width":{},"height":{},"depth":{},"length":{},"cornerWidthCm":{"note":"corner sofas"},"frontWidthCm":{"note":"corner sofas"},"chaiseLength":{"note":"chaise sofas"}}},
    "logistics_tier": {"type":"number","enum":[1,2,3,4,5]},
    "logistics_subtier": {"type":"number"},
    "images": {"type":"array","items":"string"},
    "exact_address": {"type":"string"},
    "latitude": {"type":"number"}, "longitude": {"type":"number"},
    "floor": {"type":"string"},
    "seller_floor": {"type":"number"},
    "elevator": {"type":"string","enum":["ground","stairs","elevator"]},
    "seller_has_elevator": {"type":"boolean","default":false},
    "seller_phone": {"type":"string"}, "seller_email": {"type":"string"}, "seller_name": {"type":"string"},
    "quantity": {"type":"number","default":1,"note":"LEGACY"},
    "initial_quantity": {"type":"number","default":1},
    "available_quantity": {"type":"number","default":1},
    "status": {"type":"string","enum":["pending_approval","approved","rejected","sold","draft"],"default":"draft"},
    "published": {"type":"boolean","default":true},
    "rejection_reason": {"type":"string"},
    "admin_notes": {"type":"string"},
    "approval_date": {"type":"string","format":"date-time"},
    "views_count": {"type":"number","default":0},
    "seller_id": {"type":"string","note":"0% filled in practice — seller identity actually lives in created_by/seller_email"},
    "location": {"type":"string"},
    "is_featured": {"type":"boolean","default":false},
    "item_story": {"type":"string"},
    "reason_for_selling": {"type":"string"},
    "allow_self_pickup": {"type":"boolean","default":false},
    "reserved_until": {"type":"string","format":"date-time"},
    "reserved_by": {"type":"string","note":"holds Order id"},
    "resale_source_order_id": {"type":"string","reference":"Order"},
    "retailer_link": {"type":"string"}
  },
  "permissions": "platform default — no RLS"
}
```

### 1.2 Order
```json
{
  "name": "Order",
  "required": ["item_id","buyer_id","seller_id","buyer_details","total_charged"],
  "fields": {
    "item_id": {"type":"string","reference":"Item"},
    "buyer_id": {"type":"string","reference":"User"},
    "seller_id": {"type":"string","reference":"User — but in live data holds an EMAIL string"},
    "order_status": {"type":"string","default":"request_submitted","enum":[
      "request_submitted","awaiting_seller_response","seller_confirmed","awaiting_phone_payment",
      "paid_manual","delivery_scheduled","mover_assigned","in_transit","awaiting_pickup","delivered",
      "ready_for_payout","completed","cancelled_by_buyer","cancelled_by_seller","cancelled_by_system",
      "cancelled_by_mover","cancelled_due_to_inactivity","failed_delivery","admin_intervention_required"]},
    "scheduling_state": {"type":"string","default":"none","enum":["none","negotiating","awaiting_seller","awaiting_buyer","delivery_scheduled","cancelled_due_to_inactivity"]},
    "current_delivery_window_id": {"type":"string","reference":"DeliveryWindow"},
    "final_delivery_date": {"type":"string","format":"date"},
    "final_delivery_shift": {"type":"string","enum":["morning","afternoon","evening"]},
    "delivered_at": {"type":"string","format":"date-time"},
    "dispute_status": {"type":"string","default":"none","enum":["none","opened","under_review","resolved","rejected"]},
    "pickup_window_id": {"type":"string","reference":"DeliveryWindow"},
    "delivery_window_id": {"type":"string","reference":"DeliveryWindow"},
    "current_negotiation_round": {"type":"number","default":0},
    "last_negotiation_update_at": {"type":"string","format":"date-time"},
    "response_deadline": {"type":"string","format":"date-time"},
    "delivery_type": {"type":"string","enum":["handled_delivery","self_pickup"],"default":"handled_delivery"},
    "self_pickup_seller_contact_released": {"type":"boolean","default":false},
    "buyer_confirmed_pickup": {"type":"boolean","default":false},
    "seller_confirmed_pickup": {"type":"boolean","default":false},
    "pricing_snapshot": {"type":"object","note":"IMMUTABLE — properties: item_price (legacy), shipping_cost, platform_fee_percentage, platform_fee_amount, display_price, seller_payout (legacy), unit_price, unit_seller_payout, quantity_purchased, total_item_price, total_seller_payout, calculated_at"},
    "total_charged": {"type":"number"},
    "payment_status": {"type":"string","default":"pending","enum":["pending","paid_manual","held_in_escrow","released_to_seller","refunded","voided","pending_refund"]},
    "payment_id": {"type":"string"},
    "payment_provider": {"type":"string","enum":["sumit","stripe","other","manual"],"default":"manual"},
    "payment_auth_ref": {"type":"string"},
    "cancellation_fee_amount": {"type":"number","default":0,"note":"₪50 if cancelled after seller confirm"},
    "payout_due_date": {"type":"string","format":"date-time","note":"delivery + 48h"},
    "ready_for_payout_at": {"type":"string","format":"date-time"},
    "payout_released_at": {"type":"string","format":"date-time"},
    "mover_assigned_id": {"type":"string","reference":"MoverAssignment"},
    "buyer_details": {"type":"object","properties":{"name":{},"email":{},"phone":{},"delivery_address":{},"floor":{"type":"number"},"elevator":{"enum":["has","none"]},"access_notes":{}}},
    "admin_notes": {"type":"string"},
    "ops_owner": {"type":"string"},
    "seller_confirmed_at": {"type":"string","format":"date-time"},
    "paid_at": {"type":"string","format":"date-time"},
    "cancellation_reason": {"type":"string"},
    "reserved_until": {"type":"string","format":"date-time"}
  },
  "permissions": "platform default — no RLS"
}
```

### 1.3 DeliveryWindow
```json
{
  "name": "DeliveryWindow",
  "required": ["order_id","window_type","proposed_by","type"],
  "fields": {
    "order_id": {"type":"string","reference":"Order"},
    "window_type": {"type":"string","enum":["pickup","delivery"]},
    "proposed_by": {"type":"string","enum":["buyer","seller","admin","system"]},
    "type": {"type":"string","enum":["initial_request","counter_offer","final_confirmation"]},
    "start_datetime": {"type":"string","format":"date-time","note":"legacy compat"},
    "end_datetime": {"type":"string","format":"date-time","note":"legacy compat"},
    "option_1_date": {"type":"string","format":"date"},
    "option_1_shift": {"type":"string","enum":["morning","afternoon","evening"]},
    "option_2_date": {"type":"string","format":"date"},
    "option_2_shift": {"type":"string","enum":["morning","afternoon","evening"]},
    "accepted_option": {"type":"number","enum":[1,2]},
    "status": {"type":"string","enum":["pending","accepted","rejected","expired"],"default":"pending"},
    "reason_for_counter": {"type":"string"},
    "round_number": {"type":"number","default":1},
    "iteration_number": {"type":"number","default":0,"note":"legacy compat"},
    "response_deadline": {"type":"string","format":"date-time"},
    "reminder_1_sent_at": {"type":"string","format":"date-time","note":"12h reminder"},
    "reminder_2_sent_at": {"type":"string","format":"date-time","note":"24h reminder"}
  },
  "permissions": "platform default — no RLS"
}
```

### 1.4 Dispute (0 records — never exercised)
```json
{
  "name": "Dispute",
  "required": ["order_id","buyer_id","reason_type","description"],
  "fields": {
    "order_id": {"reference":"Order"}, "buyer_id": {"reference":"User"},
    "status": {"enum":["opened","under_review","resolved","rejected"],"default":"opened"},
    "reason_type": {"enum":["wrong_item","missing_parts","not_as_described"]},
    "description": {"type":"string"}, "images": {"type":"array"},
    "resolution_type": {"enum":["refund_full","refund_partial","resale_free","no_action"]},
    "resolution_notes": {"type":"string"}, "resolution_amount": {"type":"number"},
    "item_id": {"reference":"Item"}, "item_title": {"type":"string","note":"cache"},
    "seller_id": {"reference":"User","note":"cache"}, "buyer_email": {"type":"string"},
    "resolved_at": {"format":"date-time"}, "resolved_by": {"type":"string"}
  },
  "permissions": "platform default — no RLS"
}
```

### 1.5 PromoSubscriber (0 records — feature just shipped)
```json
{
  "name": "PromoSubscriber",
  "required": ["email","coupon_code"],
  "fields": {
    "email": {"type":"string","format":"email"},
    "coupon_code": {"type":"string"},
    "source": {"type":"string","default":"popup"},
    "utm_source": {}, "utm_medium": {}, "utm_campaign": {},
    "used": {"type":"boolean","default":false},
    "used_at": {"format":"date-time"}, "used_order_id": {"reference":"Order"},
    "email_sent": {"type":"boolean","default":false}
  },
  "permissions": "platform default — no RLS"
}
```

### 1.6 AdminTask
```json
{
  "name": "AdminTask",
  "required": ["type","title","idempotency_key"],
  "fields": {
    "type": {"enum":["stuck_seller_response","stuck_payment","manual_followup","other"]},
    "priority": {"enum":["low","medium","high","urgent"],"default":"high"},
    "status": {"enum":["open","in_progress","resolved","dismissed"],"default":"open"},
    "order_id": {"reference":"Order"}, "item_id": {"reference":"Item"},
    "title": {}, "description": {}, "seller_phone": {}, "seller_name": {},
    "idempotency_key": {"type":"string","note":"e.g. stuck_seller_<orderId>"},
    "snapshot": {"type":"object"}, "resolved_at": {}, "resolved_by": {}, "admin_notes": {}
  },
  "permissions": "platform default — no RLS"
}
```

### 1.7 EmailEvent
```json
{
  "name": "EmailEvent",
  "required": ["correlation_id","template_id","template_name","recipient_email","recipient_type","idempotency_key"],
  "fields": {
    "correlation_id": {"type":"string"},
    "template_id": {"type":"string","note":"fake 'd-...' SendGrid-style strings — no real SendGrid"},
    "template_name": {"type":"string"},
    "recipient_email": {"format":"email"},
    "recipient_type": {"enum":["seller","buyer","courier","admin"]},
    "status": {"enum":["queued","sent","delivered","opened","clicked","bounced","failed"],"default":"queued"},
    "idempotency_key": {"type":"string"},
    "dynamic_data": {"type":"object"},
    "retry_count": {"type":"number","default":0},
    "error_message": {}, "sendgrid_message_id": {"note":"always 'unknown' — vestigial"}, "scheduled_for": {}
  },
  "permissions": "platform default — no RLS"
}
```

### 1.8 FinancialTransaction (0 records — designed, never used)
```json
{
  "name": "FinancialTransaction",
  "required": ["order_id","item_id","type","amount","status"],
  "fields": {
    "order_id": {"reference":"Order"}, "item_id": {"reference":"Item"},
    "type": {"enum":["payment","hold","release","refund","fee"]},
    "amount": {"type":"number"}, "currency": {"default":"ILS"},
    "status": {"enum":["pending","completed","failed"],"default":"pending"},
    "pricing_snapshot": {"type":"object"}
  },
  "permissions": "platform default — no RLS"
}
```

### 1.9 AuditLog
```json
{
  "name": "AuditLog",
  "required": ["entity","entity_id","action","performed_by"],
  "fields": {
    "entity": {"type":"string"}, "entity_id": {"type":"string"},
    "action": {"enum":["create","update","delete","approve","reject","publish","unpublish"],
               "note":"live data ALSO contains 'status_change' (25 records) — written outside the enum"},
    "diff": {"type":"object"}, "performed_by": {"type":"string"}
  },
  "permissions": "platform default — no RLS"
}
```

### 1.10 Favorite
```json
{"name":"Favorite","required":["user_id","item_id"],
 "fields":{"user_id":{"reference":"User"},"item_id":{"reference":"Item"}},
 "permissions":"platform default — no RLS"}
```

### 1.11 NotificationLog
```json
{
  "name": "NotificationLog",
  "required": ["order_id","recipient","notification_type"],
  "fields": {
    "order_id": {"reference":"Order"},
    "recipient": {"enum":["buyer","seller","admin"]},
    "notification_type": {"enum":["email_seller_initial_request","email_buyer_window_confirmed","email_seller_counter_offer","email_buyer_counter_offer","reminder_24h","reminder_1h","admin_alert","delivery_details"],
      "note":"live data contains MANY values outside this enum — see §2"},
    "content_snapshot": {"type":"object"},
    "status": {"enum":["sent","failed","pending"],"default":"pending"},
    "error_message": {}, "sent_at": {"format":"date-time"}
  },
  "permissions": "platform default — no RLS"
}
```

### 1.12 MoverAssignment
```json
{
  "name": "MoverAssignment",
  "required": ["order_id","mover_company_name","contact_phone","assigned_by"],
  "fields": {
    "order_id": {"reference":"Order"},
    "mover_company_name": {}, "contact_person": {}, "contact_phone": {}, "contact_email": {},
    "service_area": {}, "vehicle_capacity": {}, "notes": {}, "assigned_by": {},
    "assignment_status": {"enum":["active","completed","cancelled","failed"],"default":"active"},
    "actual_pickup_time": {}, "actual_delivery_time": {}, "delivery_issues": {}
  },
  "permissions": "platform default — no RLS"
}
```

### 1.13 Inquiry
```json
{
  "name": "Inquiry",
  "required": ["item_id","user_id","user_email","message"],
  "fields": {
    "item_id": {"reference":"Item"}, "user_id": {"reference":"User"},
    "user_name": {}, "user_email": {}, "user_phone": {}, "item_title": {"note":"cache"},
    "message": {}, "status": {"enum":["new","in_progress","resolved"],"default":"new"},
    "admin_notes": {}, "response": {}, "responded_at": {}
  },
  "permissions": "platform default — no RLS"
}
```

### 1.14 ItemQuestion (moderated Q&A)
```json
{
  "name": "ItemQuestion",
  "required": ["item_id","buyer_id","question_text","status"],
  "fields": {
    "item_id": {"reference":"Item"}, "buyer_id": {"reference":"User"}, "buyer_email": {},
    "seller_id": {"reference":"User"}, "seller_email": {},
    "question_text": {}, "answer_text": {},
    "status": {"enum":["pending_admin_question_review","awaiting_seller_answer","pending_admin_answer_review","published","rejected_question","rejected_answer"],"default":"pending_admin_question_review"},
    "admin_question_notes": {}, "admin_answer_notes": {}, "rejection_reason": {},
    "asked_at": {}, "answered_at": {}, "published_at": {}, "item_title": {},
    "flagged_bypass_attempt": {"type":"boolean","default":false,"note":"anti-platform-bypass flag"}
  },
  "permissions": "platform default — no RLS"
}
```

### 1.15 SupportRequest
```json
{
  "name": "SupportRequest",
  "required": ["email","message"],
  "fields": {
    "user_id": {"reference":"User"}, "user_name": {}, "email": {},
    "subject": {}, "subject_label": {}, "message": {}, "order_id": {"reference":"Order"},
    "user_type": {"enum":["buyer","seller","unknown"],"default":"unknown"},
    "status": {"enum":["new","in_progress","resolved"],"default":"new"},
    "source": {"default":"support_contact_modal"}, "page_path": {}, "admin_notes": {}, "resolved_at": {}
  },
  "permissions": "platform default — no RLS"
}
```

### 1.16 User (built-in, one custom field)
```json
{
  "name": "User",
  "custom_fields": {"phone": {"type":"string","required":true,"description":"מספר טלפון של המשתמש"}},
  "builtin_relied_on": ["id","email","full_name","role","created_date"],
  "roles": {"admin": 3, "user": 14},
  "note": "phone is declared required but only 1/17 users actually has it"
}
```

---

## 2. Data Reality

### Record counts & date ranges
| Entity | Count | Earliest | Latest |
|---|---|---|---|
| Item | 25 | 2025-10-08 | 2026-02-17 |
| Order | 94 | 2025-10-10 | 2026-02-15 |
| DeliveryWindow | 61 | 2025-10-10 | 2026-02-15 |
| Dispute | **0** | — | — |
| PromoSubscriber | **0** | — | — |
| AdminTask | 1 | 2026-02-15 | 2026-02-15 |
| EmailEvent | 338 | 2025-09-19 | 2026-02-17 |
| FinancialTransaction | **0** | — | — |
| AuditLog | 146 | 2025-09-20 | 2026-02-17 |
| Favorite | 1 | 2025-11-27 | 2025-11-27 |
| NotificationLog | 108 | 2025-10-10 | 2026-02-16 |
| MoverAssignment | 3 | 2025-10-12 | 2025-11-27 |
| Inquiry | 5 | 2025-11-24 | 2025-11-24 |
| ItemQuestion | 3 | 2025-11-26 | 2025-11-26 |
| SupportRequest | 3 | 2025-11-28 | 2026-02-15 |
| User | 17 | 2025-09-17 | 2026-02-17 |

### Item — distinct values & fill rates
- `status`: approved 22, rejected 3 (no draft/pending_approval/sold currently live)
- `published`: true 22, false 3
- `condition`: כמו חדש 16, טוב 3, בסדר 2, מצב טוב 2, מצב מצוין 1, חדש לגמרי 1
- `category`: ספה 14, שולחן 6, שידה 2, כסא 2, כורסה 1 *(note: "כסא" here vs "כיסא" in nav categories — inconsistent spelling)*
- `logistics_tier`: 4→15, 2→6, 1→2, 3→1, empty→1
- `elevator`: ground 18, elevator 5, stairs 2 · `allow_self_pickup`: false 19, true 6
- Fill rates: `pricing`/`seller_desired_price`/`original_price`/`dimensions`/`latitude`/`initial_quantity`/`available_quantity` **100%**; `brand` 64%; `retailer_link` 48%; `defects` 12%; `item_story` 4%; **`seller_id` 0%**; `resale_source_order_id` 0%; `reserved_until` 0% (no live reservations).

### Order — the REAL state machine (vs. designed)
`order_status` distinct values in the data:
```json
{
  "cancelled_due_to_inactivity": 68,
  "window_confirmed": 9,          // NOT in schema enum
  "awaiting_buyer_window_selection": 4, // NOT in schema enum
  "cancelled_by_buyer": 4,
  "payment_received": 3,          // NOT in schema enum
  "mover_assigned": 2,
  "delivery_scheduled": 1,
  "reschedule_loop": 1,           // NOT in schema enum
  "completed": 1,
  "awaiting_seller_response": 1
}
```
`payment_status`: **held_in_escrow 88** (!), pending 5, released_to_seller 1. The pilot never held money — `held_in_escrow` was written by the pre-request-first checkout and is semantically wrong for most records.
`payment_provider`: manual 67, empty 21, other 5, **sumit 1**. `delivery_type`: handled_delivery 94 (self_pickup never used in data).
`scheduling_state`: cancelled_due_to_inactivity 63, empty 19 (legacy), awaiting_seller 6, none 4, delivery_scheduled 2.
`dispute_status`: none 75, empty 19.
Fill rates: `pricing_snapshot`/`buyer_details`/`total_charged` 100%; `payment_id` 95% (mostly junk/placeholder values from legacy flow); `cancellation_reason` 77%; `current_delivery_window_id` 54%; `admin_notes` 6%; `final_delivery_date` 3%; `mover_assigned_id` 2%; `delivered_at`/`seller_confirmed_at`/`payout_released_at` 1%; **`paid_at` 0%, `ops_owner` 0%, `reserved_until` 0%**.
Note: `pricing_snapshot` shape varies across eras — 3 distinct generations coexist (legacy `{item_price, seller_payout}`, an early `{platform_fee_pct:5, platform_fee_min:15, rounding_rule:"100"}` variant, and the current unit-based shape).

### DeliveryWindow
`window_type`: delivery 24, **empty 37 (legacy records missing a required-ish field)** · `proposed_by`: buyer 58, seller 3 · `type`: initial_request 58, counter_offer 3 · `status`: pending 28, accepted 14, expired 12, rejected 7 · `option_1_shift`: afternoon 13, morning 9, empty 39 (legacy `start_datetime`-based records) · `round_number`: 1→21, 2→1, empty 39.

### EmailEvent / NotificationLog / AuditLog
- EmailEvent status: sent 286, failed 51, queued 1. Recipient type: seller 184, buyer 79, admin 70, unknown 5.
- Template usage counts: ADMIN_NEW_SUBMISSION 64, BUYER_ORDER_CONFIRMATION 59, SELLER_REJECTED 49, SELLER_INITIAL_WINDOW_REQUEST 48, SELLER_EMAIL_VERIFICATION 38, SELLER_APPROVED 32, BUYER_WINDOW_CONFIRMED 12, SELLER_SUBMISSION_RECEIVED 6, BUYER_REQUEST_EXPIRED 5, UNKNOWN_TEMPLATE 4, ADMIN_NEW_ORDER 3, ADMIN_MOVER_ASSIGNMENT_ALERT 3, SELLER_REMINDER_48H 3, SELLER_MOVER_ASSIGNED 3, BUYER_MOVER_ASSIGNED 3, SELLER_NEW_QUESTION 2, SELLER_COUNTER_OFFER 2, QUESTION_REJECTED 1, SELLER_WINDOW_CONFIRMED_BY_BUYER 1.
- NotificationLog types (all `sent`): email_buyer_window_selected 32, email_buyer_order_confirmation 30, email_seller_initial_request 24, email_buyer_window_confirmed 11, buyer_request_expired 5, admin_mover_assignment_alert 3, email_seller_counter_offer 2, email_seller_window_confirmed_by_buyer 1. (Several of these values are outside the schema enum.)
- AuditLog: approve 59, reject 54, status_change 25 (outside enum), update 5, delete 3 — all on entity `item`.

### Anonymized samples

**Item (approved):**
```json
{
  "id": "69945e0971855f8d63b09a87",
  "title": "שולחן סלון אליפסי של בקסטר - ציפוי פליז",
  "category": "שולחן", "condition": "כמו חדש",
  "pricing": {"requested_price": 4500, "platform_fee": 540, "display_price": 5040, "platform_fee_override": null, "calculated_at": "2026-02-17T12:58:27.949Z"},
  "seller_desired_price": 4500, "original_price": 20200,
  "logistics_tier": 2, "elevator": "elevator", "seller_floor": 17,
  "exact_address": "שדרות המלכים 10, תל אביב-יפו, ישראל",
  "seller_name": "רותי אברהם", "seller_phone": "0541234567", "seller_email": "ruth.a@example.com",
  "status": "approved", "published": true, "initial_quantity": 1, "available_quantity": 1,
  "location": "תל אביב-יפו, ישראל",
  "created_date": "2026-02-17T12:24:41.656000", "created_by": "ruth.a@example.com"
}
```
```json
{
  "id": "6992ecb0457704d641acefd7",
  "title": "ספה בצבע טבעי תלת מושבית קלאסית מאיקאה",
  "category": "ספה", "condition": "כמו חדש",
  "pricing": {"requested_price": 900, "platform_fee": 200, "display_price": 1100},
  "original_price": 2995, "logistics_tier": 4, "elevator": "ground", "seller_floor": 0,
  "exact_address": "רחוב הדקל 12, תל אביב-יפו, ישראל",
  "seller_name": "דניאל", "seller_phone": "0521234567", "seller_email": "daniel.k@example.com",
  "status": "approved", "published": true
}
```

**Order (the single completed one, legacy escrow-era):**
```json
{
  "id": "69275beafd9ac41db1b4ee4d",
  "item_id": "68d52434758691043ecb365d",
  "buyer_id": "68cace988c75de069b58a206",
  "seller_id": "daniel.k@example.com",
  "order_status": "completed", "payment_status": "released_to_seller", "payment_provider": "sumit",
  "total_charged": 3290,
  "pricing_snapshot": {"item_price": 2990, "shipping_cost": 300, "display_price": 3290, "calculated_at": "2025-11-26T19:58:34.464Z"},
  "buyer_details": {"name": "דני", "email": "daniel.k@example.com", "phone": "0501234567", "delivery_address": "רחוב האלון 8, תל אביב-יפו, ישראל", "floor": 1, "elevator": "has", "access_notes": ""},
  "delivery_type": "handled_delivery", "scheduling_state": "delivery_scheduled",
  "created_date": "2025-11-26T19:58:34.917000"
}
```
*(Note: the real record's buyer phone is literally `"77"` — junk test data.)*

**Order (request-first era, auto-cancelled):**
```json
{
  "id": "699217986b6ab6fe8182d798",
  "order_status": "cancelled_due_to_inactivity", "payment_status": "pending", "payment_provider": "other",
  "total_charged": 760,
  "pricing_snapshot": {"unit_price": 350, "unit_seller_payout": 312.5, "quantity_purchased": 1, "total_item_price": 350, "total_seller_payout": 312.5, "shipping_cost": 410, "display_price": 760, "calculated_at": "2026-02-15T18:59:36.920Z"},
  "buyer_details": {"name": "יעל כהן", "email": "yael.c@example.com", "phone": "0531234567", "delivery_address": "רחוב הברוש 3, תל אביב-יפו, ישראל", "floor": 2, "elevator": "none"},
  "cancellation_reason": "system_timeout:awaiting_seller_response:24h"
}
```

**DeliveryWindow (current-format):**
```json
{
  "order_id": "699217986b6ab6fe8182d798", "window_type": "delivery",
  "proposed_by": "buyer", "type": "initial_request",
  "option_1_date": "2026-02-17", "option_1_shift": "afternoon",
  "option_2_date": "2026-02-18", "option_2_shift": "morning",
  "status": "pending", "round_number": 1
}
```

**User:** `{"id": "68cace988c75de069b58a206", "full_name": "דניאל כהן", "email": "daniel.k@example.com", "role": "admin", "created_date": "2025-09-17T15:07:04.993000"}` — only 1/17 users has `phone` filled despite it being "required".

**Disputes:** none exist — sample unavailable.

---

## 3. Business Rules As Implemented

| Rule | Value | Where it lives | Exercised in data? |
|---|---|---|---|
| Platform fee (default markup) | **12%** (`DEFAULT_MARKUP = 1.12`), fee = `display_price − requested_price`, admin can override display price; fee floor 0 | `src/components/utils/calcDisplayFee.jsx` | Yes — but actual fees vary (e.g. 540/4500 = 12%, 200/900 = 22%) because admin sets display price manually |
| Legacy fee fallback | **8%** markup when only `seller_desired_price` exists | `src/components/utils/pricing.jsx` (`getFinalPrice`) | Rarely (fallback path) |
| Even older fee gen | 5% + ₪15 min + round-to-100 | seen frozen in old `pricing_snapshot`s only | Historical only |
| Minimum shipping cost | **₪250** | `src/components/utils/ShippingEngine.jsx` (`MINIMUM_SHIPPING_COST`) | Yes |
| Shipping base price by tier | 1→₪250, 2→₪270, 3→₪320, 4→₪400, 5→₪650 | ShippingEngine `BASE_PRICES` | Yes |
| Distance fee (Haversine air km) | ≤2km ₪40, ≤5 ₪60, ≤10 ₪100, ≤15 ₪160, ≤20 ₪220, ≤25 ₪280, then +₪20/km | ShippingEngine `DISTANCE_PRICING`, `EXTRA_KM_COST` | Yes |
| Floor fee (no elevator, per floor) | tier1/2 ₪15, tier3 ₪25, tier4 ₪40, tier5 ₪60; 0 if elevator or ground; applied at BOTH pickup and dropoff | ShippingEngine `FLOOR_FEES` | Yes |
| Distance fallback w/o coords | same city → 3km, different Gush Dan cities → 12km, default 5km | ShippingEngine | Yes |
| Service area | 20 Gush Dan cities (Hebrew + English list); out-of-area → error `מצטערים, המשלוח זמין רק באזור גוש דן` (`OUT_OF_SERVICE_AREA`) | ShippingEngine `SERVICE_AREA_CITIES` | Yes |
| Tier from dimensions | large cats (ספה/ארון/מיטה זוגית)→4; XL cats (ספה פינתית/ארון קיר/פינת אוכל)→5; else by max dimension: ≤80→1, ≤120→2, ≤180→3, ≤220→4, else 5; width+depth>330 or maxDim>250 → 5; default 3 | ShippingEngine `calculateTierFromDimensions` | Yes |
| Auto-cancel timeouts | `awaiting_seller_response` **24h**, `awaiting_phone_payment` **48h**, `seller_confirmed` **72h** → status `cancelled_due_to_inactivity`, release item, expire window, email buyer | `base44/functions/autoCancelStuckOrders` (every 30 min) | **Heavily** — 68 orders |
| Escalation threshold | 24h stuck in `awaiting_seller_response` → AdminTask (priority `urgent` if ≥36h else `high`) + admin email; idempotent | `base44/functions/escalateStuckOrders` (every 30 min) | Yes (1 AdminTask) |
| Cancellation fee after seller confirm | **₪50** | Terms page, CancellationPolicy page, `cancellation_fee_amount` field, sumitRefund docstring | **Never exercised** (field always 0) |
| Payout timing | delivery + **48h** dispute window → `ready_for_payout` | Order fields `payout_due_date`; admin flow | Once (1 payout) |
| Dispute window | **⚠️ CONFLICT:** Terms (§7) says **12 שעות** from delivery; emails/ops flow say 48h/24h ("יש לכם 24 שעות לוודא שהכל תקין") | Terms.jsx vs HandledMailer BUYER_DELIVERY_COMPLETED | Never exercised (0 disputes) |
| Shift hours (as shown to users) | בוקר 09:00–12:00, צהריים 12:00–16:00, ערב 16:00–19:00 (product spec said morning starts 08:00 — code says **09:00**) | `HandledMailer.formatShiftHebrew` | Yes |
| Scheduling constraints | tomorrow-min, no Saturdays, Friday morning-only, ≤90 days ahead | `TwoOptionSlotPicker.jsx` | Yes |
| Item reservation | on request submit, item `reserved_by=order.id`; schema comment says 10 min, request-first spec says 60 min; cleanup function releases expired | Checkout.jsx + `cleanupExpiredReservations` | Reservation cleanup automation is **disabled/failing**; currently 0 items reserved |
| "No leaving 1" quantity rule | multi-quantity items can't be bought leaving exactly 1 unit | `src/components/utils/quantityUtils.jsx` | Never (all items qty 1) |
| Promo coupon | code **RESTYLE50**, 50% off shipping, Tel Aviv only, single-use per email, expires **2026-04-01T00:00+03:00**; popup after 4s, re-shown after 14 days | `src/components/promo/promoConfig.jsx`, `PromoPopup.jsx`, `CouponField.jsx` | **Never** (0 subscribers) |
| Min item price ₪200 / min 3 images | product spec; enforced in upload flow UI (`UploadItem` steps) | frontend validation only | Partially (all items ≥ ₪200) |
| Seller email verification | verification email before submission (38 sent) | upload flow + `SELLER_EMAIL_VERIFICATION` template | Yes |
| Q&A moderation | question → admin review → seller answer → admin review → publish | ItemQuestion status machine + AdminV2 QnA screen | Yes (3 questions) |

---

## 4. Backend Functions Inventory

All are Deno HTTP handlers using `createClientFromRequest` (`@base44/sdk` 0.8.4/0.8.6).

| Function | Trigger | What it does | Reads/Writes | External APIs | Secrets |
|---|---|---|---|---|---|
| **autoCancelStuckOrders** | Scheduled every 30 min (active) + manual admin HTTP; `dry_run` param | Scans orders in `awaiting_seller_response`/`awaiting_phone_payment`/`seller_confirmed`; past timeout → sets `cancelled_due_to_inactivity` + `cancellation_reason="system_timeout:<status>:<h>h"`, releases Item reservation (only if `reserved_by===order.id`), expires pending DeliveryWindow (backfills `window_type:'delivery'` on legacy rows), emails buyer an inline-HTML Hebrew "הבקשה פגה תוקף" email | R/W Order, Item, DeliveryWindow | Core.SendEmail | — |
| **escalateStuckOrders** | Scheduled every 30 min (active); `dry_run` | Orders stuck >24h in `awaiting_seller_response` → creates idempotent AdminTask (`stuck_seller_<orderId>`, urgent if ≥36h) with full snapshot; sends rich admin email with tel: links to hardcoded `ADMIN_EMAIL='tomw200082@gmail.com'`; **does not modify orders** | R Order/Item/DeliveryWindow, W AdminTask | Core.SendEmail | — |
| **cleanupExpiredReservations** | Scheduled every 5 min — **DISABLED, 5 consecutive failures** | Lists items, releases those with `reserved_until < now` (`reserved_by`/`reserved_until` → null) | R/W Item | — | — |
| **sendWeeklyNewsletter** | Scheduled weekly Wed 09:00 — **DISABLED, 5 consecutive failures** | Creates conversation with `newsletter_agent`, polls up to 60s for HTML, then emails ALL users | R User; agents API | Core.SendEmail | — |
| **reconcileItemQuantities** | Manual admin HTTP (dry_run defaults **true**) | Finds items where `available_quantity > initial_quantity`; clamps to initial | R/W Item | — | — |
| **reconcileCancelledOrders** | Manual admin HTTP; `dry_run` | Clears stale `reserved_by` on items still held by orders in terminal statuses (list includes `completed`, `ready_for_payout`, all cancelled_*, `failed_delivery`) | R Order, R/W Item | — | — |
| **reportItemsDowngradedByCancellations** | Manual admin HTTP, report-only | Finds `draft` items that were once approved and have cancelled orders (candidates for re-listing); modifies nothing | R Item, Order | — | — |
| **sumitCharge** | SDK/HTTP POST from checkout (legacy flow), any authenticated user | Charges `SingleUseToken` via `POST https://api.sumit.co.il/payments/charge`, Currency ILS, Description `Restyle - <itemName>`; success = `Status===0`; returns payment_id/transaction_id | — (no entity writes) | Sumit API | `SUMIT_SECRET_KEY` |
| **sumitAuthorize** | HTTP POST, authenticated — **experimental, TODO endpoint unconfirmed** | J5 hold at `/payments/authorize`; returns payment_id + auth_ref | — | Sumit API | `SUMIT_SECRET_KEY` |
| **sumitCapture** | HTTP POST, authenticated — **experimental** | Captures held auth at `/payments/capture` with payment_id + auth_ref | — | Sumit API | `SUMIT_SECRET_KEY` |
| **sumitVoid** | HTTP POST, authenticated — **experimental** | Voids authorization at `/payments/void` | — | Sumit API | `SUMIT_SECRET_KEY` |
| **sumitRefund** | HTTP POST, authenticated | Full/partial refund at `/payments/refund` (used for the ₪50-fee cancellation model, disputes) | — | Sumit API | `SUMIT_SECRET_KEY` |
| **sumitProbe** | HTTP POST, **admin-only**, dev tool | Tests 6 candidate J5 endpoints with a ₪5 token charge to discover Sumit's auth/capture API; recommends `AUTH_CAPTURE_AVAILABLE` vs `CAPTURE_REFUND_ONLY` | — | Sumit API | `SUMIT_SECRET_KEY` |

**Critical architectural note:** all transactional emails and order/window creation run **client-side** (Checkout.jsx, HandledMailer.jsx, negotiationEvents.jsx) — not in backend functions. "Atomic reservation" is not actually atomic.

---

## 5. Integrations & Platform Configuration

**Payments — Sumit (sumit.co.il, Israeli PSP):**
- Mode: **direct API** (Bearer `SUMIT_SECRET_KEY`), tokenized `SingleUseToken` from frontend `PaymentModule.jsx`. No hosted payment page. Currency: **ILS**.
- **No webhooks at all** — no connector automations exist; all Sumit calls are synchronous request/response.
- Live vs test: the key appears live (1 real charged order, `payment_provider: "sumit"`, ₪3,290). Cannot verify key environment from inside the platform.
- Current pilot flow bypasses Sumit entirely (`payment_provider: "manual"` on 67 orders; payment by phone).

**Email:** Base44 built-in `Core.SendEmail` (no SendGrid despite naming), sender name "Restyle", intended from `hello@restyle.co.il`, reply-to `support@restyle.co.il`. All sends logged to EmailEvent with idempotency keys. Admin recipient hardcoded: `tomw200082@gmail.com` (single-element `ADMIN_EMAILS`).

**WhatsApp:** secrets configured — `PhonenumberID`, `WhatsAppBusinessAccountID`, `Accesstokenwhatsapp` (WhatsApp Business Cloud API) — but **no backend function uses them**. Only a frontend `WhatsAppNotifier.jsx` component and an agent (`whatsapp_reminder_agent`) reference the concept. Effectively wired-but-dormant.

**Analytics:** PostHog injected in `Layout.jsx` (`eu.i.posthog.com`, public client key `phc_B0WqfQT4Lmb3HIs8L0yTxbNTD1DSLZEB5q0QZXoIM1O`, `person_profiles: 'identified_only'`). Base44 `analytics.track` used for promo funnel events (`promo_popup_view`, `promo_popup_submit_success/fail`, `promo_email_sent`, coupon events).

**Auth:** Base44 platform-managed (`base44.auth.redirectToLogin`, `me()`, `logout()`). Enabled provider list (Google/email/etc.) is platform-side configuration not visible from here — verify in the Base44 dashboard. Custom `phone` field on User (declared required, ignored in practice). App is effectively public-browse; auth required for checkout/dashboards.

**Domain:** production `https://restyle.co.il` (hardcoded in HandledMailer, escalateStuckOrders, autoCancelStuckOrders email links).

**Scheduled automations (4):**
| Name | Function | Schedule | Status |
|---|---|---|---|
| Escalate Stuck Orders (24h seller no-response) | escalateStuckOrders | every 30 min | ✅ active, last run success |
| Auto-Cancel Stuck Orders (Timeouts) | autoCancelStuckOrders | every 30 min | ✅ active, last run success |
| Cleanup Expired Item Reservations | cleanupExpiredReservations | every 5 min | ❌ **inactive — 5 consecutive failures** |
| שליחת ניוזלטר שבועי | sendWeeklyNewsletter | Wed 09:00 weekly | ❌ **inactive — 5 consecutive failures** |

**AI agents (3 configs, minimally used):**
- `newsletter_agent` — reads Item + User; Hebrew instructions to build a weekly HTML newsletter (only consumer: the disabled newsletter function).
- `whatsapp_reminder_agent` — read/update Order, read DeliveryWindow/Item/MoverAssignment/User, create NotificationLog; instructions reference statuses (`out_for_delivery`) that don't exist in the schema. No automation triggers it — dormant.
- `reminder_scheduler` — read/update DeliveryWindow + Order, create NotificationLog; 24h/48h reminder logic. No automation triggers it — dormant.

**User roles:** `admin` ×3, `user` ×14.

---

## 6. URL & Routing Map

Routing: `src/App.jsx` renders `mainPage` ("Home") at `/` plus one route per page: `/<PageName>` (exact PascalCase key from `pages.config.js`). React Router matching is case-insensitive, and the app's own `createPageUrl(name)` generates **lowercase** paths (`'/' + name.toLowerCase()`), so both casings resolve. Emails use PascalCase paths (`https://restyle.co.il/AdminV2?screen=orders`, `/Catalog`).

**Item URL construction:** route `ItemDetails`, query param **`id`**, value = 24-char hex record id.
`https://restyle.co.il/ItemDetails?id=<itemId>` (also reachable as `/itemdetails?id=...`).

**5 real example item URLs:**
```
https://restyle.co.il/ItemDetails?id=69945e0971855f8d63b09a87
https://restyle.co.il/ItemDetails?id=6992ecb0457704d641acefd7
https://restyle.co.il/ItemDetails?id=6992e50fcbaea2d5da7e6f0b
https://restyle.co.il/ItemDetails?id=6991c4e800c505010167abb0
https://restyle.co.il/ItemDetails?id=6991b7b78e667d05072bf1a2
```

**All routes** (public unless noted):
- `/` (Home), `/Catalog` (`?category=`, `?search=` filters via URL params), `/ItemDetails?id=`, `/HowItWorks`, `/About`, `/BuyerProtection`, `/Terms`, `/PrivacyPolicy`, `/Accessibility`, `/CancellationPolicy`
- Checkout/order: `/Checkout?id=<itemId>` (+quantity params), `/OrderSuccess?orderId=`, `/OrderDetails`, `/OpenDispute`, `/PaymentSuccess`, `/PaymentCancelled` (legacy), `/CheckoutDetails` (legacy), `/ScheduleDelivery` (legacy)
- Seller: `/UploadItem` (`?reuploadId=` for rejected re-upload), `/UploadSuccess`, `/VerifyEmail`, `/SellerDashboard`, `/SellerResponse?orderId=&windowId=` (+`&option=1|2&action=approve|counter` from email links), `/SellerResponseSuccess`, `/SellerAnswer` (Q&A)
- Buyer: `/BuyerDashboard`, `/Favorites`, `/BuyerResponse?orderId=&windowId=`, `/BuyerResponseSuccess`
- Admin (role-gated in UI only): `/AdminV2?screen=<dashboard|review|orders|disputes|support|qna|...>` (**the real admin**), `/AdminV2Entry`, plus deprecated: `/Admin`, `/AdminCockpit`, `/AdminDashboard`, `/AdminQuickAccess`, `/AdminShippingCoordination?orderId=`, `/AdminSupportRequests`
- Dev: `/TestItems`
- 404 → `PageNotFound`.

**Redirect-critical inbound links that exist in already-sent emails:** `/SellerResponse?orderId=…&windowId=…&option=…&action=…`, `/BuyerResponse?orderId=…&windowId=…`, `/ItemDetails?id=…`, `/AdminV2?screen=…`, `/Catalog`, `/BuyerDashboard`, `/SellerDashboard`, `/UploadItem?reuploadId=…`, `/OrderSuccess?orderId=…`.

---

## 7. Content — Verbatim Hebrew

> **Editorial note (added by the rebuild agent, not part of the source audit):** this audit was delivered in two parts. The first part stopped mid-way through §7.5 and resumed in a continuation that supplied the full `/HowItWorks` and `/BuyerProtection` copy plus §8 items 12–25. The two parts are merged below with **no content dropped or reworded**; the only change is subsection numbering, so that HowItWorks = 7.5, BuyerProtection = 7.6, and Email templates (delivered in part one as 7.6) = 7.7.

### 7.1 תקנון ותנאי שימוש (`/Terms`, עדכון 25.11.2025)

> ברוכים הבאים ל-Restyle - פלטפורמה לניהול עסקאות ומפגש בין מוכרים פרטיים לרוכשים של רהיטים יד-שנייה. השימוש באתר מהווה הסכמה מלאה לתנאי התקנון. אם אינך מסכים - אנא הימנע משימוש בפלטפורמה.

**תקציר תנאי שימוש** (לתועלת המשתמש בלבד. התקנון המלא הוא המסמך המחייב היחיד.)
- קבלת התנאים: השימוש באתר מהווה הסכמה מלאה לתקנון המלא.
- התחייבות המוכר: להיות הבעלים החוקיים של הפריט, למסור מידע אמיתי, ולאשר חלון זמן למסירה.
- התחייבות הקונה: למסור פרטים נכונים, לבצע תשלום תקין, ולשתף פעולה בתיאום המשלוח.
- תשלום: חיוב מתבצע רק אחרי אישור המוכר. שחרור הכספים למוכר מתבצע לאחר דיווח "נמסר".
- ביטולים: אפשר לבטל ללא עלות עד אישור המוכר. לאחר אישור: ביטול יחויב ב-50 ₪.
- פריטים יד-שנייה: "As-Is", ייתכן בלאי טבעי, ואינם מהווים עילה להחזר.
- אחריות: Restyle אינה אחראית לנזקי הובלה, פגמים אסתטיים או תוכן משתמשים.
- שינויים: המשך שימוש באתר מהווה הסכמה לשינויים עתידיים בתנאים.

**1. הגדרות** — "Restyle", "החברה", "הפלטפורמה" - שירות מקוון לתיווך, ניהול ותיאום עסקאות בין מוכרים פרטיים לקונים. "מוכר" - אדם פרטי המציע פריט למכירה. "קונה" - משתמש שמבצע הזמנה באתר. "עמלה" - תמורה עבור שירותי התיווך והתפעול של Restyle. "הובלה" - שירות צד שלישי שמבצעים מובילים חיצוניים בלבד. "מסירה" - אישור המוביל כי הפריט נמסר ללקוח.
**2. גיל מינימלי לשימוש** — השימוש באתר מיועד לבני 18 ומעלה. ביצוע עסקה מהווה הצהרה כי המשתמש בן 18 לפחות.
**3. מהות התפקיד של Restyle** — Restyle משמשת כגורם מתווך בלבד. Restyle אינה צד לחוזה המכר בין מוכר לקונה ואינה בעלת הפריטים. החברה אינה אחראית לטיב הפריטים, להתאמתם האישית או לערכם. החברה מנהלת: תיאום, חיוב, הקפאת כספים, שחרור כספים למוכר, ותיאום מול מובילים.
**4. תהליך הזמנה ותשלום** — פרטי האשראי של הקונה מעובדים ישירות ע"י ספק סליקה מאובטח, ואינם נשמרים במערכות הפלטפורמה. חיוב מתבצע רק לאחר אישור המוכר לחלון זמן לאיסוף/מסירה. עד לאישור המוכר - ההזמנה ניתנת לביטול ללא חיוב. לאחר אישור המוכר - ניתן לבטל בעלות קבועה של 50 ₪ (עלות תפעול). לאחר המסירה בפועל - Restyle משחררת למוכר את חלקו בעסקה בתוך זמן סביר. הכספים מוחזקים זמנית כחלק מניהול העסקה בלבד (לא נאמנות משפטית).
**5. תיעוד, חשבוניות וקבלות** — הקונה מקבל קבלה על מלוא התשלום. המוכר הפרטי אינו מנפיק מסמך מס בעסקה פרטית. Restyle מנפיקה למוכר מסמך עסקה על גובה העמלה בלבד. החברה שומרת תיעוד מלא של כל העברות הכספים.
**6. פריטי יד-שנייה – מצב "As-Is"** — כל הפריטים באתר הם פריטי יד-שנייה. ייתכן בלאי טבעי, שינויי גוון, שריטות, כתמים או סימני שימוש סבירים - אינם מהווים עילה להחזר. האחריות לתיאור אמיתי ונכון היא של המוכר בלבד.
**7. אחריות תיאורית ואי-התאמה מהותית** — Restyle לא מבטיחה שהמידע שמסר המוכר נכון, שלם או מדויק. קונה רשאי לפתוח בקשת בירור (Dispute) בתוך 12 שעות ממועד המסירה, במקרים של: פריט שגוי, חלקים מהותיים חסרים, אי-התאמה מהותית ומוכחת לתיאור. Restyle רשאית, אך אינה מחויבת, להציע: החזר חלקי, זיכוי, מכירה מחדש ללא עמלה. החלטת Restyle היא סופית ואינה ניתנת לערעור.
**8. הובלה** — שירותי ההובלה מבוצעים ע"י ספקי צד ג' בלבד. Restyle אינה אחראית לנזקי הובלה, עיכובים או אובדן מכל סוג. דיווח "נמסר" מהמוביל מהווה השלמת עסקה.
**9. עיכובים ותקלות** — עיכובים הנגרמים בשל עומסים, תנאי שטח, מזג אוויר או תקלות צד ג' אינם מהווים עילה לביטול עסקה, החזר כספי או פיצוי מכל סוג.
**10. אחריות מוגבלת** — Restyle לא תהיה אחראית לנזקים: עקיפים, תוצאתיים, עוגמת נפש, אובדן רווחים, נזקים עתידיים, כל נזק שאינו נזק ישיר ומוכח. בכל מקרה, אם תיקבע אחריות - היא מוגבלת לסכום העמלה בלבד.
**11. תוכן משתמשים** — כל תוכן המועלה ע"י משתמשים הינו באחריותם הבלעדית. Restyle אינה מבצעת ניטור מוקדם. המשתמש מצהיר שהתוכן אינו מפר זכויות יוצרים, סימני מסחר או כל דין אחר. החברה רשאית להסיר כל תוכן לפי שיקול דעתה.
**12. פריטים אסורים למכירה** — אסור להעלות או לפרסם: פריטים גנובים, פריטים מסוכנים, פריטים שאסורים למכירה לפי כל דין. Restyle אינה אחראית לתכולת הפריטים שהמוכרים מציעים.
**13. פרטיות ואבטחת מידע** — מידע אישי מנוהל בהתאם לחוק הגנת הפרטיות. פרטי אשראי אינם נשמרים במערכות Restyle כלל. ייתכן שמידע יישמר או יעובד בשרתים מחוץ לישראל. החברה נוקטת באמצעי אבטחה סבירים בהתאם לחוק.
**14. שגיאות תמחור או תיאור** — Restyle רשאית לתקן כל טעות תיאור, ניסוח או תמחור בכל עת, גם לאחר ביצוע הזמנה.
**15. השעיה וחסימת משתמשים** — החברה רשאית להשעות, לחסום או למחוק חשבונות של משתמשים שפועלים בניגוד לתקנון או לפי שיקול דעתה המקצועי.
**16. שינוי או הפסקת שירותים** — Restyle רשאית לשנות, לעדכן או להשעות חלק מהשירותים או את כולם ללא הודעה מוקדמת.
**17. יישוב מחלוקות** — Restyle תסייע למשתמשים בגישור, אך אינה מהווה בורר ולא מתחייבת לתוצאה.
**18. דין ושיפוט** — על התקנון יחול הדין הישראלי בלבד. לבתי המשפט המוסמכים בתל אביב תהיה סמכות בלעדית לדון בכל מחלוקת.
**19. יצירת קשר** — support@restyle.co.il · 053-7252858

### 7.2 מדיניות פרטיות (`/PrivacyPolicy`, עדכון 25.11.2025)

> מסמך זה מפרט כיצד Restyle אוספת, משתמשת, שומרת ומגנה על המידע האישי של המשתמשים בפלטפורמה. השימוש באתר מהווה הסכמה למדיניות זו.

**1. איזה מידע אנו אוספים** — אנו אוספים מידע הנדרש להפעלת השירותים: פרטים שמספק המשתמש: שם מלא, טלפון, אימייל. פרטי הזמנה: פריט שנרכש, כתובת, זמני מסירה. מידע תשלומים: פרטי אשראי אינם נשמרים אצלנו, אלא מעובדים ע"י ספק סליקה מאובטח (כמו PAYME / Tranzila / Morning). מידע טכני: כתובת IP, דפדפן, מערכת הפעלה, נתוני שימוש באתר. מידע הנדרש לצורך אבטחה, מניעת הונאות ושיפור השירות.
**2. כיצד אנו משתמשים במידע** — לצורך הפעלת המערכת וניהול העסקאות בין מוכרים לקונים. לצורך תיאום איסוף/משלוח עם המובילים. לצורך זיהוי משתמש, שירות לקוחות ופתרון בעיות. לצורך שליחה של התראות ועדכונים על רכישה. לשיפור חוויית המשתמש ושיפור השירותים באתר. לצורך עמידה בדרישות החוק והמיסוי.
**3. העברת מידע לצדדים שלישיים** — אנו משתפים מידע רק עם: ספקי סליקה מאובטחים – לצורך חיוב העסקה. מובילים וקבלני משנה – רק מידע הנדרש לביצוע איסוף או מסירה. רשויות החוק – רק אם אנו מחויבים לעשות זאת לפי דין. **Restyle אינה מוכרת ואינה סוחרת במידע אישי.**
**4. אחסון ואבטחת מידע** — האתר מאובטח בפרוטוקול SSL. מידע נשמר על גבי שרתים מאובטחים בלבד. גישה למידע מוגבלת לעובדים מורשים בלבד. אנו מיישמים נהלי הגנה על נתונים בהתאם לחוק הגנת הפרטיות.
**5. Cookies ועוגיות** — האתר משתמש בעוגיות למטרות: שיפור חוויית הגלישה, שמירת העדפות משתמש, ניתוח נתוני שימוש, אבטחה. באמצעות הדפדפן ניתן לחסום עוגיות בכל עת.
**6. זכויות המשתמש** — המשתמש רשאי: לבקש לעיין במידע שנשמר עליו, לבקש למחוק או לעדכן מידע, לבקש להפסיק קבלת הודעות, לבטל חשבון. יש לשלוח בקשה לדוא״ל: support@restyle.co.il
**7. שמירת מידע** — מידע נשמר כל עוד המשתמש פעיל בפלטפורמה ולפרק זמן סביר לאחר מכן לצורך חובות חוקיות וניהול תיעוד.
**8. שינוי במדיניות** — Restyle רשאית לעדכן מדיניות זו מעת לעת. עדכון יפורסם באתר.
**9. יצירת קשר** — לשאלות בנושא פרטיות: support@restyle.co.il · טלפון/וואטסאפ: 053-7252858
*(שימו לב: המסמך מזכיר PAYME/Tranzila/Morning — בפועל הספק הוא Sumit. אי-התאמה.)*

### 7.3 מדיניות ביטולים (`/CancellationPolicy`, עדכון 25.11.2025)

> מסמך זה מפרט את מדיניות הביטולים של Restyle. מאחר שהמוכרים בפלטפורמה הם אנשים פרטיים בלבד, ולא "עוסקים", חוק הגנת הצרכן (עסקה מרחוק) אינו חל על עסקאות אלה. עם זאת, לצורך שקיפות מלאה, להלן מדיניות הביטולים המחייבת:

**1. ביטול לפני אישור המוכר** — כל עוד המוכר לא אישר חלון זמן לאיסוף/מסירה - הקונה רשאי לבטל את ההזמנה **ללא עלות**.
**2. ביטול לאחר אישור המוכר** — לאחר שהמוכר אישר חלון זמן: ביטול מצד הקונה יחויב בעלות קבועה של **50 ש"ח** לכיסוי הוצאות תפעול. יתר התשלום יוחזר לקונה, למעט 50 ש"ח שנגבים לכיסוי עלויות התפעול.
**3. ביטול מצד המוכר** — אם המוכר מבטל - ההזמנה מבוטלת באופן אוטומטי וללא חיוב הקונה.
**4. לאחר מסירה - אין ביטולים** — לאחר שהמוביל דיווח על "נמסר": לא ניתן לבטל עסקה ולא יינתן החזר מכל סוג, למעט מקרים של פתיחת בקשת בירור (Dispute) בהתאם לתקנון.
**5. הבהרת אחריות** — עלות ההובלה אינה מוחזרת בכל מקרה. Restyle אינה אחראית לעיכובים או שינויים מצד מובילי צד ג'.
**6. יצירת קשר** — support@restyle.co.il · טלפון: 053-7252858

### 7.4 הצהרת נגישות (`/Accessibility`)

**כללי** — אתר **Restyle** רואה חשיבות עליונה במתן שירות שוויוני לכלל הלקוחות ובפרט לאנשים עם מוגבלויות. אנו משקיעים משאבים רבים בהנגשת האתר והשירותים שלנו, על מנת לאפשר לכל גולש חווית גלישה נוחה, קלה ומכובדת, בהתאם להוראות חוק שוויון זכויות לאנשים עם מוגבלות, תשנ"ח-1998 והתקנות שהותקנו מכוחו.
**רמת הנגישות באתר** — האתר עומד בדרישות תקנות שוויון זכויות לאנשים עם מוגבלות (התאמות נגישות לשירות), התשע"ג 2013. התאמות הנגישות בוצעו עפ"י המלצות התקן הישראלי (ת"י 5568) לנגישות תכנים באינטרנט ברמת AA ומסמך WCAG 2.0 הבינלאומי. האתר מותאם לתצוגה בדפדפנים הנפוצים ולשימוש בטלפון הסלולרי. האתר מספק מבנה סמנטי עבור טכנולוגיות מסייעות ותמיכה בשימוש במקלדת (Tab, Arrows, Enter). קיימת אפשרות להגדלת פונטים ושינוי ניגודיות באמצעות סרגל הנגישות המוטמע באתר. לתמונות המשמעותיות באתר יש טקסט אלטרנטיבי (Alt Text).
**מגבלות נגישות ומידע חסר** — למרות מאמצינו להנגיש את כלל הדפים והתכנים באתר, ייתכן ויתגלו חלקים שטרם הונגשו במלואם או שנמצאים בתהליך הנגשה (למשל: מסמכי PDF ישנים או תמונות שהועלו על ידי משתמשים פרטיים בטרם עברו בקרה). אנו ממשיכים במאמצים לשפר את נגישות האתר כחלק ממחויבותנו לאפשר שימוש בו עבור כלל האוכלוסייה, כולל אנשים עם מוגבלויות.
**פרטי רכז הנגישות ודרכי יצירת קשר** — אם נתקלתם בקושי בגלישה באתר, או שיש לכם הערה או בקשה להנגשה, אנו מזמינים אתכם לפנות אלינו ואנו נטפל בפנייה בהקדם האפשרי. שם רכז הנגישות: תום ויט. טלפון / וואטסאפ: 053-7252858. דואר אלקטרוני: support@restyle.co.il. * אנו מתחייבים לחזור לפניות בנושא נגישות בתוך **2 ימי עסקים** מרגע קבלת הפנייה.
*(תאריך העדכון מוצג דינמית — `new Date()` — ולא תאריך קבוע.)*

### 7.5 איך זה עובד (`/HowItWorks`) — verbatim Hebrew copy

Toggle: **„אני רוצה למכור" / „אני רוצה לקנות"**

**Hero (מוכר):** „אתם לא לבד במכירת הרהיט האהוב שלכם" · „אתם רק מפרסמים את הפריט בקפידה, אנחנו עוזרים בכל השאר" · CTA „מכרו עכשיו"
**Hero (קונה):** „הדרך הבטוחה שלכם לקנות ריהוט יד שנייה איכותי" · „בלי הפתעות, עם הובלה עד הבית ומדיניות שמשאירה את הדאגות מאחור" · CTA „חפשו את הרהיט הבא שלכם"

**4 שלבים למוכר** — „איך זה עובד? ארבעה שלבים פשוטים" / „מהעלאה ועד לקבלת הכסף - הכל פשוט ושקוף":
1. **צלמו ופרסמו** — „ממשק קל, העלאה תוך 2 דקות. הטיפים שלנו יעזרו לכם למכור מהר."
2. **אנחנו מוצאים קונה** — „בלי טלפונים מציקים ובלי מו"מ מתיש. רק קונים רציניים."
3. **הובלה מקצועית** — „ההובלה מתואמת לפי חלון זמן המתאים לכם- הכל קבוע מראש וללא הפתעות."
4. **קבלו תשלום** — „הכסף מועבר אליכם ישירות לאחר מסירת הפריט."

**4 שלבים לקונה** — „הדרך שלכם לרהיט המושלם" / „מהחיפוש ועד שהרהיט מגיע אליכם הביתה":
1. **מצאו את המושלם עבורכם** — „קטלוג מסונן ואיכותי, כל מה שמפורסם זמין, ועם כל הפרטים הנדרשים בכדי לבצע הזמנה במיידי."
2. **קנו בביטחון** — „הכסף שלכם שמור ומוגן אצלנו, רק שתאשרו שקיבלתם את הפריט והוא כמו שתואר, נעביר את הכסף למוכר."
3. **תשכחו מהובלות** — „תשכחו מהובלות- אנחנו גם אחראיים על הובלה במידה וצריך."
4. **תתחדשו!** — „הפריט כבר אצלכם אבל בסוף לא מתאים? חשבנו על הכל- נעזור לכם למכור מחדש- בחינם!"

**למה למכור עם Restyle?** — „כי אנחנו דואגים לכל הפרטים הקטנים שעושים את ההבדל":
- **תשלום מאובטח** — „הכסף שמור אצלנו בבטחה עד שהעסקה מושלמת. התשלום מועבר ישירות לחשבון הבנק שלכם."
- **פרטיות מלאה** — „הקונה לא מקבל את הטלפון או הכתובת שלכם עד התיאום הסופי."
- **שירות לקוחות אנושי** — „צוות שמלווה את העסקה ועונה על כל שאלה בזמן אמת."

**באנר:** „הידעתם? פריט שמוצע למכירה עם הובלה נמכר בממוצע בחצי מהזמן!" · CTA „העלו פריט למכירה" · „ללא התחייבות • פרסום חינם • תמיכה אישית"

**שאלות נפוצות — מוכר:**
- „מתי הכסף נכנס לחשבון שלי?" → „הכסף משתחרר תוך 3-5 ימי עסקים לאחר שהקונה אישר קבלת הפריט. זה מבטיח שהעסקה עברה בשלום ושני הצדדים מרוצים."
- „מה קורה אם הקונה מבטל?" → „אם הקונה מבטל לפני האיסוף, אין לכם שום עלות או טרחה. הפריט פשוט חוזר להיות זמין למכירה. אנחנו נדאג לעדכן אתכם."
- „האם אני חייב להיות בבית ביום האיסוף?" → „כן, חשוב שמישהו יהיה נוכח במועד האיסוף כדי לאפשר כניסה ולוודא שהצוות לוקח את הפריט הנכון. תקבלו תזכורת מראש."
- „כמה זמן לוקח למכור פריט?" → „זה תלוי בסוג הפריט ובמחיר. פריטים איכותיים במחיר הוגן נמכרים בממוצע תוך 5-10 ימים. נעדכן אתכם על עניין מצד קונים."

**שאלות נפוצות — קונה:**
- „מה קורה אם הרהיט מגיע פגום?" → „יש לכם **48 שעות** לדווח על נזק או אי התאמה. נבדוק את המקרה ונחזיר לכם את הכסף במלואו. הכסף שלכם מוגן אצלנו עד שתאשרו."
- „כמה עולה ההובלה?" → „התעריף משתנה לפי מרחק, גודל הפריט וקומה. תקבלו הצעת מחיר מדויקת לפני הקנייה, ללא הפתעות."
- „מה קורה אם הרהיט הגיע והוא לא בול מה שחיפשנו?" → „אנחנו מבינים שזה קורה. ולכן אנחנו מציעים מכירה מחדש ללא עמלה. בלחיצת כפתור אחת הפריט חוזר למכירה באתר, ואנחנו מוותרים על עמלת השירות שלנו כדי שתהיו הכי מרוצים שאפשר."
- „איך אנחנו יודעים שהמוכר אמין?" → „כל פריט עובר בדיקה על ידי המוביל בזמן האיסוף. בנוסף, המוכרים שלנו מאומתים והכסף שלכם שמור אצלנו עד שתאשרו."

**CTA סופי:** מוכר — „כאן מוכרים בכיף!" / „הצטרפו למוכרים שלנו" / „התחילו למכור" / „ללא התחייבות • פרסום חינם • תמיכה אישית". קונה — „הבית שלכם מחכה לשדרוג." / „מאות פריטים מחכים לכם" / „גלו את הקטלוג" / „משלוח עד הבית • תשלום מאובטח • החזר כספי". משותף: „באנו לעזור לכם לעצב מחדש. בקלות, מהירות וביטחון."

**⚠️ Hidden business-rule discrepancy in this page's code:** it contains a profit calculator computing `commission = Math.round(sellingPrice * 0.15)` — **15%**, contradicting the implemented 12% default. The calculator UI isn't currently rendered but the constant survives.

### 7.6 הגנת קונים (`/BuyerProtection`) — verbatim Hebrew copy

**Hero:** „הגנת הקונה של Restyle" · „אם משהו לא הסתדר עם הרכישה – אנחנו כאן כדי לעזור לך לפתור את זה."

**מתי אנחנו מתערבים?** — „במקרים של טעות בפריט, חלקים חסרים או אי־התאמה מהותית לתיאור – יש לך אפשרות לפתוח פנייה מסודרת, ואנחנו נבדוק ונתערב."
- **פריט שגוי** — „קיבלת פריט שונה לחלוטין ממה שהוזמן"
- **חלק מהותי חסר** — „חסר רכיב קריטי שמשפיע על השימוש בפריט"
- **אי התאמה מהותית לתיאור** — „הפריט שונה באופן משמעותי מהתיאור והתמונות"

**איך התהליך עובד?**
1. **פתיחת בקשת בירור** — „יש לך **12 שעות מרגע המסירה** לפתוח בקשת בירור דרך דף ההזמנה שלך."
2. **תיאור + הוכחות** — „תארו את הבעיה בפירוט והעלו לפחות 3 תמונות שמציגות את הבעיה."
3. **בדיקה ידנית** — „צוות Restyle בודק את הבקשה, משווה לתיאור המקורי, ובוחן את ההוכחות."
4. **הערכת מצב** — „אנחנו מעריכים את חומרת הבעיה ואת ההשפעה על ערך הפריט."
5. **החלטה ופתרון** — „נודיע לך על ההחלטה ונפעל בהתאם – החזר מלא, חלקי, או פתרון אחר."

**מכירה מחדש:** „לא אהבת? אפשר למכור מחדש – בלי עמלה" — „הפריט הגיע תקין אבל פשוט לא מתאים לך? לא נורא. בתוך **7 ימים מהמסירה**, אפשר לפרסם אותו מחדש למכירה באתר – **בלי לשלם עמלת פלטפורמה**."

**למה המכירות סופיות?** — „כל הפריטים באתר הם פריטי יד-שנייה, ונמכרים במצבם כפי שהם (As-Is). זה אומר שייתכנו סימני שימוש סבירים, בלאי טבעי, או פגמים קטנים שאינם מהווים עילה להחזר. אנחנו מבינים שלפעמים פריט פשוט לא מתאים – ולכן יצרנו את אפשרות המכירה מחדש ללא עמלה."

**CTA:** „יש בעיה עם רכישה?" — „אם קיבלת פריט ויש בעיה מהותית, תוכל לפתוח בקשת בירור דרך דף ההזמנות שלך." · „לצפייה בהזמנות שלי"

### 7.7 Email templates (all sent via `HandledMailer` — subjects, preview texts, and body copy)

Sender: "Restyle" · footer on every email: „המוצר הזה נרכש דרך Restyle — מרקטפלייס רהיטים אמין, שקוף ונעים." + „לשאלות או תמיכה לחצו כאן" (mailto:support@restyle.co.il). Shift labels: בוקר (09:00–12:00), צהריים (12:00–16:00), ערב (16:00–19:00).

**Subjects (verbatim):**
- SELLER_NEW_QUESTION: `יש לך שאלה חדשה על "<item>"` · BUYER_ANSWER_PUBLISHED: `קיבלת תשובה לשאלה שלך` · QUESTION_REJECTED: `השאלה שלך לא אושרה` · ANSWER_REJECTED: `התשובה שלך לא אושרה`
- SELLER_APPROVED: `הפריט שלך אושר ומפורסם` · SELLER_REJECTED: `נדרש תיקון קטן לפני פרסום`
- SELLER_INITIAL_WINDOW_REQUEST: `יש קונה מעוניין ב<item> – תיאום הובלה` (או `תיאום איסוף`)
- SELLER_WINDOW_CONFIRMED_BY_BUYER: `הקונה אישר – התיאום נסגר` · SELLER_SYSTEM_CANCELLATION: `הבקשה בוטלה אוטומטית` · SELLER_PAYOUT_RELEASED: `הכסף מהמכירה בדרך אליך` · SELLER_MOVER_ASSIGNED: `שובץ מוביל לאיסוף` · SELLER_REMINDER_24H: `תזכורת: האיסוף מחר`
- BUYER_REQUEST_EXPIRED: `הבקשה שלך פגה תוקף` · BUYER_SELLER_CONFIRMED: `המוכר אישר זמינות – נחזור אליך בקרוב` · BUYER_PAYMENT_CONFIRMED: `התשלום התקבל – מתאמים משלוח` / `פרטי איסוף בפנים` · BUYER_SELF_PICKUP_CONTACTS: `פרטי המוכר לאיסוף עצמי` · SELLER_SELF_PICKUP_CONTACTS: `פרטי הקונה לאיסוף עצמי`
- BUYER_ORDER_CONFIRMATION: request-first → `בקשת הרכישה נשלחה — מאמתים זמינות`; legacy → `ההזמנה שלך התקבלה – עכשיו מתאמים זמן`
- BUYER_WINDOW_CONFIRMED: `המועד למשלוח נקבע` / `מועד האיסוף נקבע` · BUYER_DELIVERY_COMPLETED: `הרהיט הגיע – תתחדשו` · BUYER_CANCELLATION_REFUND: `ההזמנה בוטלה – הזיכוי בדרך` · BUYER_MOVER_ASSIGNED: `שובץ מוביל למשלוח שלך` · BUYER_REMINDER_24H: `תזכורת: המשלוח מחר` · BUYER/SELLER_FEEDBACK_REQUEST: `איך היתה החוויה?` · SELLER_COUNTER_OFFER_TO_BUYER: `המוכר הציע מועדים חדשים` · BUYER_COUNTER_OFFER: `הקונה מציע מועדים אחרים`
- BUYER_DISPUTE_RECEIVED: `קיבלנו את בקשת הבירור שלך` · BUYER_DISPUTE_RESOLVED: `בקשת הבירור שלך טופלה` · ADMIN_DISPUTE_ALERT: `🚨 בקשת בירור חדשה - דרושה פעולה`
- ADMIN_MOVER_ASSIGNMENT_ALERT: `נדרש שידוך מוביל – הזמנה #XXXXXXXX` · ADMIN_NEW_ORDER: `🛒 הזמנה חדשה התקבלה – #XXXXXXXX` · ADMIN_PAYOUT_READY: `💸 תשלום מוכן לשחרור – #XXXXXXXX` · ADMIN_NEW_QUESTION: `❓ שאלה חדשה מקונה – <item>` · ADMIN_SUPPORT_REQUEST: `📩 פנייה חדשה לתמיכה – <subject>` · ADMIN_SELF_PICKUP_PENDING: `⏱️ איסוף עצמי ממתין לאישור – הזמנה #XXXXXXXX` · fallback: `עדכון מ-Restyle`

**Key body copy (verbatim highlights; full HTML in `src/components/emails/HandledMailer.jsx`, already exported):**
- BUYER_ORDER_CONFIRMATION (request-first): „קיבלנו את בקשת הרכישה שלך" · „לא חויבת ולא נגבה ממך כסף" · „זו בקשת רכישה בלבד. תשלום יתבצע רק אחרי שנאמת שהפריט זמין ותבחר להמשיך." · steps: „הבקשה נשלחה — קיבלנו את הפרטים שלך ואת המועדים המבוקשים." / „אימות זמינות — נציג Restyle יוצר קשר עם המוכר תוך 24 שעות." / „שיחת תשלום — אם הפריט זמין, נחזור אליך לגביית תשלום מאובטח." / „הובלה מקצועית — אחרי התשלום נתאם מוביל שיאסוף מהמוכר וימסור עד אליך." · CTA: „מעקב אחרי הבקשה"
- Legacy variant: „קיבלנו את ההזמנה שלך. שלחנו הודעה למוכר ויש לו 24 שעות לאשר את אחד מהמועדים שבחרת." · „הכסף שלך שמור אצלנו בבטחה" · „הכסף יעבור למוכר רק אחרי שהרהיט יגיע אליך."
- SELLER_INITIAL_WINDOW_REQUEST: „יש קונה מעוניין ב<item> 🎉" · „חדשות מצוינות! קונה רוצה את הרהיט שלך. הוא הציע שני מועדים לאיסוף מהבית — בחר מה שמתאים." · buttons „מאשר את אפשרות 1/2" · „רוצה להציע מועדים אחרים?" · „⏱ מומלץ להגיב תוך 24 שעות כדי שהתהליך יתקדם." · „לאחר האישור, Restyle תתאם מוביל מקצועי שיאסוף מהבית ויבצע את המשלוח."
- BUYER_WINDOW_CONFIRMED: „המוכר אישר — ההזמנה מתקדמת" · „נציג Restyle ייצור איתך קשר בקרוב כדי להשלים תשלום ולאשר את התיאום."
- SELLER_WINDOW_CONFIRMED_BY_BUYER: „הקונה אישר — המועד נקבע" · „צוות Restyle מתאם עם הקונה את התשלום." · „ודא שהפריט מוכן ונגיש ליום האיסוף."
- SELLER_SYSTEM_CANCELLATION: „לא קיבלנו ממך תגובה בזמן, ולכן בקשת הרכישה בוטלה. הקונה לא חויב כלל." · „הפריט לא נמחק — הוא חזר למצב פעיל ואפשר לקבל עליו בקשות חדשות."
- BUYER_CANCELLATION_REFUND: reasons — „לצערנו המוכר לא אישר את הבקשה בזמן, ולכן היא בוטלה אוטומטית." / „ביטלת את הבקשה בהצלחה." / „המוכר ביטל את העסקה."; unpaid — „לא חויבת כלל … הפריט חזר להיות זמין לרכישה."; paid — „נציג Restyle ייצור איתך קשר תוך 24 שעות לטיפול בהחזר הכספי."
- BUYER_DELIVERY_COMPLETED: „הרהיט הגיע – תתחדשו!" · „יש לכם 24 שעות לוודא שהכל תקין. לאחר מכן, נעביר את התשלום למוכר." · CTA „אישור שהכל תקין"
- SELLER_PAYOUT_RELEASED: „הכסף בדרך אליך" · „העסקה הושלמה בהצלחה והפריט נמסר לקונה. שחררנו את התשלום!" · „הסכום יופיע בחשבון הבנק שלך בימים הקרובים."
- SELLER_APPROVED: „הפריט שלך מפורסם … נעדכן אותך ברגע שיהיה קונה מעוניין." · SELLER_REJECTED: „נדרש תיקון קטן … כדי לפרסם אותו נדרש תיקון קטן:" + סיבת דחייה · CTA „העלאת הפריט מחדש"
- MOVER_ASSIGNED (buyer/seller): „שיבצנו מוביל…" · „חשוב! יש להיות זמינים בטלפון בחלון הזמנים שנקבע." · seller: „ודאו שהפריט מוכן ליד הדלת / מפורק במידת הצורך."
- BUYER_DISPUTE_RECEIVED: „התשלום למוכר מוקפא עד לסיום הבדיקה … נחזור אליך עם החלטה תוך 3-5 ימי עסקים."
- Backend-generated (autoCancelStuckOrders) buyer email: „הבקשה פגה תוקף … לצערנו, המוכר לא הגיב לבקשה שלך על "<item>" בזמן, ולכן הבקשה בוטלה אוטומטית. … לא חויבת כלל … הפריט חזר להיות זמין לרכישה." CTA „חזרה לקטלוג".
- Admin escalation email (escalateStuckOrders): „🚨 מוכר לא הגיב – N שעות" · „מה עושים עכשיו?" · CTA „📞 התקשר למוכר" + link `לניהול ההזמנה במערכת` → `/AdminV2?screen=orders`.
- PromoPopup email: subject `🎉 קוד ההנחה שלך ל-50% הנחה על ההובלה - Restyle`; body: „ברוכים הבאים ל-Restyle 🎉 … רהיטים יד שנייה בסטנדרט אחר. משלוח עד הבית, חצי מחיר. … קוד ההנחה שלך: RESTYLE50 … בעמוד התשלום, הזינו את הקוד בשדה "קוד קופון" ולחצו "החל". ההנחה תחול אוטומטית על עלות ההובלה. … בתוקף למשלוחים בתל אביב בלבד · עד 1.4.26 · שימוש חד פעמי · בכפוף לזמינות".
- Note: emails BUYER_MOVER_ASSIGNED and SELLER_MOVER_ASSIGNED contain a support link to **`tom@restyle.co.il`** (different from support@ everywhere else).

---

## 8. Known Gaps & Warts (honest list — do NOT reproduce these)

1. **Order state machine drift.** Schema enum ≠ reality: `window_confirmed`, `awaiting_buyer_window_selection`, `payment_received`, `reschedule_loop` exist only in data; `paid_manual`, `in_transit`, `delivered` (as terminal path) barely/never occur. The "bible" flow, the schema, and the data are three different state machines. Rebuild from the DATA, reconcile with product intent.
2. **`payment_status=held_in_escrow` is a lie** on 88/94 orders — legacy checkout wrote it although no funds were held. `paid_at` is 0% filled even on paid orders.
3. **Identity confusion:** `Order.seller_id` holds an **email**, `Order.buyer_id` holds a user id; `Item.seller_id` is never set (identity lives in `created_by`/`seller_email`). Favorites/dashboards juggle both.
4. **No RLS anywhere.** Any authenticated user can read all orders/items/emails via the SDK. Privacy rules (phone hiding) are cosmetic.
5. **Email + order creation run in the browser.** `HandledMailer` is client-side; idempotency via EmailEvent reads. 51 failed EmailEvents. `sendgrid_message_id` is always "unknown"; the `d-...` template IDs are decorative.
6. **Admin UI graveyard:** `AdminV2` (+`AdminV2Entry`) is the live admin. `Admin`, `AdminDashboard`, `AdminCockpit`, `AdminQuickAccess`, `AdminShippingCoordination`, `AdminSupportRequests` are earlier generations still routed. `TestItems` is a dev page in production routing.
7. **Two dead automations:** reservation cleanup and weekly newsletter are disabled after 5 consecutive failures. Reservation expiry currently relies only on order-level auto-cancel.
8. **Sumit J5 never completed:** `sumitAuthorize`/`Capture`/`Void` all carry "TODO: Update endpoint after probe test" — auth-then-capture was designed, probed, and abandoned in favor of manual phone payment. `sumitCharge` (immediate charge) is the only proven path (1 order).
9. **WhatsApp integration stalled:** 3 secrets configured, frontend `WhatsAppNotifier` + agent instructions exist, zero backend usage; agent references non-existent status `out_for_delivery`.
10. **3 AI agents defined, none actually running** (no automations point at them except the disabled newsletter).
11. **Dead entities:** `Dispute` (0), `FinancialTransaction` (0), `PromoSubscriber` (0 — coupon feature shipped days ago, untested in prod). `Favorite` ×1, `AdminTask` ×1.
12. **DeliveryWindow legacy rows:** 37/61 records lack `window_type`, `option_*` fields, and `round_number` (they used the abandoned `start_datetime`/`end_datetime` format). `autoCancelStuckOrders` actively backfills `window_type:'delivery'` when touching them.
13. **Dispute-window contradictions across the product** — pick ONE in the rebuild: Terms & BuyerProtection say **12 שעות**; buyer FAQ says **48 שעות**; delivery-completed email says **24 שעות**; payout logic says delivery + **48h**.
14. **Commission contradictions:** implemented default 12% (`calcDisplayFee`), legacy 8% fallback (`pricing.jsx`), dead 15% calculator constant (HowItWorks), fossil 5%+₪15 snapshots in old orders. Real fees in data range 12%–22% because admins set display price by hand.
15. **Privacy policy names the wrong payment providers** (PAYME/Tranzila/Morning) — actual provider is Sumit.
16. **Escrow copy vs. reality:** the site and emails repeatedly promise „הכסף שלכם שמור ומוגן אצלנו" but the request-first pilot collects payment by phone and holds nothing; legal/copy review needed before rebuild reuses these texts.
17. **Hardcoded personal email everywhere:** admin alerts go to a personal Gmail (`ADMIN_EMAILS`/`ADMIN_EMAIL` constants in HandledMailer + escalateStuckOrders); two emails link support to `tom@restyle.co.il` instead of `support@restyle.co.il`.
18. **Debug leftovers in production:** `Layout.jsx` logs the full Base44 auth config to console on every mount; ShippingEngine `console.debug` on every calculation; HandledMailer `debugMode = true`.
19. **Promo system generational debris:** `HeroPromoBanner.jsx` + `launchPromoConfig.jsx` are the reversed site-wide-discount attempt (kept stubbed "for backward compatibility"); `promoConfig.jsx` + `PromoPopup` + `CouponField` are the current, never-yet-used coupon system.
20. **Category taxonomy inconsistency:** items use `כסא` while the nav/categories use `כיסא`; category filtering is substring-based to paper over this.
21. **`views_count` exists but is effectively unused/near-zero; `is_featured` mostly false; `item_story`/`reason_for_selling` adopted by almost nobody (4%).**
22. **Duplicate component files:** `src/components/ui/Container.jsx` and `src/components/ui/container.jsx` both exist (case-collision hazard on case-insensitive filesystems); two `MeasurementInput.jsx`, two admin `MoverAssignmentModal.jsx`, two `EditItemModal.jsx`.
23. **`payment_id` 95% filled with junk** from the legacy flow (placeholder strings), not real PSP references — do not migrate as meaningful.
24. **User.phone declared required but present on 1/17 users** — the platform doesn't retro-enforce; the rebuild should collect phone at signup or drop the requirement.
25. **`pages.config.js` header claims "AUTO-GENERATED"** but platform routing has since changed (new pages need explicit routes) — a trap for future edits, irrelevant post-rebuild but explains routing oddities.

**Skipped due to read-only constraint / platform visibility limits:** enabled auth providers (Google/email toggle), custom-domain DNS/redirect settings, and Sumit key environment (test/live) are dashboard-side settings not inspectable from here — verify manually in the Base44 dashboard before cutover.

---

*End of LEGACY_INTELLIGENCE.md. Nothingס in the app was created, modified, or deleted during this audit.*
