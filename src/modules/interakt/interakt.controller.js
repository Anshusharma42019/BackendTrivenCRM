import httpStatus from 'http-status';
import catchAsync from '../../utils/catchAsync.js';
import ApiResponse from '../../utils/ApiResponse.js';
import Lead from '../lead/lead.model.js';
import User from '../user/user.model.js';
import * as leadService from '../lead/lead.service.js';

/**
 * Handle incoming webhooks from Interakt
 */
const handleWebhook = catchAsync(async (req, res) => {
  const payload = req.body;
  
  if (!payload || !payload.entityType) {
    return res.status(httpStatus.BAD_REQUEST).json(new ApiResponse(httpStatus.BAD_REQUEST, null, 'Invalid payload'));
  }

  // Interakt Webhook Events: USER_MESSAGE, SERVER_EVENT, USER_EVENT
  console.log(`[Interakt Webhook] Received event of type: ${payload.entityType}`);
  
    switch (payload.entityType) {
      case 'USER_MESSAGE': {
        const messageText = payload.entity?.text || payload.entity?.suggestionResponse?.postBack?.data || '';
        console.log(`User ${payload.userPhoneNumber} sent message: ${messageText}`);
        
        // Save this as a note to the corresponding Lead using the phone number
        if (payload.userPhoneNumber && messageText) {
          // Interakt sends phone numbers with + country code, e.g., +9193218...
          let phone = payload.userPhoneNumber;
          if (phone.startsWith('+91')) phone = phone.substring(3);
          else if (phone.startsWith('+')) phone = phone.substring(1);

          let lead = await Lead.findOne({ phone: { $regex: phone.slice(-10) + '$' } });
          const defaultAdmin = await User.findOne({ role: 'admin', isDeleted: false }).select('_id').lean();
          
          if (!lead) {
            // Auto-create a lead if it doesn't exist
            console.log(`[Interakt Webhook] Auto-creating new lead for phone ${phone}`);
            const newLeadData = {
              name: `WhatsApp Lead (${phone})`,
              phone: phone,
              source: 'social_media',
              problem: `[Interakt Message] ${messageText}`,
              status: 'new'
            };
            lead = await leadService.createLead(newLeadData, defaultAdmin ? defaultAdmin._id : null, 'admin');
          } else {
             // If lead already exists, just add note
             lead.notes.push({ text: `[Interakt Message] ${messageText}`, createdBy: defaultAdmin ? defaultAdmin._id : null });
             await lead.save();
          }
        }
        break;
      }
        
      case 'USER_EVENT':
        // Handle user events like MESSAGE_READ
        console.log(`User ${payload.userPhoneNumber} triggered event: ${payload.entity?.eventType}`);
        break;

      case 'SERVER_EVENT':
        // Handle server events like TTL_EXPIRATION_REVOKED
        console.log(`Server event for ${payload.userPhoneNumber}: ${payload.entity?.eventType}`);
        break;

      default:
        console.log(`[Interakt Webhook] Unhandled entity type: ${payload.entityType}`);
    }

  // Always return 200 OK to acknowledge receipt of the webhook to Interakt
  res.status(httpStatus.OK).json(new ApiResponse(httpStatus.OK, null, 'Webhook received successfully'));
});

export default {
  handleWebhook,
  testWebhook: catchAsync(async (req, res) => {
    let lead = await Lead.findOne({ phone: "8888888888" });
    const defaultAdmin = await User.findOne({ role: 'admin', isDeleted: false }).select('_id').lean();
    if (!lead) {
      const newLeadData = {
        name: `WhatsApp Lead (8888888888)`,
        phone: "8888888888",
        source: 'social_media',
        problem: `[Interakt Message] TEST`,
        status: 'new'
      };
      lead = await leadService.createLead(newLeadData, defaultAdmin ? defaultAdmin._id : null, 'admin');
      res.status(200).json({ success: true, message: "Lead CREATED", lead });
    } else {
      res.status(200).json({ success: true, message: "Lead ALREADY EXISTS", lead });
    }
  }),
  latestLeads: catchAsync(async (req, res) => {
    const leads = await Lead.find({ source: 'social_media' }).sort({ createdAt: -1 }).limit(10).lean();
    res.status(200).json({ success: true, leads });
  })
};
