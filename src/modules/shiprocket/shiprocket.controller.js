import catchAsync from '../../utils/catchAsync.js';
import ApiResponse from '../../utils/ApiResponse.js';
import sr from './shiprocket.service.js';
import { getNextOrderId, peekNextOrderId } from './counter/counter.model.js';
import { Order } from './models/order.model.js';
import { Followup } from './models/followup.model.js';
import { Shipment } from './models/shipment.model.js';
import { TrackingLog } from './models/trackingLog.model.js';
import { Return } from './models/return.model.js';
import ReadyToShipment from '../readytoshipment/readytoshipment.model.js';
import { Lead } from '../lead/lead.model.js';

// ── Auth ──────────────────────────────────────────────────────────────────────
export const login = catchAsync(async (req, res) => {
  const token = await sr.login();
  res.json(new ApiResponse(200, { token }, 'Shiprocket login successful'));
});

// ── Order ID helpers ──────────────────────────────────────────────────────────
export const nextOrderId = catchAsync(async (req, res) => {
  const order_id = await peekNextOrderId();
  res.json(new ApiResponse(200, { order_id }, 'Next order ID'));
});

// ── Orders ────────────────────────────────────────────────────────────────────
export const createOrder = catchAsync(async (req, res) => {
  const body = { ...req.body };
  delete body.token;

  const required = ['billing_customer_name', 'billing_address', 'billing_city', 'billing_pincode', 'billing_state', 'billing_phone'];
  const missing = required.filter((k) => !body[k]);
  if (missing.length) return res.json(new ApiResponse(400, null, `Missing: ${missing.join(', ')}`));

  // Validate phone — must be exactly 10 digits
  const phone = String(body.billing_phone).replace(/\D/g, '');
  if (phone.length !== 10) {
    return res.json(new ApiResponse(400, null, `billing_phone must be exactly 10 digits (got ${phone.length})`));
  }

  // order_date must be "YYYY-MM-DD HH:mm" format
  const rawDate = body.order_date || new Date().toISOString().split('T')[0];
  const order_date = rawDate.includes(' ') ? rawDate : `${rawDate} 10:00`;

  const order_items = (body.order_items || []).map((i) => ({
    name: String(i.name || ''),
    sku: String(i.sku || ''),
    units: Number(i.units) || 1,
    selling_price: Number(i.selling_price) || 0,
    discount: String(i.discount || '0'),
    tax: String(i.tax || ''),
    hsn: String(i.hsn || ''),
  }));

  if (!order_items.length || !order_items[0].name) {
    return res.json(new ApiResponse(400, null, 'order_items must have at least one item with a name'));
  }

  // Always use a fresh auto-generated order_id — never reuse one
  const order_id = await getNextOrderId();

  const payload = {
    order_id,
    order_date,
    pickup_location: body.pickup_location || 'Primary',
    comment: body.comment || '',
    billing_customer_name: String(body.billing_customer_name),
    billing_last_name: String(body.billing_last_name || ''),
    billing_address: String(body.billing_address),
    billing_address_2: String(body.billing_address_2 || ''),
    billing_city: String(body.billing_city),
    billing_pincode: String(body.billing_pincode),
    billing_state: String(body.billing_state),
    billing_country: String(body.billing_country || 'India'),
    billing_email: String(body.billing_email || ''),
    billing_phone: phone,
    billing_alternate_phone: String(body.billing_alternate_phone || ''),
    shipping_is_billing: 1,
    shipping_customer_name: String(body.billing_customer_name),
    shipping_last_name: String(body.billing_last_name || ''),
    shipping_address: String(body.billing_address),
    shipping_address_2: String(body.billing_address_2 || ''),
    shipping_city: String(body.billing_city),
    shipping_pincode: String(body.billing_pincode),
    shipping_country: String(body.billing_country || 'India'),
    shipping_state: String(body.billing_state),
    shipping_email: String(body.billing_email || ''),
    shipping_phone: phone,
    order_items,
    payment_method: body.payment_method || 'prepaid',
    sub_total: Number(body.sub_total) || 0,
    length: Number(body.length) || 10,
    breadth: Number(body.breadth) || 10,
    height: Number(body.height) || 10,
    weight: Number(body.weight) || 0.5,
  };

  console.log('[Shiprocket] createOrder payload:', JSON.stringify(payload, null, 2));

  const data = await sr.createOrder(payload);

  // Persist to MongoDB
  await Order.findOneAndUpdate(
    { order_id: payload.order_id },
    {
      ...payload,
      shiprocket_order_id: data?.order_id,
      shiprocket_shipment_id: data?.shipment_id,
      status: data?.status || 'NEW',
      status_code: data?.status_code,
      lead_id: body.lead_id || undefined,
      raw_response: data,
    },
    { upsert: true, returnDocument: 'after' }
  );

  // Remove from Ready to Shipment list once order is created
  if (body.lead_id) {
    await ReadyToShipment.findOneAndUpdate({ lead: body.lead_id }, { sentToShiprocket: true });
  }

  res.json(new ApiResponse(200, data, 'Order created'));
});

export const updateOrder = catchAsync(async (req, res) => {
  const { token, ...body } = req.body;
  if (!body.order_id) return res.json(new ApiResponse(400, null, 'order_id is required'));
  // order_date must include time if provided
  if (body.order_date && !body.order_date.includes(' ')) {
    body.order_date = `${body.order_date} 10:00`;
  }
  const data = await sr.updateOrder(body);
  await Order.findOneAndUpdate({ order_id: String(body.order_id) }, { raw_response: data }, { returnDocument: 'after' });
  res.json(new ApiResponse(200, data, 'Order updated'));
});

export const cancelOrders = catchAsync(async (req, res) => {
  const { ids } = req.body;
  const data = await sr.cancelOrders(ids);
  res.json(new ApiResponse(200, data, 'Orders cancelled'));
});

export const deleteLocalOrder = catchAsync(async (req, res) => {
  const { id } = req.params;
  await Order.findOneAndDelete({
    $or: [{ order_id: id }, { shiprocket_order_id: Number(id) }],
  });
  res.json(new ApiResponse(200, null, 'Order deleted from local DB'));
});

export const getOrders = catchAsync(async (req, res) => {
  const params = {};
  if (req.query.from) params.from = req.query.from;
  if (req.query.to) params.to = req.query.to;
  if (req.query.page) params.page = req.query.page;
  if (req.query.per_page) params.per_page = req.query.per_page;
  const data = await sr.getOrders(params);
  res.json(new ApiResponse(200, data, 'Orders fetched'));
});

// ── Sync all Shiprocket data into local DB ────────────────────────────────────
const toList = (raw) => {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  // Shiprocket sometimes returns object with numeric keys instead of array
  const vals = Object.values(raw);
  return vals.every(v => v && typeof v === 'object') ? vals : [];
};

const syncAllToLocal = async () => {
  // Pre-load all leads for phone enrichment — index by phone-less name AND pincode
  const allLeads = await Lead.find({ isDeleted: { $ne: true } }).select('name phone email address').lean();
  
  // Build multiple lookup maps for best-effort matching
  const byName = {}; // normalized full name → lead
  const byFirstName = {}; // first word → lead  
  const byPincode = {}; // pincode → lead (if unique)
  const pincodeCount = {};

  for (const l of allLeads) {
    if (!l.phone) continue;
    const full = (l.name || '').toLowerCase().trim();
    const first = full.split(/\s+/)[0];
    byName[full] = l;
    byFirstName[first] = l;
    // Extract pincode from address
    const pinMatch = (l.address || '').match(/\b(\d{6})\b/);
    if (pinMatch) {
      const pin = pinMatch[1];
      pincodeCount[pin] = (pincodeCount[pin] || 0) + 1;
      byPincode[pin] = l;
    }
  }
  // Remove pincodes that map to multiple leads (ambiguous)
  for (const pin of Object.keys(pincodeCount)) {
    if (pincodeCount[pin] > 1) delete byPincode[pin];
  }

  const getRealPhone = (name, pincode, maskedPhone) => {
    if (maskedPhone && !/^x+$/i.test(maskedPhone) && maskedPhone.length >= 10) return maskedPhone;
    const full = (name || '').toLowerCase().trim();
    const first = full.split(/\s+/)[0];
    const pin = String(pincode || '').trim();
    // Try: full name → first name → unique pincode
    const lead = byName[full] || byFirstName[first] || (pin && byPincode[pin]);
    return lead?.phone || maskedPhone;
  };

  // 1. Sync Orders → local DB (all pages)
  let page = 1, totalSynced = 0;
  for (;;) {
    const data = await sr.getOrders({ per_page: 100, page });
    const list = toList(data?.data);
    console.log(`[Sync] orders page=${page} count=${list.length}`);
    if (!list.length) break;
    await Promise.all(list.map(o => {
      const srId = Number(o.id);
      const shipment = o.shipments?.[0];
      return Order.findOneAndUpdate(
        { shiprocket_order_id: srId },
        { $set: {
          shiprocket_order_id: srId,
          shiprocket_shipment_id: shipment?.id ? Number(shipment.id) : undefined,
          order_id: String(o.channel_order_id || srId),
          order_date: o.created_at,
          status: o.status ? o.status.toUpperCase().replace(/ /g, '_') : 'NEW',
          ...(o.status?.toLowerCase() === 'delivered' ? { delivered_at: new Date(o.updated_at || o.created_at || Date.now()) } : {}),
          sub_total: Number(o.total) || 0,
          billing_customer_name: o.customer_name,
          billing_phone: getRealPhone(o.customer_name, o.customer_pincode, o.billing_phone || o.customer_phone),
          billing_email: o.customer_email || o.billing_email,
          billing_address: o.customer_address,
          billing_city: o.customer_city,
          billing_state: o.customer_state,
          billing_pincode: o.customer_pincode,
          billing_country: o.customer_country || 'India',
          awb_code: shipment?.awb,
          courier_id: shipment?.courier_company_id ? Number(shipment.courier_company_id) : undefined,
          courier_name: shipment?.courier,
          payment_method: o.payment_method,
          order_items: (o.products || o.order_items || []).map(p => ({
            name: p.name || p.product_name || '',
            sku: p.sku || '',
            units: Number(p.units || p.quantity) || 1,
            selling_price: Number(p.selling_price || p.price) || 0,
          })),
          raw_response: o,
        }},
        { upsert: true, returnDocument: 'after' }
      );
    }));
    totalSynced += list.length;
    const totalPages = data?.meta?.pagination?.total_pages || 1;
    if (page >= totalPages) break;
    page++;
  }
  console.log(`[Sync] orders done, total=${totalSynced}`);

  // 2. Sync Shipments → shiprocketshipments
  page = 1;
  for (;;) {
    const data = await sr.getShipments({ per_page: 100, page });
    const list = toList(data?.data);
    if (!list.length) break;
    await Promise.all(list.map(s =>
      Shipment.findOneAndUpdate(
        { shiprocket_shipment_id: Number(s.id) },
        { $set: {
          shiprocket_shipment_id: Number(s.id),
          shiprocket_order_id: Number(s.order_id),
          order_id: String(s.channel_order_id || s.order_id),
          awb_code: s.awb_code,
          courier_id: s.courier_id,
          courier_name: s.courier_name || s.courier,
          status: s.status,
          raw_response: s,
        }},
        { upsert: true, returnDocument: 'after' }
      )
    ));
    const totalPages = data?.meta?.pagination?.total_pages || 1;
    if (page >= totalPages) break;
    page++;
  }

  // 4. Auto-move leads to 'follow_up' status when order delivered today
  const todayStart = new Date(); todayStart.setHours(0,0,0,0);
  const todayEnd = new Date(); todayEnd.setHours(23,59,59,999);

  // Find orders delivered today (updatedAt today, status DELIVERED)
  const deliveredToday = await Order.find({
    status: { $in: ['DELIVERED', 'Delivered'] },
    lead_id: { $exists: true, $ne: null },
    updatedAt: { $gte: todayStart, $lte: todayEnd },
  }).select('lead_id billing_customer_name billing_phone').lean();

  // Also match by phone for orders without lead_id
  const deliveredTodayAll = await Order.find({
    status: { $in: ['DELIVERED', 'Delivered'] },
    updatedAt: { $gte: todayStart, $lte: todayEnd },
  }).select('lead_id billing_customer_name billing_phone billing_pincode').lean();

  for (const o of deliveredTodayAll) {
    let leadId = o.lead_id;
    if (!leadId && o.billing_phone && !/^x+$/i.test(o.billing_phone)) {
      const lead = await Lead.findOne({ phone: o.billing_phone, isDeleted: { $ne: true } }).select('_id status').lean();
      leadId = lead?._id;
    }
    if (leadId) {
      await Lead.findByIdAndUpdate(leadId, { status: 'follow_up' });
      console.log(`[Sync] Lead ${leadId} moved to follow_up (order delivered today)`);
    }
  }
  console.log(`[Sync] Checked ${deliveredTodayAll.length} delivered-today orders for lead follow-up`);

  // Auto-set follow-ups for all delivered orders that don't have them yet
  const needsFollowUps = await Order.find({
    status: { $in: ['DELIVERED', 'Delivered'] },
    auto_followups_set: { $ne: true },
  }).select('_id delivered_at createdAt').lean();

  for (const o of needsFollowUps) {
    const deliveredAt = o.delivered_at || o.createdAt || new Date();
    await setAutoFollowUps(o._id, deliveredAt);
    console.log(`[Sync] Auto follow-ups set for order ${o._id}`);
  }
  console.log(`[Sync] Auto follow-ups set for ${needsFollowUps.length} orders`);
};

export const syncShiprocket = catchAsync(async (req, res) => {
  await syncAllToLocal();
  res.json(new ApiResponse(200, null, 'Sync complete'));
});

// Sync cooldown - only sync once every 5 minutes
let lastSyncTime = 0;
const SYNC_COOLDOWN_MS = 5 * 60 * 1000;

export const getDeliveredOrders = catchAsync(async (req, res) => {
  const { search, page = 1, per_page = 1000, delivered_from, delivered_to } = req.query;

  // Return both DELIVERED and RTO_DELIVERED — frontend filters
  const statusMatch = { status: { $in: ['DELIVERED', 'RTO_DELIVERED', 'Delivered', 'RTO Delivered', 'delivered', 'rto_delivered'] } };

  if (delivered_from || delivered_to) {
    statusMatch.delivered_at = {};
    if (delivered_from) statusMatch.delivered_at.$gte = new Date(delivered_from);
    if (delivered_to) statusMatch.delivered_at.$lte = new Date(delivered_to + 'T23:59:59');
  }

  const match = search ? {
    ...statusMatch,
    $or: [
      { billing_customer_name: { $regex: search, $options: 'i' } },
      { billing_phone: { $regex: search, $options: 'i' } },
      { order_id: { $regex: search, $options: 'i' } },
      { awb_code: { $regex: search, $options: 'i' } },
    ],
  } : statusMatch;

  const skip = (Number(page) - 1) * Number(per_page);
  const [orders, total] = await Promise.all([
    Order.find(match).sort({ createdAt: -1 }).skip(skip).limit(Number(per_page))
      .populate('lead_id', 'phone email').lean(),
    Order.countDocuments(match),
  ]);

  // Enrich masked phones from Lead collection
  const allLeads = await Lead.find({ isDeleted: { $ne: true } }).select('name phone email address').lean();
  const byName = {}, byFirst = {}, byPincode = {}, pinCount = {};
  for (const l of allLeads) {
    if (!l.phone) continue;
    const full = (l.name || '').toLowerCase().trim();
    byName[full] = l;
    byFirst[full.split(/\s+/)[0]] = l;
    const pm = (l.address || '').match(/\b(\d{6})\b/);
    if (pm) { pinCount[pm[1]] = (pinCount[pm[1]] || 0) + 1; byPincode[pm[1]] = l; }
  }
  for (const p of Object.keys(pinCount)) { if (pinCount[p] > 1) delete byPincode[p]; }

  const getPhone = (name, pincode, masked) => {
    if (masked && !/^x+$/i.test(masked) && masked.length >= 10) return masked;
    const full = (name || '').toLowerCase().trim();
    const pin = String(pincode || '').trim();
    const lead = byName[full] || byFirst[full.split(/\s+/)[0]] || (pin && byPincode[pin]);
    return lead?.phone || masked;
  };

  const enriched = orders.map(o => {
    if (o.lead_id?.phone) return { ...o, billing_phone: o.lead_id.phone };
    const phone = getPhone(o.billing_customer_name, o.billing_pincode, o.billing_phone);
    return phone !== o.billing_phone ? { ...o, billing_phone: phone } : o;
  });

  res.json(new ApiResponse(200, { data: enriched, total, page: Number(page), per_page: Number(per_page) }, 'Delivered orders fetched'));
});

// Auto-schedule 5 follow-ups every 8 days from delivery date — stored in followups collection
const setAutoFollowUps = async (orderId, deliveredAt) => {
  const base = new Date(deliveredAt);
  const ops = Array.from({ length: 5 }, (_, i) => {
    const scheduled_date = new Date(base);
    scheduled_date.setDate(scheduled_date.getDate() + i * 8);
    return {
      updateOne: {
        filter: { order_id: orderId, followup_number: i + 1 },
        update: { $setOnInsert: { order_id: orderId, followup_number: i + 1, scheduled_date, completed: false } },
        upsert: true,
      },
    };
  });
  await Followup.bulkWrite(ops);
  await Order.findByIdAndUpdate(orderId, { auto_followups_set: true });
};

export const completeFollowUp = catchAsync(async (req, res) => {
  const { id } = req.params;
  const note = req.body?.note;

  // If no followup records exist, create them first
  const count = await Followup.countDocuments({ order_id: id });
  if (count === 0) {
    const order = await Order.findById(id).select('delivered_at createdAt').lean();
    await setAutoFollowUps(id, order?.delivered_at || order?.createdAt || new Date());
  }

  const current = await Followup.findOne({ order_id: id, completed: false }).sort({ followup_number: 1 });
  if (!current) return res.json(new ApiResponse(200, { completedCount: 5, next_follow_up: null }, 'All follow-ups done'));

  current.completed = true;
  current.completed_at = new Date();
  if (note) current.note = note;
  await current.save();

  const next = await Followup.findOne({ order_id: id, completed: false }).sort({ followup_number: 1 });
  const completedCount = current.followup_number;
  const next_follow_up = next?.scheduled_date || null;

  await Order.findByIdAndUpdate(id, { next_follow_up: next_follow_up || null });
  res.json(new ApiResponse(200, { completedCount, next_follow_up }, 'Follow-up completed'));
});

export const saveOrderNote = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { notes } = req.body;
  const order = await Order.findByIdAndUpdate(id, { notes }, { new: true }).select('notes').lean();
  res.json(new ApiResponse(200, order, 'Note saved'));
});

export const addFollowUp = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { note, next_follow_up } = req.body;
  // Also save as a manual entry in followups collection
  const existing = await Followup.countDocuments({ order_id: id });
  await Followup.create({
    order_id: id,
    followup_number: existing + 1,
    scheduled_date: next_follow_up ? new Date(next_follow_up) : new Date(),
    note: note || '',
    completed: false,
  });
  const order = await Order.findByIdAndUpdate(
    id,
    { ...(next_follow_up ? { next_follow_up: new Date(next_follow_up) } : {}) },
    { new: true }
  ).select('follow_ups next_follow_up').lean();
  res.json(new ApiResponse(200, order, 'Follow up added'));
});

export const setNextFollowUp = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { next_follow_up } = req.body;
  const order = await Order.findByIdAndUpdate(
    id,
    { next_follow_up: next_follow_up ? new Date(next_follow_up) : null },
    { new: true }
  ).select('follow_ups next_follow_up').lean();
  res.json(new ApiResponse(200, order, 'Next follow up set'));
});

export const getOrdersWithFollowUps = catchAsync(async (req, res) => {
  const delivered = await Order.find(
    { status: { $in: ['DELIVERED', 'Delivered', 'delivered'] } },
    { next_follow_up: 1, billing_customer_name: 1, billing_phone: 1,
      billing_city: 1, billing_state: 1, billing_pincode: 1, billing_address: 1,
      billing_email: 1, order_id: 1, shiprocket_order_id: 1, order_items: 1,
      sub_total: 1, awb_code: 1, courier_name: 1, status: 1, delivered_at: 1,
      auto_followups_set: 1, createdAt: 1, payment_method: 1, notes: 1 }
  ).sort({ delivered_at: -1, createdAt: -1 }).lean();

  // AWAIT — save followups to DB before responding so button works immediately
  const needsSetting = delivered.filter(o => !o.auto_followups_set);
  if (needsSetting.length) {
    await Promise.all(needsSetting.map(o =>
      setAutoFollowUps(o._id, o.delivered_at || o.createdAt || new Date())
    ));
  }

  const orderIds = delivered.map(o => o._id);
  const allFollowups = await Followup.find({ order_id: { $in: orderIds } }).sort({ followup_number: 1 }).lean();

  const fuMap = {};
  for (const fu of allFollowups) {
    const key = String(fu.order_id);
    if (!fuMap[key]) fuMap[key] = [];
    fuMap[key].push(fu);
  }

  // Enrich masked phones from Lead collection
  const allLeads = await Lead.find({ isDeleted: { $ne: true } }).select('name phone address').lean();
  const byName = {}, byFirst = {}, byPin = {}, pinCount = {};
  for (const l of allLeads) {
    if (!l.phone) continue;
    const full = (l.name || '').toLowerCase().trim();
    byName[full] = l;
    byFirst[full.split(/\s+/)[0]] = l;
    const pm = (l.address || '').match(/\b(\d{6})\b/);
    if (pm) { pinCount[pm[1]] = (pinCount[pm[1]] || 0) + 1; byPin[pm[1]] = l; }
  }
  for (const p of Object.keys(pinCount)) { if (pinCount[p] > 1) delete byPin[p]; }

  const enriched = delivered.map(o => {
    if (o.billing_phone && !/^x+$/i.test(o.billing_phone) && o.billing_phone.length >= 10) return { ...o, followups: fuMap[String(o._id)] || [] };
    const full = (o.billing_customer_name || '').toLowerCase().trim();
    const pin = String(o.billing_pincode || '').trim();
    const lead = byName[full] || byFirst[full.split(/\s+/)[0]] || (pin && byPin[pin]);
    const phone = lead?.phone || o.billing_phone;
    return { ...o, billing_phone: phone, followups: fuMap[String(o._id)] || [] };
  });

  res.json(new ApiResponse(200, enriched, 'Orders with follow-ups fetched'));
});

export const getDeliveredOrdersLive = catchAsync(async (req, res) => {
  // Fetch all delivered orders from Shiprocket live API (exact status match)
  let pg = 1, collected = [];
  for (;;) {
    const data = await sr.getOrders({ per_page: 100, page: pg });
    const list = data?.data || [];
    if (!list.length) break;
    // Only exact 'Delivered', exclude RTO_DELIVERED etc.
    collected = [...collected, ...list.filter(o => o.status?.toLowerCase() === 'delivered')];
    const totalPages = data?.meta?.pagination?.total_pages || 1;
    if (pg >= totalPages) break;
    pg++;
  }

  // Build phone map from ALL leads (name → phone)
  const allLeads = await Lead.find({ isDeleted: { $ne: true } })
    .select('name phone email')
    .lean();

  // Map: first-word-of-name (lowercase) → lead
  const phoneMap = {};
  for (const l of allLeads) {
    if (!l.phone) continue;
    const words = (l.name || '').toLowerCase().trim().split(/\s+/);
    // Index by full name and first name
    phoneMap[l.name.toLowerCase().trim()] = { phone: l.phone, email: l.email };
    if (words[0]) phoneMap[words[0]] = { phone: l.phone, email: l.email };
  }

  const enriched = collected.map(o => {
    const fullName = (o.customer_name || '').toLowerCase().trim();
    const firstName = fullName.split(/\s+/)[0];
    const match = phoneMap[fullName] || phoneMap[firstName];
    return { ...o, real_phone: match?.phone || null, real_email: match?.email || null };
  });

  res.json(new ApiResponse(200, { data: enriched, total: enriched.length }, 'Live delivered orders'));
});

export const getDeliveredStats = catchAsync(async (req, res) => {
  const { filterType, year, month, from, to } = req.query;

  // Build date match filter
  const dateMatch = {};
  if (filterType === 'yearly' && year) {
    dateMatch.createdAt = {
      $gte: new Date(`${year}-01-01`),
      $lt: new Date(`${Number(year) + 1}-01-01`),
    };
  } else if (filterType === 'monthly' && year && month) {
    const m = Number(month);
    dateMatch.createdAt = {
      $gte: new Date(`${year}-${String(m).padStart(2,'0')}-01`),
      $lt: new Date(m === 12 ? `${Number(year)+1}-01-01` : `${year}-${String(m+1).padStart(2,'0')}-01`),
    };
  } else if (filterType === 'range' && from && to) {
    dateMatch.createdAt = {
      $gte: new Date(from),
      $lte: new Date(to + 'T23:59:59'),
    };
  }

  const [result, statusBreakdown] = await Promise.all([
    Order.aggregate([
      { $match: { status: /^delivered$/i, ...dateMatch } },
      { $group: { _id: null, count: { $sum: 1 }, revenue: { $sum: '$sub_total' } } },
    ]),
    Order.aggregate([
      { $match: { ...dateMatch } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
  ]);
  const { count = 0, revenue = 0 } = result[0] || {};
  res.json(new ApiResponse(200, { count, revenue, statusBreakdown }, 'Delivered stats'));

  const now = Date.now();
  if (!filterType && now - lastSyncTime > SYNC_COOLDOWN_MS) {
    lastSyncTime = now;
    syncAllToLocal().catch(e => console.error('[Sync] error:', e.message));
  }
});

export const getOrder = catchAsync(async (req, res) => {
  const data = await sr.getOrder(req.params.id);
  res.json(new ApiResponse(200, data, 'Order fetched'));
});

// ── Courier ───────────────────────────────────────────────────────────────────
export const checkServiceability = catchAsync(async (req, res) => {
  const params = { ...req.query };
  delete params.token;
  const data = await sr.checkServiceability(params);
  res.json(new ApiResponse(200, data, 'Serviceability fetched'));
});

export const getCourierListWithCounts = catchAsync(async (req, res) => {
  const data = await sr.getCourierListWithCounts();
  res.json(new ApiResponse(200, data, 'Courier list fetched'));
});

export const assignAWB = catchAsync(async (req, res) => {
  const { shipment_id, courier_id } = req.body;
  const data = await sr.assignAWB(shipment_id, courier_id);
  console.log('[assignAWB] response:', JSON.stringify(data));
  // awb_assign_status: 0 = failed (can be at root or nested under response.data)
  const assignStatus = data?.awb_assign_status ?? data?.response?.data?.awb_assign_status;
  if (assignStatus === 0) {
    const errMsg = data?.response?.data && typeof data.response.data === 'string'
      ? data.response.data
      : data?.message || 'AWB assignment failed. Try a different courier.';
    return res.json(new ApiResponse(200, data, errMsg));
  }
  const awb = data?.awb_code || data?.response?.data?.awb_code;
  if (awb && shipment_id) {
    await Shipment.findOneAndUpdate(
      { shiprocket_shipment_id: Number(shipment_id) },
      { awb_code: awb, courier_id: Number(courier_id), raw_response: data },
      { upsert: true, returnDocument: 'after' }
    );
    await Order.findOneAndUpdate({ shiprocket_shipment_id: Number(shipment_id) }, { awb_code: awb, courier_id: Number(courier_id) });
  }
  res.json(new ApiResponse(200, data, 'AWB assigned successfully'));
});

export const reassignCourier = catchAsync(async (req, res) => {
  const { token, ...body } = req.body;
  const data = await sr.reassignCourier(body);
  res.json(new ApiResponse(200, data, 'Courier reassigned'));
});

// ── Shipments ─────────────────────────────────────────────────────────────────
export const getShipments = catchAsync(async (req, res) => {
  const data = await sr.getShipmentsWithDetails(req.query);
  res.json(new ApiResponse(200, data, 'Shipments fetched'));
});

export const getShipment = catchAsync(async (req, res) => {
  const data = await sr.getShipment(req.params.id);
  res.json(new ApiResponse(200, data, 'Shipment fetched'));
});

export const cancelShipment = catchAsync(async (req, res) => {
  const { awbs } = req.body;
  const data = await sr.cancelShipment(awbs);
  res.json(new ApiResponse(200, data, 'Shipment cancelled'));
});

// ── Label / Manifest ──────────────────────────────────────────────────────────
export const generateLabel = catchAsync(async (req, res) => {
  const { shipment_id } = req.body;
  const data = await sr.generateLabel(shipment_id);
  if (data?.label_url && shipment_id) {
    await Shipment.findOneAndUpdate(
      { shiprocket_shipment_id: Number(shipment_id) },
      { label_url: data.label_url },
      { upsert: true, returnDocument: 'after' }
    );
  }
  res.json(new ApiResponse(200, data, 'Label generated'));
});

export const generateManifest = catchAsync(async (req, res) => {
  const { shipment_id } = req.body;
  const data = await sr.generateManifest(shipment_id);
  if (data?.manifest_url && shipment_id) {
    await Shipment.findOneAndUpdate(
      { shiprocket_shipment_id: Number(shipment_id) },
      { manifest_url: data.manifest_url },
      { upsert: true, returnDocument: 'after' }
    );
  }
  res.json(new ApiResponse(200, data, 'Manifest generated'));
});

export const printManifest = catchAsync(async (req, res) => {
  const { order_ids } = req.body;
  const data = await sr.printManifest(order_ids);
  res.json(new ApiResponse(200, data, 'Manifest print URL fetched'));
});

export const printInvoice = catchAsync(async (req, res) => {
  const { ids } = req.body;
  const data = await sr.printInvoice(ids);
  res.json(new ApiResponse(200, data, 'Invoice print URL fetched'));
});

// ── Pickup ────────────────────────────────────────────────────────────────────
export const generatePickup = catchAsync(async (req, res) => {
  const { shipment_id } = req.body;
  const data = await sr.generatePickup(shipment_id);
  if (data?.pickup_scheduled_date && shipment_id) {
    await Shipment.findOneAndUpdate(
      { shiprocket_shipment_id: Number(shipment_id) },
      { pickup_scheduled_date: data.pickup_scheduled_date, pickup_token_number: data.pickup_token_number },
      { upsert: true, returnDocument: 'after' }
    );
  }
  res.json(new ApiResponse(200, data, 'Pickup generated'));
});

export const cancelPickup = catchAsync(async (req, res) => {
  const { token, ...body } = req.body;
  const data = await sr.cancelPickup(body);
  res.json(new ApiResponse(200, data, 'Pickup cancelled'));
});

export const getPickupLocations = catchAsync(async (req, res) => {
  const data = await sr.getPickupLocations();
  res.json(new ApiResponse(200, data, 'Pickup locations fetched'));
});

// ── Tracking ──────────────────────────────────────────────────────────────────
export const trackByAWB = catchAsync(async (req, res) => {
  const { awb } = req.params;
  const data = await sr.trackByAWB(awb);
  await TrackingLog.create({
    awb_code: awb,
    current_status: data?.tracking_data?.current_status,
    current_status_id: data?.tracking_data?.current_status_id,
    shipment_track: data?.tracking_data?.shipment_track,
    shipment_track_activities: data?.tracking_data?.shipment_track_activities,
    raw_response: data,
  });
  res.json(new ApiResponse(200, data, 'Tracking info fetched'));
});

export const trackByShipment = catchAsync(async (req, res) => {
  const data = await sr.trackByShipment(req.params.id);
  await TrackingLog.create({
    shipment_id: Number(req.params.id),
    current_status: data?.tracking_data?.current_status,
    raw_response: data,
  });
  res.json(new ApiResponse(200, data, 'Tracking info fetched'));
});

// ── Returns ───────────────────────────────────────────────────────────────────
export const createReturn = catchAsync(async (req, res) => {
  const { token, ...body } = req.body;
  const data = await sr.createReturn(body);
  await Return.create({
    shiprocket_order_id: data?.order_id,
    shiprocket_shipment_id: data?.shipment_id,
    order_id: String(body.order_id || ''),
    awb_code: data?.awb_code,
    return_reason: body.return_reason,
    raw_response: data,
  });
  res.json(new ApiResponse(200, data, 'Return created'));
});

export const getReturns = catchAsync(async (req, res) => {
  try {
    const data = await sr.getReturns(req.query);
    res.json(new ApiResponse(200, data, 'Returns fetched'));
  } catch (e) {
    res.json(new ApiResponse(200, { data: [] }, e.message));
  }
});

// ── Wallet ────────────────────────────────────────────────────────────────────
export const getWalletBalance = catchAsync(async (req, res) => {
  const data = await sr.getWalletBalance();
  res.json(new ApiResponse(200, data, 'Wallet balance fetched'));
});

export const getWalletTransactions = catchAsync(async (req, res) => {
  try {
    const data = await sr.getWalletTransactions(req.query);
    res.json(new ApiResponse(200, data, 'Wallet transactions fetched'));
  } catch (e) {
    res.json(new ApiResponse(200, { data: [] }, e.message));
  }
});

// ── NDR ───────────────────────────────────────────────────────────────────────
export const getNDR = catchAsync(async (req, res) => {
  try {
    const data = await sr.getNDR(req.query);
    res.json(new ApiResponse(200, data, 'NDR fetched'));
  } catch (e) {
    res.json(new ApiResponse(200, { data: [] }, e.message));
  }
});

export const ndrAction = catchAsync(async (req, res) => {
  const { token, ...body } = req.body;
  const data = await sr.ndrAction(body);
  res.json(new ApiResponse(200, data, 'NDR action submitted'));
});

// ── Webhook ───────────────────────────────────────────────────────────────────
const WEBHOOK_EVENTS = {
  6: 'SHIPPED',
  8: 'IN_TRANSIT',
  17: 'OUT_FOR_DELIVERY',
  7: 'DELIVERED',
  9: 'RTO_INITIATED',
  16: 'RTO_DELIVERED',
};

export const webhook = catchAsync(async (req, res) => {
  const payload = req.body;
  const statusId = payload?.current_status_id || payload?.status_id;
  const awb = payload?.awb || payload?.awb_code;
  const shipmentId = payload?.shipment_id;
  const orderId = payload?.order_id;
  const event = WEBHOOK_EVENTS[statusId] || payload?.current_status || 'UNKNOWN';

  // Log every webhook event
  await TrackingLog.create({
    awb_code: awb,
    shipment_id: shipmentId ? Number(shipmentId) : undefined,
    order_id: orderId ? String(orderId) : undefined,
    current_status: event,
    current_status_id: statusId,
    raw_response: payload,
  });

  // Update order status
  if (orderId) {
    const updatedOrder = await Order.findOneAndUpdate(
      { shiprocket_order_id: Number(orderId) },
      { status: event, ...(event === 'DELIVERED' ? { delivered_at: new Date() } : {}) },
      { new: true }
    ).select('lead_id billing_phone billing_customer_name').lean();

    // Auto-move lead to follow_up when delivered + set auto follow-ups
    if (event === 'DELIVERED' && updatedOrder) {
      let leadId = updatedOrder.lead_id;
      if (!leadId && updatedOrder.billing_phone && !/^x+$/i.test(updatedOrder.billing_phone)) {
        const lead = await Lead.findOne({ phone: updatedOrder.billing_phone, isDeleted: { $ne: true } }).select('_id').lean();
        leadId = lead?._id;
      }
      if (leadId) {
        await Lead.findByIdAndUpdate(leadId, { status: 'follow_up' });
        console.log(`[Webhook] Lead ${leadId} moved to follow_up (DELIVERED)`);
      }
      if (!updatedOrder.auto_followups_set) {
        await setAutoFollowUps(updatedOrder._id, new Date());
        console.log(`[Webhook] Auto follow-ups set for order ${updatedOrder._id}`);
      }
    }
  }

  // Update shipment status
  if (shipmentId) {
    await Shipment.findOneAndUpdate(
      { shiprocket_shipment_id: Number(shipmentId) },
      { status: event, awb_code: awb || undefined }
    );
  }

  res.json({ success: true, event });
});
