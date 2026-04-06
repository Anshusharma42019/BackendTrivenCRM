import { z } from 'zod';

const paramsIdSchema = z.object({
  userId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid user ID format'),
});

export const getUsers = {
  query: z.object({
    name: z.string().optional(),
    role: z.string().optional(),
    sortBy: z.string().optional(),
    limit: z.number().int().optional(),
    page: z.number().int().optional(),
  }),
};

export const getUser = {
  params: paramsIdSchema,
};

export const createUser = {
  body: z.object({
    email: z.string().email(),
    password: z.string().min(8),
    name: z.string(),
    role: z.enum(['admin', 'manager', 'sales']).optional(),
  }),
};

export const updateUser = {
  params: paramsIdSchema,
  body: z.object({
    email: z.string().email().optional(),
    password: z.string().min(8).optional(),
    name: z.string().optional(),
    role: z.enum(['admin', 'manager', 'sales']).optional(),
  }).refine((data) => Object.keys(data).length > 0, {
    message: 'Must provide at least one field to update',
  }),
};

export const deleteUser = {
  params: paramsIdSchema,
};
