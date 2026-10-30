// Business rules for the customer address book. Controllers call these; the model only
// knows SQL. Default-address bookkeeping runs in a transaction so a customer can never
// end up with two (or zero) defaults after a half-completed edit.
import { pool } from '../config/db.js';
import { ApiError } from '../utils/ApiError.js';
import * as addressModel from '../models/addressModel.js';

const toPublic = (a) => ({
  id: a.id,
  label: a.label,
  recipient: a.recipient,
  phone: a.phone,
  line1: a.line1,
  line2: a.line2,
  city: a.city,
  province: a.province,
  postalCode: a.postal_code,
  country: a.country,
  isDefault: Boolean(a.is_default),
  createdAt: a.created_at,
  updatedAt: a.updated_at,
});

// Normalise a request body into the exact field set the model writes, applying the
// one column the client never controls (country) its default.
function fromBody(body) {
  return {
    label: body.label?.trim() || 'Home',
    recipient: body.recipient.trim(),
    phone: body.phone.trim(),
    line1: body.line1.trim(),
    line2: body.line2?.trim() || null,
    city: body.city.trim(),
    province: body.province?.trim() || null,
    postalCode: body.postalCode?.trim() || null,
    country: body.country?.trim() || 'Rwanda',
    isDefault: Boolean(body.isDefault),
  };
}

export async function list(userId) {
  return (await addressModel.listForUser(userId)).map(toPublic);
}

export async function get(userId, id) {
  const row = await addressModel.findById(userId, id);
  if (!row) throw new ApiError(404, 'Address not found.');
  return toPublic(row);
}

// The first address a customer saves is automatically the default, whether or not they
// ticked the box — checkout always needs one pre-filled destination.
export async function create(userId, body) {
  const isFirst = (await addressModel.countForUser(userId)) === 0;
  const data = fromBody(body);
  const wantDefault = data.isDefault || isFirst;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    if (wantDefault) await addressModel.clearDefaults(userId, conn);
    const id = await addressModel.insertAddress(userId, { ...data, isDefault: wantDefault }, conn);
    await conn.commit();
    return get(userId, id);
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export async function update(userId, id, body) {
  const existing = await addressModel.findById(userId, id);
  if (!existing) throw new ApiError(404, 'Address not found.');

  const data = fromBody(body);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    // Editing an address never silently changes which one is default; that is the
    // dedicated PATCH endpoint. We just honour an explicit isDefault:true here.
    if (data.isDefault) {
      await addressModel.clearDefaults(userId, conn);
      await addressModel.updateAddress(userId, id, data, conn);
      await addressModel.markDefault(userId, id, conn);
    } else {
      await addressModel.updateAddress(userId, id, { ...data, isDefault: Boolean(existing.is_default) }, conn);
    }
    await conn.commit();
    return get(userId, id);
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export async function makeDefault(userId, id) {
  const existing = await addressModel.findById(userId, id);
  if (!existing) throw new ApiError(404, 'Address not found.');

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await addressModel.clearDefaults(userId, conn);
    await addressModel.markDefault(userId, id, conn);
    await conn.commit();
    return get(userId, id);
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export async function remove(userId, id) {
  const existing = await addressModel.findById(userId, id);
  if (!existing) throw new ApiError(404, 'Address not found.');

  await addressModel.softDelete(userId, id);
  // Deleting the default would leave checkout with no pre-filled address; promote one.
  if (existing.is_default) await addressModel.promoteFallbackDefault(userId);
}
