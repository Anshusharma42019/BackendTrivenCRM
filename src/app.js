import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import { config } from './config/config.js';
import { errorConverter, errorHandler } from './middleware/error.js';
import ApiError from './utils/ApiError.js';
import routes from './routes/index.js';

const app = express();

if (config.env !== 'test') {
  app.use(morgan('dev'));
}

// set security HTTP headers
app.use(helmet());

// parse json request body (limit raised to support base64 image uploads)
app.use(express.json({ limit: '10mb' }));

// parse urlencoded request body
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

const allowedOrigins = [
  'http://localhost:3000', 
  'http://localhost:5173', 
  'http://localhost:5174',
  'http://127.0.0.1:5500',
  'http://localhost:5500',
  'https://backend-triven-crm.vercel.app',
  'https://frontendtriven-crm.vercel.app',
  'https://triven-website.vercel.app',
  'https://trivenayurveda.com',
  'https://www.trivenayurveda.com',
  'https://www.trivenayurveda.in',
  'https://www.triven.in'
];
app.options('/{*path}', cors());
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin) || origin.includes('vercel.app')) {
      callback(null, true);
    } else {
      // Pass 'false' instead of throwing an Error to prevent 500 Internal Server errors
      callback(null, false);
    }
  },
  credentials: true
}));

// v1 api routes
app.use('/api/v1', routes);

// send back a 404 error for any unknown api request
app.use((req, res, next) => {
  next(new ApiError(404, 'Not found'));
});

// convert error to ApiError, if needed
app.use(errorConverter);

// handle error
app.use(errorHandler);

export default app;
