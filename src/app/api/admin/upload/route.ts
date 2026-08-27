import { NextResponse, type NextRequest } from 'next/server';
import sharp from 'sharp';
import { getActionClient } from '@/lib/supabase/action';

/**
 * Media upload for /admin/content.
 *
 * A Route Handler rather than a Server Action because it streams a file body. Note that
 * it therefore must NOT call `updateTag` — that throws outside a Server Action. This
 * endpoint returns a path; the action that persists the path is what invalidates.
 *
 * Four checks, in this order, because each is cheap relative to the next:
 *
 *   1. Size, from Content-Length and again from the actual bytes. A declared length is
 *      a claim, not a fact.
 *   2. Real file type by MAGIC BYTES, never the declared Content-Type or the filename.
 *      `.png` renamed to `.jpg` is the trivial case; the one that matters is a file
 *      whose declared type is an image and whose contents are not.
 *   3. Dimensions, so a "decompression bomb" — a 400 KB PNG that expands to 60000×60000
 *      — cannot exhaust memory when sharp decodes it.
 *   4. Re-encode through sharp to WebP. This is the one that actually matters: the
 *      output is generated from decoded pixels, so EXIF, colour-profile payloads,
 *      trailing appended archives and polyglot files that are simultaneously a valid
 *      image and a valid script do not survive. Whatever went in, what comes out is
 *      pixels.
 *
 * Authorisation is not done here. The upload runs as the signed-in manager via their
 * forwarded token, and Storage RLS ('managers upload media') is the boundary — so a
 * staff-role token is refused by Postgres, not by a check in this file that could be
 * forgotten.
 */

export const runtime = 'nodejs'; // sharp needs it; the edge runtime cannot run this

const MAX_BYTES = 8 * 1024 * 1024;
const MAX_DIMENSION = 6000;
/** Long edge of the stored image. Larger than any slot on the site, small enough to serve. */
const OUTPUT_MAX_EDGE = 2400;

/** Leading bytes that actually identify a format. */
const MAGIC: { ext: string; test: (b: Buffer) => boolean }[] = [
  { ext: 'jpeg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    ext: 'png',
    test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  {
    ext: 'webp',
    test: (b) => b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP',
  },
  { ext: 'gif', test: (b) => b.subarray(0, 6).toString('ascii').startsWith('GIF8') },
  // AVIF/HEIC: 'ftyp' box at offset 4.
  { ext: 'avif', test: (b) => b.subarray(4, 8).toString('ascii') === 'ftyp' },
];

const bad = (status: number, error: string) => NextResponse.json({ error }, { status });

export async function POST(request: NextRequest) {
  const auth = request.headers.get('authorization') ?? '';
  const accessToken = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!accessToken) return bad(401, 'Not signed in.');

  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > MAX_BYTES) return bad(413, 'That image is larger than 8 MB.');

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return bad(400, 'Could not read the upload.');
  }

  const file = form.get('file');
  if (!(file instanceof File)) return bad(400, 'No file was attached.');

  const bytes = Buffer.from(await file.arrayBuffer());
  // Checked again against the real bytes: Content-Length is a claim.
  if (bytes.byteLength > MAX_BYTES) return bad(413, 'That image is larger than 8 MB.');
  if (bytes.byteLength < 16) return bad(400, 'That file is empty or truncated.');

  const magic = MAGIC.find((m) => m.test(bytes));
  if (!magic) {
    // Deliberately does not say which types are allowed by extension — the point is
    // that the extension was never consulted.
    return bad(415, 'That file is not an image. Only JPEG, PNG, WebP, GIF or AVIF.');
  }

  let meta;
  try {
    meta = await sharp(bytes, { limitInputPixels: MAX_DIMENSION * MAX_DIMENSION }).metadata();
  } catch {
    return bad(415, 'That image could not be read.');
  }
  if (!meta.width || !meta.height) return bad(415, 'That image has no readable dimensions.');
  if (meta.width > MAX_DIMENSION || meta.height > MAX_DIMENSION) {
    return bad(413, `That image is larger than ${MAX_DIMENSION}×${MAX_DIMENSION}.`);
  }

  let output: Buffer;
  try {
    output = await sharp(bytes, { limitInputPixels: MAX_DIMENSION * MAX_DIMENSION })
      .rotate() // bake in EXIF orientation before the EXIF is discarded
      .resize({ width: OUTPUT_MAX_EDGE, height: OUTPUT_MAX_EDGE, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82, effort: 5 })
      .toBuffer();
  } catch {
    return bad(422, 'That image could not be processed.');
  }

  // Predictable, collision-free, and never derived from the user-supplied filename —
  // which would otherwise be a path-traversal and content-type-confusion surface.
  const objectPath = `uploads/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.webp`;

  const supabase = getActionClient(accessToken);
  const { error } = await supabase.storage.from('media').upload(objectPath, output, {
    contentType: 'image/webp',
    cacheControl: '31536000',
    upsert: false,
  });

  if (error) {
    console.error('[212] upload failed:', error.message);
    return bad(403, 'Your account is not permitted to upload media.');
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from('media').getPublicUrl(objectPath);

  return NextResponse.json({
    path: publicUrl,
    objectPath,
    width: Math.min(meta.width, OUTPUT_MAX_EDGE),
    height: Math.min(meta.height, OUTPUT_MAX_EDGE),
    bytes: output.byteLength,
  });
}
