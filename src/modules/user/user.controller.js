import catchAsync from '../../utils/catchAsync.js';
import userService from './user.service.js';
import ApiResponse from '../../utils/ApiResponse.js';
import ApiError from '../../utils/ApiError.js';

/**
 * Handle user registration for admins.
 */
const createUser = catchAsync(async (req, res) => {
  const user = await userService.createUser(req.body);
  res.status(201).send(new ApiResponse(201, user, 'User created successfully'));
});

/**
 * Handle user search and listing.
 */
const getUsers = catchAsync(async (req, res) => {
  const filter = {
    ...(req.query.name && { name: req.query.name }),
    ...(req.query.role && { role: req.query.role }),
  };
  const options = {
    sortBy: req.query.sortBy,
    limit: req.query.limit,
    page: req.query.page,
    search: req.query.search,
  };
  const result = await userService.queryUsers(filter, options);
  res.send(new ApiResponse(200, result, 'Users retrieved successfully'));
});

/**
 * Handle getting single user details.
 */
const getUser = catchAsync(async (req, res) => {
  const user = await userService.getUserById(req.params.userId);
  if (!user) {
    throw new ApiError(404, 'User not found');
  }
  res.send(new ApiResponse(200, user, 'User retrieved successfully'));
});

/**
 * Handle updating user details.
 */
const updateUser = catchAsync(async (req, res) => {
  const user = await userService.updateUserById(req.params.userId, req.body);
  res.send(new ApiResponse(200, user, 'User updated successfully'));
});

/**
 * Handle soft delete of user.
 */
const deleteUser = catchAsync(async (req, res) => {
  await userService.deleteUserById(req.params.userId);
  res.send(new ApiResponse(200, null, 'User deleted successfully'));
});

const getStaffShipmentCounts = catchAsync(async (req, res) => {
  const counts = await userService.getStaffShipmentCounts();
  res.send(new ApiResponse(200, counts, 'Shipment counts fetched'));
});

export default {
  createUser,
  getUsers,
  getUser,
  updateUser,
  deleteUser,
  getStaffShipmentCounts,
};
