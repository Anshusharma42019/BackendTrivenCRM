import express from 'express';
import authRoute from '../modules/auth/auth.routes.js';
import userRoute from '../modules/user/user.routes.js';
import leadRoute from '../modules/lead/lead.routes.js';
import taskRoute from '../modules/task/task.routes.js';
import notificationRoute from '../modules/notification/notification.routes.js';
import dashboardRoute from '../modules/dashboard/dashboard.routes.js';
import cnpRoute from '../modules/cnp/cnp.routes.js';
import verificationRoute from '../modules/verification/verification.routes.js';
import readyToShipmentRoute from '../modules/readytoshipment/readytoshipment.routes.js';

const router = express.Router();

const defaultRoutes = [
  { path: '/auth', route: authRoute },
  { path: '/users', route: userRoute },
  { path: '/leads', route: leadRoute },
  { path: '/tasks', route: taskRoute },
  { path: '/notifications', route: notificationRoute },
  { path: '/dashboard', route: dashboardRoute },
  { path: '/cnp', route: cnpRoute },
  { path: '/verification', route: verificationRoute },
  { path: '/ready-to-shipment', route: readyToShipmentRoute },
];

defaultRoutes.forEach((route) => {
  router.use(route.path, route.route);
});

export default router;
