import type { Enums } from '@/types/database';

/** Hebrew labels for enum values. Single source, so a status never appears
 *  with two different wordings in two different screens. */

export const CONDITION_LABELS: Record<Enums<'listing_condition'>, string> = {
  like_new: 'כמו חדש',
  excellent: 'מצב מצוין',
  good: 'מצב טוב',
  fair: 'מצב סביר',
};

export const LISTING_STATUS_LABELS: Record<Enums<'listing_status'>, string> = {
  draft: 'טיוטה',
  pending_review: 'ממתין לאישור',
  active: 'פעיל',
  reserved: 'בתהליך רכישה',
  sold: 'נמכר',
  rejected: 'נדחה',
  expired: 'פג תוקף',
  paused: 'מושהה',
  removed: 'הוסר',
};

export const ORDER_STATUS_LABELS: Record<Enums<'order_status'>, string> = {
  pending_seller_confirmation: 'ממתין לאישור המוכר',
  confirmed: 'המוכר אישר',
  delivery_scheduled: 'הובלה נקבעה',
  picked_up: 'נאסף מהמוכר',
  delivered: 'נמסר',
  completed: 'הושלם',
  cancelled: 'בוטל',
  disputed: 'בבירור',
  refunded: 'הוחזר',
};

export const OFFER_STATUS_LABELS: Record<Enums<'offer_status'>, string> = {
  pending: 'ממתינה לתשובה',
  accepted: 'התקבלה',
  declined: 'נדחתה',
  countered: 'הצעה נגדית',
  expired: 'פגה',
};

export const SHIFT_LABELS: Record<Enums<'delivery_shift'>, string> = {
  morning: 'בוקר 09:00–12:00',
  afternoon: 'צהריים 12:00–16:00',
  evening: 'ערב 16:00–19:00',
};
