// Does a customer's phone (anon key) actually receive order status changes over
// Realtime postgres_changes? RLS applies to Realtime, and anon has no SELECT policy
// on orders — so the expectation is NO. This test proves it before we design the
// order-status page around push.
import { createClient } from '/Users/syed/Downloads/212-cafe/node_modules/@supabase/supabase-js/dist/index.mjs';

const URL = 'https://zdurieneqpgszngplgmb.supabase.co';
const ANON = 'sb_publishable_UnXoDqpHVPaRMZ9xUo5JKQ_7MM8E8gZ';

const supabase = createClient(URL, ANON, { realtime: { params: { eventsPerSecond: 10 } } });

const received = [];
let subscribed = false;

const channel = supabase
  .channel('anon-order-watch')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, (payload) => {
    received.push(payload);
    console.log('  >>> anon RECEIVED:', payload.eventType, JSON.stringify(payload.new)?.slice(0, 80));
  })
  .subscribe((status, err) => {
    console.log('  subscription status:', status, err ? String(err).slice(0, 120) : '');
    if (status === 'SUBSCRIBED') subscribed = true;
  });

await new Promise((r) => setTimeout(r, 4000));
console.log(`\n  subscribed=${subscribed}`);

// Place a real order via the RPC (anon is allowed to do this), then we will flip its
// status from the SQL side and see whether the anon channel hears about it.
const res = await fetch(`${URL}/rest/v1/rpc/place_order`, {
  method: 'POST',
  headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    p_table_token: '6f51bd1f81b868a993610d4921368cdf',
    p_idempotency_key: 'rt-probe-' + Date.now(),
    p_items: [{
      menu_item_id: 'b6d178fd-131d-424e-b1fc-174e66720724',
      quantity: 1,
      option_ids: ['2895e119-87d3-4123-9b4b-a07697cd5f29', '16af2778-5ea5-4bee-8734-9ac9a43298b7'],
    }],
  }),
});
const order = await res.json();
console.log('  placed order:', order.order_number, 'session:', order.session_token?.slice(0, 8) + '…');
console.log('\n  >>> now flip the status from SQL and watch for events (10s) <<<\n');

await new Promise((r) => setTimeout(r, 10000));

console.log(`\nRESULT: anon received ${received.length} realtime event(s)`);
console.log(received.length === 0
  ? 'CONFIRMED: RLS blocks postgres_changes for anon. Customer status page must poll get_order_status (or use Broadcast).'
  : 'UNEXPECTED: anon received events — RLS is NOT filtering Realtime. Investigate.');

console.log('\nORDER_NUMBER=' + order.order_number);
console.log('SESSION_TOKEN=' + order.session_token);
await supabase.removeAllChannels();
process.exit(0);
