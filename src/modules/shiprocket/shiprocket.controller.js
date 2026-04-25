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
  if (body.order_date && !body.order_date.includes(' ')) {
    body.order_date = `${body.order_date} 10:00`;
  }
  const data = await sr.updateOrder(body);
  await Order.findOneAndUpdate(
    { $or: [{ shiprocket_order_id: Number(body.order_id) }, { order_id: String(body.order_id) }] },
    { raw_response: data },
    { returnDocument: 'after' }
  );
  res.json(new ApiResponse(200, data, 'Order updated'));
});

export const cancelOrders = catchAsync(async (req, res) => {
  const { ids } = req.body;
  const data = await sr.cancelOrders(ids);
  res.json(new ApiResponse(200, data, 'Orders cancelled'));
});

export const deleteLocalOrder = catchAsync(async (req, res) => {
  const { id } = req.params;
  await Order.findOneAndDelete({ $or: [{ order_id: id }, { shiprocket_order_id: Number(id) }] });
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
  const vals = Object.values(raw);
  return vals.every(v => v && typeof v === 'object') ? vals : [];
};

const syncAllToLocal = async () => {
  const allLeads = await Lead.find({ isDeleted: { $ne: true } }).select('name phone email address').lean();
  const byName = {};
  const byPincode = {};
  const pincodeCount = {};

  for (const l of allLeads) {
    const full = (l.name || '').toLowerCase().trim();
    byName[full] = l;
    const pinMatch = (l.address || '').match(/\b(\d{6})\b/);
    if (pinMatch) {
      const pin = pinMatch[1];
      pincodeCount[pin] = (pincodeCount[pin] || 0) + 1;
      byPincode[pin] = l;
    }
  }
  for (const pin of Object.keys(pincodeCount)) {
    if (pincodeCount[pin] > 1) delete byPincode[pin];
  }

  const findLead = (name, pincode, maskedPhone) => {
    const digits = String(maskedPhone || '').replace(/\D/g, '');
    if (digits.length >= 10 && !/^x+$/i.test(maskedPhone)) {
      const match = allLeads.find(l => String(l.phone).replace(/\D/g, '').includes(digits));
      if (match) return match;
    }
    const full = (name || '').toLowerCase().trim();
    const pin = String(pincode || '').trim();
    let match = byName[full];
    if (!match) {
      const words = full.split(/\s+/).filter(w => w.length > 2);
      if (words.length > 0) {
        match = Object.entries(byName).find(([k]) => words.every(w => k.includes(w)))?.[1];
      }
    }
    if (!match && pin) match = byPincode[pin];
    return match;
  };

  let page = 1, totalSynced = 0;
  for (;;) {
    const data = await sr.getOrders({ per_page: 100, page });
    const list = toList(data?.data);
    if (!list.length) break;
    await Promise.all(list.map(o => {
      const srId = Number(o.id);
      const shipment = o.shipments?.[0];
      const lead = findLead(o.customer_name, o.customer_pincode, o.billing_phone || o.customer_phone);
      return Order.findOneAndUpdate(
        { shiprocket_order_id: srId },
        { $set: {
          shiprocket_order_id: srId,
          shiprocket_shipment_id: shipment?.id ? Number(shipment.id) : undefined,
          order_id: String(o.channel_order_id || srId),
          order_date: o.created_at,
          status: o.status ? o.status.toUpperCase().replace(/ /g, '_') : 'NEW',
          ...(o.status?.toLowerCase() === 'delivered' ? { delivered_at: new Date(o.updated_at || o.created_at || Date.now()) } : {}),
          status_updated_at: new Date(o.updated_at || o.created_at || Date.now()),
          sub_total: Number(o.total) || 0,
          lead_id: lead?._id,
          billing_customer_name: o.customer_name,
          billing_phone: lead?.phone || o.billing_phone || o.customer_phone,
          billing_email: lead?.email || o.customer_email || o.billing_email,
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

  page = 1;
  for (;;) {
    const data = await sr.getShipments({ per_page: 100, page });
    const list = toList(data?.data);
    if (!list.length) break;
    await Promise.all(list.map(s => Shipment.findOneAndUpdate(
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
    )));
    const totalPages = data?.meta?.pagination?.total_pages || 1;
    if (page >= totalPages) break;
    page++;
  }

  const todayStart = new Date(); todayStart.setHours(0,0,0,0);
  const todayEnd = new Date(); todayEnd.setHours(23,59,59,999);
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
    if (leadId) await Lead.findByIdAndUpdate(leadId, { status: 'follow_up' });
  }

  const needsFollowUps = await Order.find({
    status: { $in: ['DELIVERED', 'Delivered'] },
    auto_followups_set: { $ne: true },
  }).select('_id delivered_at createdAt').lean();

  for (const o of needsFollowUps) {
    await setAutoFollowUps(o._id, o.delivered_at || o.createdAt || new Date());
  }
};

export const syncShiprocket = catchAsync(async (req, res) => {
  await syncAllToLocal();
  res.json(new ApiResponse(200, null, 'Sync complete'));
});

let lastSyncTime = 0;
const SYNC_COOLDOWN_MS = 5 * 60 * 1000;

export const getDeliveredOrders = catchAsync(async (req, res) => {
  const { search, page = 1, per_page = 1000, delivered_from, delivered_to } = req.query;
  const statusMatch = { status: { $in: ['DELIVERED', 'RTO_DELIVERED', 'Delivered', 'RTO Delivered', 'delivered', 'rto_delivered'] } };
  if (delivered_from || delivered_to) {
    statusMatch.delivered_at = {};
    if (delivered_from) statusMatch.delivered_at.$gte = new Date(delivered_from);
    if (delivered_to) statusMatch.delivered_at.$lte = new Date(delivered_to + 'T23:59:59');
  }
  const match = search ? {
    ...statusMatch,
    $or: [{ billing_customer_name: { $regex: search, $options: 'i' } }, { billing_phone: { $regex: search, $options: 'i' } }, { order_id: { $regex: search, $options: 'i' } }, { awb_code: { $regex: search, $options: 'i' } }],
  } : statusMatch;
  const skip = (Number(page) - 1) * Number(per_page);
  const [orders, total] = await Promise.all([
    Order.find(match).sort({ createdAt: -1 }).skip(skip).limit(Number(per_page)).populate('lead_id', 'phone email').lean(),
    Order.countDocuments(match),
  ]);

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
    return { ...o, billing_phone: phone };
  });
  res.json(new ApiResponse(200, { data: enriched, total, page: Number(page), per_page: Number(per_page) }, 'Delivered orders fetched'));
});

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
  const count = await Followup.countDocuments({ order_id: id });
  if (count === 0) {
    const order = await Order.findById(id).select('delivered_at createdAt').lean();
    await setAutoFollowUps(id, order?.delivered_at || order?.createdAt || new Date());
  }
  const current = await Followup.findOne({ order_id: id, completed: false }).sort({ followup_number: 1 });
  if (!current) return res.json(new ApiResponse(200, { completedCount: 5, next_follow_up: null }, 'All follow-ups done'));
  current.completed = true;
  current.completed_at = new Date();
  if (req.body?.note) current.note = req.body.note;
  await current.save();
  const next = await Followup.findOne({ order_id: id, completed: false }).sort({ followup_number: 1 });
  await Order.findByIdAndUpdate(id, { next_follow_up: next?.scheduled_date || null });
  res.json(new ApiResponse(200, { completedCount: current.followup_number, next_follow_up: next?.scheduled_date || null }, 'Follow-up completed'));
});

export const saveOrderNote = catchAsync(async (req, res) => {
  const order = await Order.findByIdAndUpdate(req.params.id, { notes: req.body.notes }, { new: true }).select('notes').lean();
  res.json(new ApiResponse(200, order, 'Note saved'));
});

export const addFollowUp = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { note, next_follow_up } = req.body;
  const existing = await Followup.countDocuments({ order_id: id });
  await Followup.create({ order_id: id, followup_number: existing + 1, scheduled_date: next_follow_up ? new Date(next_follow_up) : new Date(), note: note || '', completed: false });
  const order = await Order.findByIdAndUpdate(id, { ...(next_follow_up ? { next_follow_up: new Date(next_follow_up) } : {}) }, { new: true }).select('follow_ups next_follow_up').lean();
  res.json(new ApiResponse(200, order, 'Follow up added'));
});

export const setNextFollowUp = catchAsync(async (req, res) => {
  const order = await Order.findByIdAndUpdate(req.params.id, { next_follow_up: req.body.next_follow_up ? new Date(req.body.next_follow_up) : null }, { new: true }).select('follow_ups next_follow_up').lean();
  res.json(new ApiResponse(200, order, 'Next follow up set'));
});

export const getOrdersWithFollowUps = catchAsync(async (req, res) => {
  const delivered = await Order.find({ status: { $in: ['DELIVERED', 'Delivered', 'delivered'] } }).sort({ delivered_at: -1, createdAt: -1 }).lean();
  const needsSetting = delivered.filter(o => !o.auto_followups_set);
  if (needsSetting.length) {
    await Promise.all(needsSetting.map(o => setAutoFollowUps(o._id, o.delivered_at || o.createdAt || new Date())));
  }
  const allFollowups = await Followup.find({ order_id: { $in: delivered.map(o => o._id) } }).sort({ followup_number: 1 }).lean();
  const fuMap = {};
  for (const fu of allFollowups) {
    const key = String(fu.order_id);
    if (!fuMap[key]) fuMap[key] = [];
    fuMap[key].push(fu);
  }
  const allLeads = await Lead.find({ isDeleted: { $ne: true } }).select('name phone address').lean();
  const byName = {}, byPin = {}, pinCount = {};
  for (const l of allLeads) {
    if (!l.phone) continue;
    const full = (l.name || '').toLowerCase().trim();
    byName[full] = l;
    const pm = (l.address || '').match(/\b(\d{6})\b/);
    if (pm) { pinCount[pm[1]] = (pinCount[pm[1]] || 0) + 1; byPin[pm[1]] = l; }
  }
  for (const p of Object.keys(pinCount)) { if (pinCount[p] > 1) delete byPin[p]; }

  const enriched = delivered.map(o => {
    const followups = fuMap[String(o._id)] || [];
    if (o.billing_phone && !/^x+$/i.test(o.billing_phone) && String(o.billing_phone).replace(/\D/g, '').length >= 10) return { ...o, followups };
    const full = (o.billing_customer_name || '').toLowerCase().trim();
    let lead = byName[full];
    if (!lead) {
      const words = full.split(/\s+/);
      lead = Object.entries(byName).find(([k]) => words.every(w => k.includes(w)))?.[1];
    }
    if (!lead && o.billing_pincode) lead = byPin[String(o.billing_pincode).trim()];
    return { ...o, billing_phone: lead?.phone || o.billing_phone, followups };
  });
  res.json(new ApiResponse(200, enriched, 'Orders with follow-ups fetched'));
});

export const getDeliveredOrdersLive = catchAsync(async (req, res) => {
  let pg = 1, collected = [];
  for (;;) {
    const data = await sr.getOrders({ per_page: 100, page: pg });
    const list = data?.data || [];
    if (!list.length) break;
    collected = [...collected, ...list.filter(o => o.status?.toLowerCase() === 'delivered')];
    if (pg >= (data?.meta?.pagination?.total_pages || 1)) break;
    pg++;
  }
  const allLeads = await Lead.find({ isDeleted: { $ne: true } }).select('name phone email').lean();
  const phoneMap = {};
  for (const l of allLeads) {
    if (!l.phone) continue;
    phoneMap[l.name.toLowerCase().trim()] = { phone: l.phone, email: l.email };
    const first = l.name.toLowerCase().trim().split(/\s+/)[0];
    if (first) phoneMap[first] = { phone: l.phone, email: l.email };
  }
  const enriched = collected.map(o => {
    const fullName = (o.customer_name || '').toLowerCase().trim();
    const match = phoneMap[fullName] || phoneMap[fullName.split(/\s+/)[0]];
    return { ...o, real_phone: match?.phone || null, real_email: match?.email || null };
  });
  res.json(new ApiResponse(200, { data: enriched, total: enriched.length }, 'Live delivered orders'));
});

const INDIA_TIME_OFFSET = '+05:30';
const startOfIndiaDate = (date) => new Date(`${date}T00:00:00.000${INDIA_TIME_OFFSET}`);
const endOfIndiaDate = (date) => new Date(`${date}T23:59:59.999${INDIA_TIME_OFFSET}`);

const buildOrderDateMatch = ({ filterType, year, month, from, to }, field = 'createdAt') => {
  const dateMatch = {};
  if (filterType === 'yearly' && year) dateMatch[field] = { $gte: startOfIndiaDate(`${year}-01-01`), $lt: startOfIndiaDate(`${Number(year) + 1}-01-01`) };
  else if (filterType === 'monthly' && year && month) {
    const m = Number(month);
    dateMatch[field] = { $gte: startOfIndiaDate(`${year}-${String(m).padStart(2,'0')}-01`), $lt: startOfIndiaDate(m === 12 ? `${Number(year)+1}-01-01` : `${year}-${String(m+1).padStart(2,'0')}-01`) };
  } else if (filterType === 'range' && from && to) dateMatch[field] = { $gte: startOfIndiaDate(from), $lte: endOfIndiaDate(to) };
  return dateMatch;
};

export const getDeliveredStats = catchAsync(async (req, res) => {
  const { filterType, year, month, from, to } = req.query;
  const deliveredDateMatch = buildOrderDateMatch({ filterType, year, month, from, to }, 'delivered_at');
  const statusDateMatch = buildOrderDateMatch({ filterType, year, month, from, to }, 'status_updated_at');
  const [result, statusBreakdown] = await Promise.all([
    Order.aggregate([{ $match: { status: /^delivered$/i, ...deliveredDateMatch } }, { $group: { _id: null, count: { $sum: 1 }, revenue: { $sum: '$sub_total' } } }]),
    Order.aggregate([{ $match: { ...statusDateMatch } }, { $group: { _id: '$status', count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
  ]);
  const { count = 0, revenue = 0 } = result[0] || {};
  const merged = statusBreakdown.filter(item => !/^delivered$/i.test(item._id || ''));
  merged.unshift({ _id: 'DELIVERED', count });
  res.json(new ApiResponse(200, { count, revenue, statusBreakdown: merged }, 'Delivered stats'));
  const now = Date.now();
  if (now - lastSyncTime > SYNC_COOLDOWN_MS) { lastSyncTime = now; syncAllToLocal().catch(e => console.error('[Sync] error:', e.message)); }
});

export const getStatusOrders = catchAsync(async (req, res) => {
  const { status, filterType, year, month, from, to, limit = 50 } = req.query;
  if (!status) return res.status(400).json(new ApiResponse(400, null, 'Status is required'));
  const dateMatch = buildOrderDateMatch({ filterType, year, month, from, to }, /^delivered$/i.test(status) ? 'delivered_at' : 'status_updated_at');
  const orders = await Order.find({ status: new RegExp(`^${status.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'), ...dateMatch }).populate('lead_id', 'phone email').sort(/^delivered$/i.test(status) ? { delivered_at: -1, createdAt: -1 } : { createdAt: -1 }).limit(Math.min(Number(limit) || 50, 200)).lean();
  const allLeads = await Lead.find({ isDeleted: { $ne: true } }).select('name phone email address').lean();
  const byName = {}, byPincode = {}, pinCount = {};
  for (const l of allLeads) {
    if (!l.phone) continue;
    const full = (l.name || '').toLowerCase().trim();
    byName[full] = l;
    const pm = (l.address || '').match(/\b(\d{6})\b/);
    if (pm) { pinCount[pm[1]] = (pinCount[pm[1]] || 0) + 1; byPincode[pm[1]] = l; }
  }
  for (const p of Object.keys(pinCount)) { if (pinCount[p] > 1) delete byPincode[p]; }
  const enriched = orders.map(o => {
    if (o.lead_id?.phone) return { ...o, billing_phone: o.lead_id.phone };
    const full = (o.billing_customer_name || '').toLowerCase().trim();
    let lead = byName[full];
    if (!lead) {
      const words = full.split(/\s+/).filter(w => w.length > 2);
      if (words.length > 0) lead = Object.entries(byName).find(([k]) => words.every(w => k.includes(w)))?.[1];
    }
    if (!lead && o.billing_pincode) lead = byPincode[String(o.billing_pincode).trim()];
    return { ...o, billing_phone: lead?.phone || o.billing_phone };
  });
  res.json(new ApiResponse(200, { data: enriched, total: enriched.length }, 'Status orders fetched'));
});

export const getLocalOrderLookup = catchAsync(async (req, res) => {
  const { awb, order_id, channel_order_id, shipment_id } = req.query;
  const query = [];
  if (awb) query.push({ awb_code: String(awb) });
  if (order_id) { query.push({ order_id: String(order_id) }); if (!Number.isNaN(Number(order_id))) query.push({ shiprocket_order_id: Number(order_id) }); }
  if (channel_order_id) query.push({ order_id: String(channel_order_id) });
  if (shipment_id && !Number.isNaN(Number(shipment_id))) query.push({ shiprocket_shipment_id: Number(shipment_id) });
  if (!query.length) return res.status(400).json(new ApiResponse(400, null, 'Param required'));
  const order = await Order.findOne({ $or: query }).populate('lead_id', 'phone email').lean();
  if (!order) return res.json(new ApiResponse(200, null, 'Not found'));
  const allLeads = await Lead.find({ isDeleted: { $ne: true } }).select('name phone address').lean();
  const byName = {}, byPincode = {}, pinCount = {};
  for (const l of allLeads) {
    if (!l.phone) continue;
    byName[(l.name || '').toLowerCase().trim()] = l;
    const pm = (l.address || '').match(/\b(\d{6})\b/);
    if (pm) { pinCount[pm[1]] = (pinCount[pm[1]] || 0) + 1; byPincode[pm[1]] = l; }
  }
  for (const p of Object.keys(pinCount)) { if (pinCount[p] > 1) delete byPincode[p]; }
  let phone = order.lead_id?.phone || order.billing_phone;
  if (!order.lead_id?.phone && (/^x+$/i.test(phone) || String(phone).replace(/\D/g, '').length < 10)) {
    const full = (order.billing_customer_name || '').toLowerCase().trim();
    let lead = byName[full];
    if (!lead) { const words = full.split(/\s+/).filter(w => w.length > 2); if (words.length > 0) lead = Object.entries(byName).find(([k]) => words.every(w => k.includes(w)))?.[1]; }
    if (!lead && order.billing_pincode) lead = byPincode[String(order.billing_pincode).trim()];
    phone = lead?.phone || phone;
  }
  res.json(new ApiResponse(200, { ...order, billing_phone: phone }, 'Order fetched'));
});

export const getOrder = catchAsync(async (req, res) => { res.json(new ApiResponse(200, await sr.getOrder(req.params.id), 'Order fetched')); });
export const checkServiceability = catchAsync(async (req, res) => { res.json(new ApiResponse(200, await sr.checkServiceability(req.query), 'Serviceability fetched')); });
export const getCourierListWithCounts = catchAsync(async (req, res) => { res.json(new ApiResponse(200, await sr.getCourierListWithCounts(), 'Courier list fetched')); });
export const assignAWB = catchAsync(async (req, res) => {
  const { shipment_id, courier_id } = req.body;
  const data = await sr.assignAWB(shipment_id, courier_id);
  const awb = data?.awb_code || data?.response?.data?.awb_code;
  if (awb && shipment_id) {
    await Shipment.findOneAndUpdate({ shiprocket_shipment_id: Number(shipment_id) }, { awb_code: awb, courier_id: Number(courier_id), raw_response: data }, { upsert: true });
    await Order.findOneAndUpdate({ shiprocket_shipment_id: Number(shipment_id) }, { awb_code: awb, courier_id: Number(courier_id) });
  }
  res.json(new ApiResponse(200, data, 'AWB assigned'));
});
export const reassignCourier = catchAsync(async (req, res) => { res.json(new ApiResponse(200, await sr.reassignCourier(req.body), 'Courier reassigned')); });
export const getShipments = catchAsync(async (req, res) => { res.json(new ApiResponse(200, await sr.getShipmentsWithDetails(req.query), 'Shipments fetched')); });
export const getShipment = catchAsync(async (req, res) => { res.json(new ApiResponse(200, await sr.getShipment(req.params.id), 'Shipment fetched')); });
export const cancelShipment = catchAsync(async (req, res) => { res.json(new ApiResponse(200, await sr.cancelShipment(req.body.awbs), 'Shipment cancelled')); });
export const generateLabel = catchAsync(async (req, res) => {
  const sids = Array.isArray(req.body.shipment_id) ? req.body.shipment_id.map(Number).filter(Boolean) : [Number(req.body.shipment_id)].filter(Boolean);
  const data = await sr.generateLabel(sids.length === 1 ? sids[0] : sids);
  if (data?.label_url) await Shipment.updateMany({ shiprocket_shipment_id: { $in: sids } }, { label_url: data.label_url });
  res.json(new ApiResponse(200, data, 'Label generated'));
});
export const generateManifest = catchAsync(async (req, res) => {
  const sids = Array.isArray(req.body.shipment_id) ? req.body.shipment_id.map(Number).filter(Boolean) : [Number(req.body.shipment_id)].filter(Boolean);
  const data = await sr.generateManifest(sids.length === 1 ? sids[0] : sids);
  if (data?.manifest_url) await Shipment.updateMany({ shiprocket_shipment_id: { $in: sids } }, { manifest_url: data.manifest_url });
  res.json(new ApiResponse(200, data, 'Manifest generated'));
});
export const printManifest = catchAsync(async (req, res) => { res.json(new ApiResponse(200, await sr.printManifest(req.body.order_ids), 'Manifest print URL')); });
export const printInvoice = catchAsync(async (req, res) => { res.json(new ApiResponse(200, await sr.printInvoice(req.body.ids), 'Invoice print URL')); });
export const generatePickup = catchAsync(async (req, res) => {
  const { shipment_id } = req.body;
  const data = await sr.generatePickup(Number(shipment_id));
  if (data?.pickup_scheduled_date) await Shipment.findOneAndUpdate({ shiprocket_shipment_id: Number(shipment_id) }, { pickup_scheduled_date: data.pickup_scheduled_date, pickup_token_number: data.pickup_token_number }, { upsert: true });
  res.json(new ApiResponse(200, data, 'Pickup generated'));
});
export const cancelPickup = catchAsync(async (req, res) => { res.json(new ApiResponse(200, await sr.cancelPickup(req.body), 'Pickup cancelled')); });
export const getPickupLocations = catchAsync(async (req, res) => { res.json(new ApiResponse(200, await sr.getPickupLocations(), 'Pickup locations fetched')); });
export const trackByAWB = catchAsync(async (req, res) => {
  const data = await sr.trackByAWB(req.params.awb);
  await TrackingLog.create({ awb_code: req.params.awb, current_status: data?.tracking_data?.current_status, raw_response: data });
  res.json(new ApiResponse(200, data, 'Tracking info fetched'));
});
export const trackByShipment = catchAsync(async (req, res) => {
  const data = await sr.trackByShipment(req.params.id);
  await TrackingLog.create({ shipment_id: Number(req.params.id), current_status: data?.tracking_data?.current_status, raw_response: data });
  res.json(new ApiResponse(200, data, 'Tracking info fetched'));
});
export const createReturn = catchAsync(async (req, res) => {
  const data = await sr.createReturn(req.body);
  await Return.create({ shiprocket_order_id: data?.order_id, shiprocket_shipment_id: data?.shipment_id, order_id: String(req.body.order_id || ''), awb_code: data?.awb_code, return_reason: req.body.return_reason, raw_response: data });
  res.json(new ApiResponse(200, data, 'Return created'));
});
export const getReturns = catchAsync(async (req, res) => { res.json(new ApiResponse(200, await sr.getReturns(req.query), 'Returns fetched')); });
export const getWalletBalance = catchAsync(async (req, res) => { res.json(new ApiResponse(200, await sr.getWalletBalance(), 'Wallet balance fetched')); });
export const getWalletTransactions = catchAsync(async (req, res) => { res.json(new ApiResponse(200, await sr.getWalletTransactions(req.query), 'Wallet transactions fetched')); });
export const getNDR = catchAsync(async (req, res) => { res.json(new ApiResponse(200, await sr.getNDR(req.query), 'NDR fetched')); });
export const ndrAction = catchAsync(async (req, res) => { res.json(new ApiResponse(200, await sr.ndrAction(req.body), 'NDR action submitted')); });

const WEBHOOK_EVENTS = { 6: 'SHIPPED', 7: 'DELIVERED', 8: 'IN_TRANSIT', 9: 'RTO_INITIATED', 16: 'RTO_DELIVERED', 17: 'OUT_FOR_DELIVERY', 18: 'IN_TRANSIT', 20: 'IN_TRANSIT', 42: 'PICKED_UP' };
const normalizeShiprocketStatus = (v) => String(v || '').trim().toUpperCase().replace(/\s+/g, '_');
const parseShiprocketDate = (v) => {
  if (!v) return new Date();
  const parsed = new Date(v);
  if (!Number.isNaN(parsed.getTime())) return parsed;
  const match = String(v).match(/^(\d{2})\s+(\d{2})\s+(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/);
  if (match) return new Date(`${match[3]}-${match[2]}-${match[1]}T${match[4]}:${match[5]}:${match[6]}+05:30`);
  return new Date();
};

export const webhook = catchAsync(async (req, res) => {
  const payload = req.body;
  const statusId = Number(payload?.current_status_id || payload?.shipment_status_id || payload?.status_id);
  const event = normalizeShiprocketStatus(WEBHOOK_EVENTS[statusId] || payload?.current_status || payload?.shipment_status || 'UNKNOWN');
  const eventDate = parseShiprocketDate(payload?.current_timestamp || payload?.updated_at);
  const awb = payload?.awb || payload?.awb_code;
  const srid = payload?.sr_order_id || payload?.shiprocket_order_id;
  const query = [];
  if (srid) query.push({ shiprocket_order_id: Number(srid) });
  if (payload?.order_id) query.push({ order_id: String(payload.order_id) });
  if (awb) query.push({ awb_code: String(awb) });

  if (query.length) {
    const order = await Order.findOneAndUpdate({ $or: query }, { status: event, ...(awb ? { awb_code: String(awb) } : {}), ...(event === 'DELIVERED' ? { delivered_at: eventDate } : {}) }, { new: true }).lean();
    if (event === 'DELIVERED' && order) {
      let lid = order.lead_id;
      if (!lid && order.billing_phone && !/^x+$/i.test(order.billing_phone)) {
        const lead = await Lead.findOne({ phone: order.billing_phone, isDeleted: { $ne: true } }).select('_id').lean();
        lid = lead?._id;
      }
      if (lid) await Lead.findByIdAndUpdate(lid, { status: 'follow_up' });
      if (!order.auto_followups_set) await setAutoFollowUps(order._id, eventDate);
    }
  }
  res.json({ success: true, event });
});
