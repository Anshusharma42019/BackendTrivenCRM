import { z } from 'zod';

const typeEnum = z.enum(['call', 'follow_up', 'meeting', 'email', 'task']);
const statusEnum = z.enum(['pending', 'completed', 'overdue', 'cancelled', 'verification', 'cnp', 'cancel_call']);
const priorityEnum = z.enum(['low', 'medium', 'high']);

export const createTask = {
  body: z.object({
    title: z.string().min(1),
    description: z.string().optional(),
    type: typeEnum.optional(),
    lead: z.string().optional(),
    assignedTo: z.string().optional(),
    dueDate: z.string(),
    priority: priorityEnum.optional(),
    reminderAt: z.string().optional(),
  }),
};

export const updateTask = {
  params: z.object({ taskId: z.string() }),
  body: z.object({
    title: z.string().min(1).optional(),
    description: z.string().optional(),
    type: typeEnum.optional(),
    status: statusEnum.optional(),
    dueDate: z.string().optional(),
    priority: priorityEnum.optional(),
    reminderAt: z.string().optional(),
  }),
};

export const getTask = {
  params: z.object({ taskId: z.string() }),
};

export const deleteTask = {
  params: z.object({ taskId: z.string() }),
};

export const getTasks = {
  query: z.object({
    status: statusEnum.optional(),
    type: typeEnum.optional(),
    assignedTo: z.string().optional(),
    lead: z.string().optional(),
    date: z.string().optional(),
    page: z.string().optional(),
    limit: z.string().optional(),
  }).passthrough(),
};
