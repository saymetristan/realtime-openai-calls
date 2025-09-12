require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const config = require('./config/config');
const logger = require('./utils/logger');
const errorHandler = require('./middleware/errorHandler');

// Routes
const webhookRoutes = require('./routes/webhook');
const healthRoutes = require('./routes/health');
const callRoutes = require('./routes/calls');

// Services
const OpenAIService = require('./services/openai');
const TwilioService = require('./services/twilio');

const app = express();

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? config.allowedOrigins : true,
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'production' ? 100 : 1000, // limit each IP
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// Logging
app.use(morgan('combined', { stream: { write: message => logger.info(message.trim()) } }));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check (no rate limit)
app.use('/health', healthRoutes);

// Main routes
app.use('/webhook', webhookRoutes);
app.use('/api/calls', callRoutes);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'Realtime OpenAI Calls API',
    version: '1.0.0',
    status: 'running',
    timestamp: new Date().toISOString(),
    endpoints: {
      health: '/health',
      webhook_twilio: '/webhook/twilio',
      webhook_sip: '/webhook/twilio/sip',
      calls_outbound: '/api/calls/outbound'
    }
  });
});

// Error handling
app.use(errorHandler);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    message: `The endpoint ${req.method} ${req.originalUrl} does not exist.`,
    timestamp: new Date().toISOString()
  });
});

const PORT = process.env.PORT || 3000;

// Initialize services
async function initializeServices() {
  try {
    logger.info('🚀 Initializing services...');
    
    // Initialize OpenAI service
    await OpenAIService.initialize();
    logger.info('✅ OpenAI service initialized');
    
    // Initialize Twilio service
    await TwilioService.initialize();
    logger.info('✅ Twilio service initialized');
    
    logger.info('🎉 All services initialized successfully');
  } catch (error) {
    logger.error('❌ Failed to initialize services:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('🛑 SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('🛑 SIGINT received, shutting down gracefully');
  process.exit(0);
});

// Start server
async function startServer() {
  try {
    await initializeServices();
    
    app.listen(PORT, '0.0.0.0', () => {
      logger.info(`🚀 Server running on port ${PORT}`);
      logger.info(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`📞 Ready to handle calls!`);
      
      if (process.env.NODE_ENV !== 'production') {
        logger.info(`🔗 Local: http://localhost:${PORT}`);
        logger.info(`🔗 Webhook: ${process.env.SERVER_URL}/webhook/twilio/sip`);
      }
    });
  } catch (error) {
    logger.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

module.exports = app;
