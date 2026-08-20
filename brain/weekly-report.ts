/**
 * The weekly report. Week over week, not day over day.
 *
 *   npm run weekly                    # print it
 *   npm run weekly -- --out=path.md   # write it
 *
 * Different question from the daily brief, and the difference is the point.
 * The brief asks "what needs attention this morning" and is mostly about
 * anomalies. This asks "is it working", and a single day cannot answer that —
 * one good Tuesday is noise, and every metric here is volatile enough at
 * Restyle's volume that a day-over-day comparison would mostly measure the
 * weather.
 *
 * Read-only. `brain/queries.ts` has no write path.
 */
import { writeFile } from 'node:fs/promises';
import { loadEnv } from '../scripts/release-gate/env';
import { snapshot, type BrainSnapshot, type DailyMoney } from './queries';
import { count, hebrewDate, pct, row, shekels } from './format';

loadEnv();

type WeekTotals = {
  gmv: number;
  take: number;
  delivery: number;
  refunds: number;
  created: number;
  completed: number;
  cancelled: number;
};

function totals(days: DailyMoney[]): WeekTotals {
  return days.reduce<WeekTotals>(
    (acc, d) => ({
      gmv: acc.gmv + Number(d.gmv_agorot),
      take: acc.take + Number(d.take_agorot),
      delivery: acc.delivery + Number(d.delivery_revenue_agorot),
      refunds: acc.refunds + Number(d.refunded_agorot),
      created: acc.created + d.orders_created,
      completed: acc.completed + d.orders_completed,
      cancelled: acc.cancelled + d.orders_cancelled,
    }),
    { gmv: 0, take: 0, delivery: 0, refunds: 0, created: 0, completed: 0, cancelled: 0 },
  );
}

/**
 * Percentage change, with the two cases that break a naive one stated:
 * a zero base is "new", not infinity, and two zeroes are "—", not NaN. Both
 * happen constantly in the first weeks of a marketplace.
 */
function trend(now: number, before: number): string {
  if (before === 0 && now === 0) return '—';
  if (before === 0) return 'חדש';
  const change = Math.round(((now - before) / before) * 100);
  if (change === 0) return 'ללא שינוי';
  return change > 0 ? `▲ ${change}%` : `▼ ${Math.abs(change)}%`;
}

export function render(s: BrainSnapshot): string {
  // `days` arrives newest-first from the view.
  const thisWeek = totals(s.days.slice(0, 7));
  const lastWeek = totals(s.days.slice(7, 14));

  const lines: string[] = [
    `# דוח שבועי — ${hebrewDate(s.at)}`,
    '',
    `_מקור: ${s.target} · שבעה ימים אחרונים מול השבעה שלפניהם_`,
    '',
    '## מגמות',
    '',
    row('', 'השבוע', 'שבוע קודם', 'שינוי'),
    row('---', '---', '---', '---'),
    row('מחזור', shekels(thisWeek.gmv), shekels(lastWeek.gmv), trend(thisWeek.gmv, lastWeek.gmv)),
    row('עמלה', shekels(thisWeek.take), shekels(lastWeek.take), trend(thisWeek.take, lastWeek.take)),
    row(
      'הכנסות הובלה',
      shekels(thisWeek.delivery),
      shekels(lastWeek.delivery),
      trend(thisWeek.delivery, lastWeek.delivery),
    ),
    row('זיכויים', shekels(thisWeek.refunds), shekels(lastWeek.refunds), trend(thisWeek.refunds, lastWeek.refunds)),
    row(
      'הזמנות',
      count(thisWeek.created),
      count(lastWeek.created),
      trend(thisWeek.created, lastWeek.created),
    ),
    row(
      'הושלמו',
      count(thisWeek.completed),
      count(lastWeek.completed),
      trend(thisWeek.completed, lastWeek.completed),
    ),
    row(
      'בוטלו',
      count(thisWeek.cancelled),
      count(lastWeek.cancelled),
      trend(thisWeek.cancelled, lastWeek.cancelled),
    ),
    '',
  ];

  // Cancellation rate is the one ratio worth naming outright: it is the metric
  // the whole seller-confirmation design exists to move. [D-43], [D-74]
  if (thisWeek.created > 0) {
    const rate = Math.round((thisWeek.cancelled / thisWeek.created) * 100);
    lines.push(`שיעור ביטול השבוע: **${rate}%** מתוך ${count(thisWeek.created)} הזמנות.`);
    if (rate > 30) {
      lines.push('');
      lines.push(
        '> מעל 30%. בפלטפורמה הישנה 72% מההזמנות מתו בהמתנה למוכר — כדאי לבדוק את ' +
          'לוח `מענה מוכרים` לפני שמחפשים סיבה אחרת.',
      );
    }
    lines.push('');
  }

  if (s.sellerResponse) {
    const r = s.sellerResponse;
    lines.push('## מענה מוכרים');
    lines.push('');
    lines.push(
      `שיעור אישור מצטבר: **${pct(r.confirm_rate_pct)}** · ` +
        `${count(r.timed_out)} פגו · ${count(r.sellers_paused)} מוכרים מושהים`,
    );
    lines.push('');
  }

  if (s.delivery.length) {
    lines.push('## מרווח הובלה לפי גודל פריט');
    lines.push('');
    lines.push('התוספת לפריט גדול קיימת כדי לסגור את הפער הזה. הטבלה אומרת אם היא סגרה אותו.');
    lines.push('');
    lines.push(row('גודל', 'אזור', 'הובלות', 'נגבה', 'עלות', 'מרווח'));
    lines.push(row('---', '---', '---', '---', '---', '---'));
    for (const d of s.delivery) {
      lines.push(
        row(
          d.size_class === 'bulky' ? 'גדול' : 'רגיל',
          d.zone,
          count(d.deliveries),
          shekels(d.charged_agorot),
          shekels(d.actual_cost_agorot),
          shekels(d.margin_agorot),
        ),
      );
    }
    lines.push('');
  }

  if (s.liquidity.length) {
    // Both tails, because they are opposite actions: dead inventory to clear,
    // and demand the platform is failing to supply.
    const dead = s.liquidity.filter((c) => c.active_listings >= 3 && (c.sell_through_pct ?? 0) < 10);
    const hot = s.liquidity.filter((c) => (c.sell_through_pct ?? 0) > 40);

    lines.push('## נזילות');
    lines.push('');
    if (hot.length) {
      lines.push(
        `**ביקוש גבוה:** ${hot.map((c) => `${c.category} (${pct(c.sell_through_pct)})`).join(' · ')} — ` +
          'שווה לחפש מוכרים בקטגוריות האלה.',
      );
      lines.push('');
    }
    if (dead.length) {
      lines.push(
        `**מלאי תקוע:** ${dead.map((c) => `${c.category} (${count(c.active_listings)} פעילים)`).join(' · ')} — ` +
          'פריטים שתופסים מקום בקטלוג ולא נמכרים.',
      );
      lines.push('');
    }
    if (!hot.length && !dead.length) {
      lines.push('אין קצוות ברורים — אף קטגוריה לא בולטת לטובה או לרעה.');
      lines.push('');
    }
  }

  if (s.sellThrough) {
    lines.push('## קטלוג');
    lines.push('');
    lines.push(
      `${count(s.sellThrough.active_listings)} פעילים · שיעור מכירה ${pct(s.sellThrough.sell_through_pct)} · ` +
        `${count(s.sellThrough.paused_listings)} מושהים · ${count(s.sellThrough.expired_listings)} פג תוקף`,
    );
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push('_כל המספרים מה-views ב-`brain_*`. ראו `brain/README.md`._');
  lines.push('');

  return lines.join('\n');
}

async function main() {
  const outArg = process.argv.find((a) => a.startsWith('--out='));
  // 14 days, so the week-over-week comparison has both halves.
  const s = await snapshot(14);
  const report = render(s);

  if (outArg) {
    const path = outArg.split('=')[1]!;
    await writeFile(path, report, 'utf8');
    console.log(path);
  } else {
    console.log(report);
  }
}

if (process.argv[1]?.endsWith('weekly-report.ts')) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
