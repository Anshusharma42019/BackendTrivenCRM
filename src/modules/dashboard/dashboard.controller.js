import httpStatus from 'http-status';
import catchAsync from '../../utils/catchAsync.js';
import ApiResponse from '../../utils/ApiResponse.js';
import * as dashboardService from './dashboard.service.js';

const getStats = catchAsync(async (req, res) => {
  const stats = await dashboardService.getDashboardStats(req.user.role, req.user._id);
  res.json(new ApiResponse(httpStatus.OK, stats, 'Dashboard stats fetched'));
});

const getRevenueChart = catchAsync(async (req, res) => {
  const data = await dashboardService.getRevenueChart(req.user.role, req.user._id, req.query.period);
  res.json(new ApiResponse(httpStatus.OK, data, 'Revenue chart data fetched'));
});

const getStaffStats = catchAsync(async (req, res) => {
  const data = await dashboardService.getStaffStats(req.user._id);
  res.json(new ApiResponse(httpStatus.OK, data, 'Staff stats fetched'));
});

const setStaffTarget = catchAsync(async (req, res) => {
  const { target } = req.body;
  if (!target || Number(target) < 1) {
    return res.status(400).json({ status: 400, message: 'Invalid target value' });
  }
  const data = await dashboardService.setStaffTarget(req.user._id, target);
  res.json(new ApiResponse(httpStatus.OK, data, 'Target saved'));
});

const getStaffVerifications = catchAsync(async (req, res) => {
  const data = await dashboardService.getStaffVerifications(req.user._id);
  res.json(new ApiResponse(httpStatus.OK, data, 'Staff verifications fetched'));
});

const getStaffTodayLists = catchAsync(async (req, res) => {
  const data = await dashboardService.getStaffTodayLists(req.user._id);
  res.json(new ApiResponse(httpStatus.OK, data, 'Staff today lists fetched'));
});

const getStaffMonthlyChart = catchAsync(async (req, res) => {
  const data = await dashboardService.getStaffMonthlyChart(req.user._id);
  res.json(new ApiResponse(httpStatus.OK, data, 'Monthly chart fetched'));
});

const getAllStaffStats = catchAsync(async (req, res) => {
  const data = await dashboardService.getAllStaffStats();
  res.json(new ApiResponse(httpStatus.OK, data, 'All staff stats fetched'));
});

export default { getStats, getRevenueChart, getStaffStats, setStaffTarget, getStaffVerifications, getStaffTodayLists, getStaffMonthlyChart, getAllStaffStats };
