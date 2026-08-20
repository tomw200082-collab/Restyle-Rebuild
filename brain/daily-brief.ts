/**
 * The morning brief. Hebrew, markdown, for a person about to start their day.
 *
 *   npm run brief                    # print it
 *   npm run brief -- --out=path.md   # write it
 *
 * Order is the whole design. Anomalies first, because a stuck order is a cron
 * job that did not run and every hour it waits costs a customer. Then seller
 * responsiveness, because 72% of legacy orders died there and it is the
 * business rather than a metric. Then the queue, which is the growth ceiling.
 * Money is fourth: it is the number everyone wants first and the one they can
 * least act on before lunch.
 *
 * Read-only. `brain/queries.ts` has no write path and takes the anon key.
 */
import { writeFile } from 'node:fs/promises';
import { loadEnv } from '../scripts/release-gate/env';
import { snapshot, type BrainSnapshot } from './queries';
import { count, days, delta, hebrewDate, hours, pct, row, shekels } from './format';

loadEnv();

function anomalies(s: BrainSnapshot): string[] {
  const out: string[] = [];

  if (s.stuck.length) {
    out.push(
      `**${count(s.stuck.length)} הזמנות תקועות מעבר לחלון שלהן.** ` +
        'זה כמעט תמיד אומר שג\'וב מתוזמן לא רץ — בדקו את ops/KILL_SWITCH ואת לוג ה-cron.',
    );
    for (const order of s.stuck.slice(0, 5)) {
      out.push(`  - \`${order.id.slice(0, 8)}\` — ${order.status}, ${hours(order.age_hours)} — ${order.why}`);
    }
  }

  if (s.sellerResponse && s.sellerResponse.sellers_paused > 0) {
    out.push(
      `**${count(s.sellerResponse.sellers_paused)} מוכרים מושהים.** ` +
        'הפריטים שלהם ירדו מהקטלוג אחרי אי-מענה חוזר. ' +
        '/admin/listings?status=paused כדי להחזיר אותם.',
    );
  }

  if (s.reviewQueue && (s.reviewQueue.oldest_hours ?? 0) > 24) {
    out.push(
      `**פריט ממתין לאישור ${hours(s.reviewQueue.oldest_hours)}.** ` +
        'תור הבדיקה הוא תקרת הצמיחה — פריט שממתין הוא מלאי שלא יכול להימכר.',
    );
  }

  const margin = s.delivery.reduce((sum, d) => sum + Number(d.margin_agorot), 0);
  if (s.delivery.length && margin < 0) {
    out.push(
      `**מרווח ההובלה שלילי: ${shekels(margin)}.** ` +
        'זו בדיוק הסיבה שתוספת הפריט הגדול קיימת — הטבלה למטה מראה איפה.',
    );
  }

  return out;
}

export function render(s: BrainSnapshot): string {
  const [yesterday, dayBefore] = s.days;
  const week = s.days.slice(0, 7);
  const weekGmv = week.reduce((sum, d) => sum + Number(d.gmv_agorot), 0);
  const weekTake = week.reduce((sum, d) => sum + Number(d.take_agorot), 0);

  const lines: string[] = [
    `# בוקר טוב — ${hebrewDate(s.at)}`,
    '',
    `_מקור: ${s.target} · נוצר ${new Date(s.at).toISOString()}_`,
    '',
  ];

  // --- anomalies, first -----------------------------------------------------
  const problems = anomalies(s);
  lines.push('## מה דורש תשומת לב');
  lines.push('');
  if (problems.length) {
    lines.push(...problems.map((p) => (p.startsWith('  ') ? p : `- ${p}`)));
  } else {
    lines.push('אין חריגות. כל ההזמנות בתוך החלונות שלהן, אין מוכרים מושהים, ותור הבדיקה נקי.');
  }
  lines.push('');

  // --- seller responsiveness ------------------------------------------------
  if (s.sellerResponse) {
    const r = s.sellerResponse;
    lines.push('## מענה מוכרים');
    lines.push('');
    lines.push(
      `שיעור אישור: **${pct(r.confirm_rate_pct)}** · זמן ממוצע לאישור: ${hours(r.avg_hours_to_confirm)}`,
    );
    lines.push('');
    lines.push(row('בקשות', 'אושרו', 'פגו', 'ממתינות עכשיו'));
    lines.push(row('---', '---', '---', '---'));
    lines.push(row(count(r.requests), count(r.confirmed), count(r.timed_out), count(r.awaiting_now)));
    lines.push('');
    if (r.awaiting_now > 0) {
      lines.push(`> ${count(r.awaiting_now)} הזמנות ממתינות למוכר ברגע זה. זה המספר שהרג את הפיילוט.`);
      lines.push('');
    }
  }

  // --- the queue ------------------------------------------------------------
  if (s.reviewQueue) {
    lines.push('## תור הבדיקה');
    lines.push('');
    lines.push(
      `${count(s.reviewQueue.waiting)} פריטים ממתינים · הוותיק ביותר ${hours(s.reviewQueue.oldest_hours)} · ` +
        `המתנה ממוצעת ${hours(s.reviewQueue.avg_wait_hours)}`,
    );
    lines.push('');
  }

  // --- money ---------------------------------------------------------------
  lines.push('## כסף');
  lines.push('');
  if (yesterday) {
    lines.push(row('', 'אתמול', 'שינוי', '7 ימים'));
    lines.push(row('---', '---', '---', '---'));
    lines.push(
      row(
        'מחזור',
        shekels(yesterday.gmv_agorot),
        dayBefore ? delta(Number(yesterday.gmv_agorot), Number(dayBefore.gmv_agorot), 'money') : '—',
        shekels(weekGmv),
      ),
    );
    lines.push(
      row(
        'עמלה',
        shekels(yesterday.take_agorot),
        dayBefore ? delta(Number(yesterday.take_agorot), Number(dayBefore.take_agorot), 'money') : '—',
        shekels(weekTake),
      ),
    );
    lines.push(
      row(
        'הזמנות',
        count(yesterday.orders_created),
        dayBefore ? delta(yesterday.orders_created, dayBefore.orders_created) : '—',
        count(week.reduce((sum, d) => sum + d.orders_created, 0)),
      ),
    );
    lines.push(
      row('זיכויים', shekels(yesterday.refunded_agorot), '—', shekels(week.reduce((sum, d) => sum + Number(d.refunded_agorot), 0))),
    );
  } else {
    lines.push('אין עדיין הזמנות. הקטלוג חי, המחזור אפס.');
  }
  lines.push('');

  // --- catalogue ------------------------------------------------------------
  if (s.sellThrough) {
    const c = s.sellThrough;
    lines.push('## קטלוג');
    lines.push('');
    lines.push(
      `${count(c.active_listings)} פעילים · ${count(c.sold_listings)} נמכרו · ` +
        `${count(c.paused_listings)} מושהים · ${count(c.expired_listings)} פג תוקף`,
    );
    lines.push('');
    lines.push(`שיעור מכירה: **${pct(c.sell_through_pct)}** · חציון זמן למכירה: ${days(c.median_days_to_sale)}`);
    lines.push('');
  }

  // --- delivery margin ------------------------------------------------------
  if (s.delivery.length) {
    lines.push('## מרווח הובלה');
    lines.push('');
    lines.push(row('גודל', 'אזור', 'הובלות', 'לידזמן', 'נגבה', 'עלות', 'מרווח'));
    lines.push(row('---', '---', '---', '---', '---', '---', '---'));
    for (const d of s.delivery) {
      lines.push(
        row(
          d.size_class === 'bulky' ? 'גדול' : 'רגיל',
          d.zone,
          count(d.deliveries),
          days(d.avg_lead_days),
          shekels(d.charged_agorot),
          shekels(d.actual_cost_agorot),
          shekels(d.margin_agorot),
        ),
      );
    }
    lines.push('');
  }

  // --- liquidity ------------------------------------------------------------
  if (s.liquidity.length) {
    lines.push('## נזילות לפי קטגוריה');
    lines.push('');
    lines.push(row('קטגוריה', 'פעילים', 'מתוכם גדולים', 'נמכרו', 'שיעור מכירה', 'מחיר ממוצע'));
    lines.push(row('---', '---', '---', '---', '---', '---'));
    for (const c of s.liquidity.slice(0, 12)) {
      lines.push(
        row(
          c.category,
          count(c.active_listings),
          count(c.active_bulky),
          count(c.sold_listings),
          pct(c.sell_through_pct),
          c.avg_active_price_agorot ? shekels(c.avg_active_price_agorot) : '—',
        ),
      );
    }
    lines.push('');
  }

  // --- offers ---------------------------------------------------------------
  if (s.offers && s.offers.total_offers > 0) {
    const o = s.offers;
    lines.push('## הצעות מחיר');
    lines.push('');
    lines.push(
      `${count(o.total_offers)} הצעות · קבלה ${pct(o.acceptance_pct)} · ` +
        `הצעה ממוצעת ${pct(o.avg_offer_pct_of_ask)} מהמחיר המבוקש`,
    );
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push(
    '_כל המספרים מגיעים מה-views ב-`brain_*`. מספר שחושב מחדש בסקריפט מפסיק להסכים ' +
      'עם הדשבורד תוך חודש, ואז אף אחד לא יודע מה נכון._',
  );
  lines.push('');

  return lines.join('\n');
}

async function main() {
  const outArg = process.argv.find((a) => a.startsWith('--out='));
  const s = await snapshot();
  const brief = render(s);

  if (outArg) {
    const path = outArg.split('=')[1]!;
    await writeFile(path, brief, 'utf8');
    console.log(path);
  } else {
    console.log(brief);
  }
}

// Only when run directly; `render` is imported by the weekly report and by tests.
if (process.argv[1]?.endsWith('daily-brief.ts')) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
