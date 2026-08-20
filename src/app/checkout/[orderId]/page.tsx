import { redirect } from 'next/navigation';

/**
 * An order's own URL is not a page in its own right: an unpaid order belongs
 * at payment, a paid one belongs in the buyer's dashboard. Keeping this route
 * as a redirect means a bookmarked or emailed checkout link always lands
 * somewhere useful rather than on a stale form.
 */
export default async function CheckoutOrderPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  redirect(`/dashboard/buyer/orders/${orderId}`);
}
