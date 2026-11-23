import { HttpError } from '../core.mjs';
import { pool } from '../db.mjs';
import { related, restricted } from './access.mjs';

export const profileCoverLimit = 512 * 1024;

export async function getProfileCover(viewer, owner) {
  const { rows: [record] } = await pool.query(
    `SELECT c.jpeg FROM users u
     LEFT JOIN privacy_preferences p ON p.user_id=u.id
     LEFT JOIN friend_profile_covers c ON c.owner_id=u.id
     WHERE u.id=$2 AND ($1::uuid=u.id OR (
       ${related('$1::uuid', 'u.id')} AND NOT ${restricted('u.id', '$1::uuid')}
       AND p.profile_policy IS DISTINCT FROM 'private'
     ))`,
    [viewer, owner],
  );
  return { photo: record?.jpeg?.toString('base64') ?? null };
}

// Read the JPEG frame dimensions before storing an image other clients will decode.
function validDimensions(jpeg) {
  let offset = 2;
  while (offset + 8 < jpeg.length && jpeg[offset] === 0xff) {
    const marker = jpeg[offset + 1];
    const length = jpeg.readUInt16BE(offset + 2);
    if (length < 2 || offset + 2 + length > jpeg.length || marker === 0xda) return false;
    if ([0xc0, 0xc1, 0xc2].includes(marker)) {
      if (length < 8) return false;
      const height = jpeg.readUInt16BE(offset + 5);
      const width = jpeg.readUInt16BE(offset + 7);
      return width > 0 && height > 0 && Math.max(width, height) <= 1280;
    }
    offset += 2 + length;
  }
  return false;
}

export async function saveProfileCover(owner, photo) {
  if (photo === null) {
    await pool.query('DELETE FROM friend_profile_covers WHERE owner_id=$1', [owner]);
    return {};
  }
  if (typeof photo !== 'string' || photo.length > Math.ceil(profileCoverLimit / 3) * 4 ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(photo)) {
    throw new HttpError(400, '请选择 512 KB 以内的 JPEG 图片。');
  }
  const jpeg = Buffer.from(photo, 'base64');
  if (jpeg.length < 16 || jpeg.length > profileCoverLimit || jpeg[0] !== 0xff || jpeg[1] !== 0xd8 ||
      jpeg[2] !== 0xff || jpeg.at(-2) !== 0xff || jpeg.at(-1) !== 0xd9 || !validDimensions(jpeg)) {
    throw new HttpError(400, '请选择 512 KB 以内的 JPEG 图片。');
  }
  await pool.query(
    'INSERT INTO friend_profile_covers(owner_id,jpeg) VALUES ($1,$2) ON CONFLICT (owner_id) DO UPDATE SET jpeg=excluded.jpeg',
    [owner, jpeg],
  );
  return {};
}
