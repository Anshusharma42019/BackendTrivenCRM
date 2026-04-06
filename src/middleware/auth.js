import jwt from 'jsonwebtoken';
import { config } from '../config/config.js';
import ApiError from '../utils/ApiError.js';
import catchAsync from '../utils/catchAsync.js';
import { User } from '../modules/user/user.model.js';

/**
 * Middleware to protect routes and check roles.
 */
const auth = (...requiredRoles) => catchAsync(async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new ApiError(401, 'Please authenticate');
  }

  const token = authHeader.split(' ')[1];
  let decoded;
  try {
    decoded = jwt.verify(token, config.jwt.secret);
  } catch (error) {
    throw new ApiError(401, 'Invalid or expired token');
  }

  const user = await User.findOne({ _id: decoded.sub, isDeleted: false });
  if (!user) {
    throw new ApiError(401, 'User not found');
  }

  if (requiredRoles.length && !requiredRoles.includes(user.role)) {
    throw new ApiError(403, 'Forbidden');
  }

  req.user = user;
  next();
});

export default auth;
