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

// ------------------------------------------------------------------- site copy

/**
 * Save one copy string, in both languages.
 *
 * Length is bounded because these render into a fixed layout: a 40 000-character
 * "headline" does not fail, it just destroys the page, and nothing in the database
 * would explain why.
 */
export async function saveContent(
  accessToken: string,
  key: string,
  valueEn: string,
  valueAr: string,
): Promise<Result> {
  const parsed = z
    .object({
      accessToken: AccessToken,
      // Keys are identifiers we generate, never free text from the client.
      key: z.string().min(1).max(64).regex(/^[A-Za-z][A-Za-z0-9_]*$/),
      valueEn: z.string().max(2000),
      valueAr: z.string().max(2000),
    })
    .safeParse({ accessToken, key, valueEn, valueAr });
  if (!parsed.success) return { ok: false, error: 'Invalid request.' };

  const supabase = getActionClient(parsed.data.accessToken);
  const { error } = await supabase
    .from('site_content')
    .update({ value_en: parsed.data.valueEn, value_ar: parsed.data.valueAr })
    .eq('key', parsed.data.key);

  if (error) return fail('saveContent', error);

  updateTag(TAGS.content);
  return { ok: true };
}

// ----------------------------------------------------------------------- theme

/**
 * Appearance: brand colours, fonts, hero image and its framing.
 *
 * Every field is validated to the same shape the database CHECK constraints enforce, so
 * the UI can explain a rejection instead of surfacing a Postgres error. The constraints
 * are still the real boundary — this is a better message, not a substitute.
 *
 * Colours are hex-only. These values are interpolated into a CSS custom-property block
 * on every page, so free text would be a stylesheet injection.
 */
const HEX = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Colours must be a six-digit hex value.');

const ThemeInput = z.object({
  brand_ink: HEX,
  brand_bone: HEX,
  brand_brass: HEX,
  display_font: z.enum(['Cormorant Garamond', 'Inter']),
  body_font: z.enum(['Inter', 'Cormorant Garamond']),
  // Either a local /hero/... or /menu/... path, or a Supabase Storage URL from the
  // upload route. Anything else — javascript:, data:, another origin — is refused.
  hero_image_path: z.string().max(500).refine(isAllowedImagePath, 'Unrecognised image location.'),
  hero_portrait_path: z.string().max(500).refine(isAllowedImagePath, 'Unrecognised image location.'),
  hero_focal_x: z.number().int().min(0).max(100),
  hero_focal_y: z.number().int().min(0).max(100),
  // Bounded: past ~1.4 the hero is visibly upscaled, and its source is already small.
  hero_zoom: z.number().min(1).max(1.4),
  corner_radius: z.enum(['none', 'sm', 'md', 'lg']),
});

export type ThemeInput = z.infer<typeof ThemeInput>;

function isAllowedImagePath(value: string): boolean {
  if (value.startsWith('/hero/') || value.startsWith('/menu/')) return true;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return Boolean(base && value.startsWith(`${base}/storage/v1/object/public/media/`));
}

export async function saveTheme(accessToken: string, theme: unknown): Promise<Result> {
  const token = AccessToken.safeParse(accessToken);
  if (!token.success) return { ok: false, error: 'Invalid request.' };

  const parsed = ThemeInput.safeParse(theme);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Those settings are not valid.' };
  }

  const supabase = getActionClient(token.data);
  const { error } = await supabase.from('site_theme').update(parsed.data).eq('id', 1);
  if (error) return fail('saveTheme', error);

  // Theme drives the hero and the colour tokens on every page.
  updateTag(TAGS.theme);
  return { ok: true };
}

// ------------------------------------------------------------- menu presentation

/** Promote or demote a signature item. */
export async function setItemSignature(
  accessToken: string,
  itemId: string,
  isSignature: boolean,
): Promise<Result> {
  const parsed = z
    .object({ accessToken: AccessToken, itemId: Uuid, isSignature: z.boolean() })
    .safeParse({ accessToken, itemId, isSignature });
  if (!parsed.success) return { ok: false, error: 'Invalid request.' };

  const supabase = getActionClient(parsed.data.accessToken);
  const { error } = await supabase
    .from('menu_items')
    .update({ is_signature: parsed.data.isSignature })
    .eq('id', parsed.data.itemId);
  if (error) return fail('setItemSignature', error);

  updateTag(TAGS.menu);
  return { ok: true };
}

/** Replace an item's photograph, or a category's. */
export async function setImagePath(
  accessToken: string,
  table: 'menu_items' | 'menu_categories',
  id: string,
  imagePath: string,
): Promise<Result> {
  const parsed = z
    .object({
      accessToken: AccessToken,
      table: z.enum(['menu_items', 'menu_categories']),
      id: Uuid,
      imagePath: z.string().max(500).refine(isAllowedImagePath, 'Unrecognised image location.'),
    })
    .safeParse({ accessToken, table, id, imagePath });
  if (!parsed.success) {
    return { ok: false, error: 'That image location is not one this site can serve.' };
  }

  const supabase = getActionClient(parsed.data.accessToken);
  const { error } = await supabase
    .from(parsed.data.table)
    .update({ image_path: parsed.data.imagePath })
    .eq('id', parsed.data.id);
  if (error) return fail('setImagePath', error);

  updateTag(TAGS.menu);
  return { ok: true };
}

/**
 * Approve a drafted description as the café's own.
 *
 * Only ever moves `draft` → `cafe`, never the reverse: this records that a human read it
 * and agreed, and nothing in the UI should be able to un-say that by accident.
 */
export async function approveDraftCopy(accessToken: string, itemId: string): Promise<Result> {
  const parsed = z
    .object({ accessToken: AccessToken, itemId: Uuid })
    .safeParse({ accessToken, itemId });
  if (!parsed.success) return { ok: false, error: 'Invalid request.' };

  const supabase = getActionClient(parsed.data.accessToken);
  const { error } = await supabase
    .from('menu_items')
    .update({ copy_source: 'cafe' })
    .eq('id', parsed.data.itemId)
    .eq('copy_source', 'draft');
  if (error) return fail('approveDraftCopy', error);

  updateTag(TAGS.menu);
  return { ok: true };
}
