import { z } from 'zod';

export const register = {
  body: z.object({
    email: z.string().email(),
    password: z.string().min(5),
    name: z.string(),
  }),
};

export const login = {
  body: z.object({
    email: z.string().email(),
    password: z.string(),
  }),
};

export const refreshToken = {
  body: z.object({
    refreshToken: z.string(),
  }),
};
