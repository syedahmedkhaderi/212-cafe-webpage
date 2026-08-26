import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getMenu } from '@/lib/menu/queries';
import { resolveTableToken } from '@/lib/order/table';
import { OrderApp } from '@/components/ordering/OrderApp';

// A guest's table page must never be cached or prerendered: availability changes
// while they are sitting there.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Order at your table',
  robots: { index: false, follow: false }, // table URLs must never reach a search index
};

export default async function TableOrderPage({
  params,
}: {
  params: Promise<{ tableToken: string }>;
}) {
  const { tableToken } = await params;

  // Resolved server-side. An enumerated, revoked or malformed token 404s — the
  // client never gets to decide whether a token is valid.
  const table = await resolveTableToken(tableToken);
  if (!table) notFound();

  const { categories, items } = await getMenu();

  return (
    <OrderApp
      tableToken={tableToken}
      tableLabel={table.label}
      categories={categories}
      items={items}
    />
  );
}
