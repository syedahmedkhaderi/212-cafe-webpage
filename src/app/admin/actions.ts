'use server';

import { updateTag } from 'next/cache';
import { z } from 'zod';
import { getActionClient } from '@/lib/supabase/action';
import { TAGS } from '@/lib/cache-tags';

/**
 * Every admin mutation that touches CACHED data goes through here.
 *
 * Before this existed, admin writes went browser → Supabase REST directly. That worked
 * only because every route was `force-dynamic` with no data cache: the moment the data
 * layer is cached, a direct write leaves the public site serving stale content until the
 * cache expires on its own. That is precisely the sold-out-toggle bug, which this
 * project has already fixed once. One place that both writes and invalidates is the
 * only arrangement where the two cannot drift apart.
 *
 * `updateTag`, not `revalidateTag`. In Next 16 `revalidateTag(tag, 'max')` is
 * stale-while-revalidate — the next reader still gets the OLD menu, which is the bug
 * again. `revalidateTag(tag)` with no profile has the right semantics but is deprecated
 * and warns. `updateTag` expires the tag immediately, is the supported API for
 * read-your-own-writes, and is Server-Action-only — which is also why the upload route
 * in B2 must return a path and let an action here persist it and invalidate.
 *
 * Order status changes deliberately do NOT live here: the kitchen board needs optimistic
 * client updates, and orders are never cached.
 */

/** Shape of every action's reply. Errors are strings for the UI, never exceptions. */
type Result = { ok: true } | { ok: false; error: string };

/** A Supabase JWT, loosely shaped. Authority is checked by Postgres, not by this. */
const AccessToken = z.string().min(20).max(4096);

const Uuid = z.string().uuid();

/**
 * Supabase returns a PostgREST error for an RLS refusal rather than throwing, and the
 * raw message leaks schema detail into the browser. Map it to something a manager can
 * act on, and log the real one server-side.
 */
function fail(context: string, error: { message: string; code?: string }): Result {
  console.error(`[212] ${context} failed:`, error.code ?? '', error.message);
  return {
    ok: false,
    error:
      error.code === '42501' || /row-level security/i.test(error.message)
        ? 'Your account is not permitted to make that change.'
        : 'That change could not be saved. Please try again.',
  };
}

// ---------------------------------------------------------------- availability

/**
 * The sold-out toggle. RLS restricts `menu_items` writes to managers and above, so a
 * staff-role account reaching this action is refused by Postgres, not by a UI check.
 */
export async function setItemAvailability(
  accessToken: string,
  itemId: string,
  isAvailable: boolean,
): Promise<Result> {
  const parsed = z
    .object({ accessToken: AccessToken, itemId: Uuid, isAvailable: z.boolean() })
    .safeParse({ accessToken, itemId, isAvailable });
  if (!parsed.success) return { ok: false, error: 'Invalid request.' };

  const supabase = getActionClient(parsed.data.accessToken);
  const { error } = await supabase
    .from('menu_items')
    .update({ is_available: parsed.data.isAvailable })
    .eq('id', parsed.data.itemId);

  if (error) return fail('setItemAvailability', error);

  // The menu is on the homepage, /menu and the ordering app.
  updateTag(TAGS.menu);
  return { ok: true };
}

// ------------------------------------------------------------------ qr tokens

/**
 * Rotate a table's QR token: revoke every active token for the table, then issue one.
 *
 * Not cached, so no tag — but it belongs here anyway. Doing it from the browser meant
 * two independent REST calls with no relationship between them: if the insert failed
 * after the revoke succeeded, the table was left with NO active token and its printed
 * QR code dead, silently. Server-side the failure is at least caught and reported, and
 * the revoke is not reported as success.
 */
export async function rotateTableToken(accessToken: string, tableId: string): Promise<Result> {
  const parsed = z
    .object({ accessToken: AccessToken, tableId: Uuid })
    .safeParse({ accessToken, tableId });
  if (!parsed.success) return { ok: false, error: 'Invalid request.' };

  const supabase = getActionClient(parsed.data.accessToken);

  const { error: revokeError } = await supabase
    .from('table_qr_tokens')
    .update({ is_active: false, revoked_at: new Date().toISOString() })
    .eq('table_id', parsed.data.tableId)
    .eq('is_active', true);
  if (revokeError) return fail('rotateTableToken(revoke)', revokeError);

  const { error: insertError } = await supabase
    .from('table_qr_tokens')
    .insert({ table_id: parsed.data.tableId });
  if (insertError) {
    console.error('[212] rotateTableToken: revoked but could not issue a replacement.');
    return fail('rotateTableToken(issue)', insertError);
  }

  return { ok: true };
}
