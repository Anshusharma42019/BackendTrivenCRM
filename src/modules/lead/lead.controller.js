import Lead from './lead.model.js';
import httpStatus from 'http-status';
import catchAsync from '../../utils/catchAsync.js';
import ApiResponse from '../../utils/ApiResponse.js';
import ApiError from '../../utils/ApiError.js';
import * as leadService from './lead.service.js';

const createLead = catchAsync(async (req, res) => {
  const lead = await leadService.createLead(req.body, req.user._id);
  res.status(httpStatus.CREATED).json(new ApiResponse(httpStatus.CREATED, lead, 'Lead created'));
});

// Public route — no auth required (website inquiry form)
const submitLead = catchAsync(async (req, res) => {
  const lead = await leadService.createLead(req.body, null);
  res.status(httpStatus.CREATED).json(new ApiResponse(httpStatus.CREATED, lead, 'Inquiry submitted successfully'));
});

const getLeads = catchAsync(async (req, res) => {
  const result = await leadService.getLeads(req.query, req.query, req.user.role, req.user._id);
  res.json(new ApiResponse(httpStatus.OK, result, 'Leads fetched'));
});

const getLead = catchAsync(async (req, res) => {
  const lead = await leadService.getLeadById(req.params.leadId, req.user.role, req.user._id);
  res.json(new ApiResponse(httpStatus.OK, lead, 'Lead fetched'));
});

const updateLead = catchAsync(async (req, res) => {
  const lead = await leadService.updateLead(req.params.leadId, req.body, req.user.role, req.user._id);
  res.json(new ApiResponse(httpStatus.OK, lead, 'Lead updated'));
});

const deleteLead = catchAsync(async (req, res) => {
  await leadService.deleteLead(req.params.leadId);
  res.json(new ApiResponse(httpStatus.OK, null, 'Lead deleted'));
});

const assignLead = catchAsync(async (req, res) => {
  const lead = await leadService.assignLead(req.params.leadId, req.body.assignedTo);
  res.json(new ApiResponse(httpStatus.OK, lead, 'Lead assigned'));
});

const addNote = catchAsync(async (req, res) => {
  const lead = await Lead.findOne({ _id: req.params.leadId, isDeleted: false });
  if (!lead) throw new ApiError(httpStatus.NOT_FOUND, 'Lead not found');
  lead.notes.push({ text: req.body.text, createdBy: req.user._id });
  await lead.save();
  await lead.populate('notes.createdBy', 'name');
  res.json(new ApiResponse(httpStatus.OK, lead, 'Note added'));
});

const markCNP = catchAsync(async (req, res) => {
  const lead = await leadService.markCNP(req.params.leadId, req.user.role, req.user._id);
  res.json(new ApiResponse(httpStatus.OK, lead, 'Marked as CNP'));
});

const unmarkCNP = catchAsync(async (req, res) => {
  const lead = await leadService.unmarkCNP(req.params.leadId, req.user.role, req.user._id);
  res.json(new ApiResponse(httpStatus.OK, lead, 'CNP removed'));
});

export default { createLead, submitLead, getLeads, getLead, updateLead, deleteLead, assignLead, addNote, markCNP, unmarkCNP };
