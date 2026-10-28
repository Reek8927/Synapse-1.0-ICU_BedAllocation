import './config/env.js';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import mongoSanitize from 'express-mongo-sanitize';
import healthRoutes from './routes/healthRoutes.js';
import authRoutes from './routes/authRoutes.js';
import platformRoutes from './routes/platformRoutes.js';
import contactRoutes from './routes/contactRoutes.js';
import patientRoutes from './routes/patientRoutes.js';
import icuRoutes from './routes/icuRoutes.js';
import researchModelRoutes from './routes/researchModelRoutes.js';
import riskRoutes from './routes/riskRoutes.js';
import monitoringRoutes from './routes/monitoringRoutes.js';
import { getAllowedOrigins } from './config/env.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

const app = express();
const allowedOrigins = getAllowedOrigins();
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: (req) => req.path.startsWith('/health') || req.path.startsWith('/monitoring'),
  message: { error: 'Too many requests. Please try again later.' }
});

app.disable('x-powered-by');
if (Number(process.env.TRUST_PROXY_HOPS || 0) > 0) app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS));
app.use(helmet({ crossOriginResourcePolicy: { policy: 'same-site' } }));
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Origin is not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'X-CSRF-Token', 'X-Monitor-Key']
}));
app.use(express.json({ limit: '1mb', strict: true }));
app.use(cookieParser());
app.use(mongoSanitize({ replaceWith: '_' }));
app.use(morgan(':method :status :response-time ms', {
  skip: (req) => req.path === '/api/health'
}));
app.use('/api', apiLimiter);

app.get('/', (req, res) => res.json({ name: 'BedAllocation API', status: 'running', docs: 'See README.md for current endpoints' }));
app.use('/api/health', healthRoutes);
app.use('/api/auth', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); }, authRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/patients', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); }, patientRoutes);
app.use('/api/icu', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); }, icuRoutes);
app.use('/api/platform', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); }, platformRoutes);
app.use('/api/risk', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); }, riskRoutes);
app.use('/api/monitoring', monitoringRoutes);
app.use('/api/research-model', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); }, researchModelRoutes);
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
