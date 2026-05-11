import Attendance from '../modules/attendance/attendance.model.js';
import ApiError from '../utils/ApiError.js';
import catchAsync from '../utils/catchAsync.js';

const getTodayDate = () => {
  const now = new Date();
  const IST_OFFSET = 5.5 * 60 * 60 * 1000;
  const istNow = new Date(now.getTime() + IST_OFFSET);
  return new Date(Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate()));
};

/**
 Blocks the request if the user has not checked in today.
 Must be used after auth() middleware.
 */
const requireCheckedIn = catchAsync(async (req, res, next) => {
  if (req.user.role === 'admin') return next();
  const today = getTodayDate();
  const attendance = await Attendance.findOne({ user: req.user._id, date: today, isDeleted: false });
  if (!attendance || !attendance.checkIn) {
    throw new ApiError(403, 'You must check in before performing this action');
  }
  next();
});

export default requireCheckedIn;

