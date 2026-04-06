import { User } from './user.model.js';
import ApiError from '../../utils/ApiError.js';
import QueryHelper from '../../utils/queryHelper.js';

/**
 * Handle user creation.
 */
const createUser = async (userBody) => {
  if (await User.isEmailTaken(userBody.email)) {
    throw new ApiError(400, 'Email already taken');
  }
  return User.create(userBody);
};

/**
 * Handle user data retrieval.
 */
const queryUsers = async (filter, options) => {
  const queryHelper = new QueryHelper(User, { ...filter, ...options });
  return queryHelper.execute();
};

/**
 * Get user by ID.
 */
const getUserById = async (id) => {
  return User.findById(id);
};

/**
 * Update user data by ID.
 */
const updateUserById = async (userId, updateBody) => {
  const user = await getUserById(userId);
  if (!user) {
    throw new ApiError(404, 'User not found');
  }
  if (updateBody.email && (await User.isEmailTaken(updateBody.email, userId))) {
    throw new ApiError(400, 'Email already taken');
  }
  Object.assign(user, updateBody);
  await user.save();
  return user;
};

/**
 * Soft delete user by ID.
 */
const deleteUserById = async (userId) => {
  const user = await getUserById(userId);
  if (!user) {
    throw new ApiError(404, 'User not found');
  }
  await user.softDelete();
  return user;
};

export default {
  createUser,
  queryUsers,
  getUserById,
  updateUserById,
  deleteUserById,
};
