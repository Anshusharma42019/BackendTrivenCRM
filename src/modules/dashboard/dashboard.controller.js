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

export default { getStats, getRevenueChart };
