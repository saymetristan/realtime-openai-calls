const express = require('express');
const config = require('../config/config');
const logger = require('../utils/logger');

const router = express.Router();

// Basic health check
router.get('/', (req, res) => {
  const healthCheck = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: config.env,
    version: '1.0.0',
    services: {
      server: 'operational',
      // These will be populated by service checks
      openai: 'unknown',
      twilio: 'unknown',
      database: 'unknown'
    }
  };

  res.status(200).json(healthCheck);
});

// Detailed health check
router.get('/detailed', async (req, res) => {
  const startTime = Date.now();
  
  const healthCheck = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: config.env,
    version: '1.0.0',
    responseTime: 0,
    services: {},
    memory: process.memoryUsage(),
    cpu: process.cpuUsage()
  };

  try {
    // Check OpenAI service
    try {
      // We'll implement actual service checks later
      healthCheck.services.openai = config.openai.apiKey ? 'configured' : 'not_configured';
    } catch (error) {
      healthCheck.services.openai = 'error';
      logger.error('OpenAI health check failed:', error);
    }

    // Check Twilio service
    try {
      healthCheck.services.twilio = config.twilio.accountSid ? 'configured' : 'not_configured';
    } catch (error) {
      healthCheck.services.twilio = 'error';
      logger.error('Twilio health check failed:', error);
    }

    // Check database
    try {
      healthCheck.services.database = config.database.url ? 'configured' : 'not_configured';
    } catch (error) {
      healthCheck.services.database = 'error';
      logger.error('Database health check failed:', error);
    }

    // Calculate response time
    healthCheck.responseTime = Date.now() - startTime;

    // Determine overall status
    const serviceStatuses = Object.values(healthCheck.services);
    if (serviceStatuses.includes('error')) {
      healthCheck.status = 'degraded';
    } else if (serviceStatuses.includes('not_configured')) {
      healthCheck.status = 'warning';
    }

    const statusCode = healthCheck.status === 'healthy' ? 200 : 
                      healthCheck.status === 'warning' ? 200 : 503;

    res.status(statusCode).json(healthCheck);
  } catch (error) {
    logger.error('Health check failed:', error);
    
    healthCheck.status = 'unhealthy';
    healthCheck.error = error.message;
    healthCheck.responseTime = Date.now() - startTime;
    
    res.status(503).json(healthCheck);
  }
});

// Readiness probe (for Kubernetes/Railway)
router.get('/ready', (req, res) => {
  // Check if all required services are ready
  const ready = config.openai.apiKey && config.twilio.accountSid;
  
  if (ready) {
    res.status(200).json({
      status: 'ready',
      timestamp: new Date().toISOString()
    });
  } else {
    res.status(503).json({
      status: 'not_ready',
      timestamp: new Date().toISOString(),
      message: 'Required services not configured'
    });
  }
});

// Liveness probe (for Kubernetes/Railway)
router.get('/live', (req, res) => {
  res.status(200).json({
    status: 'alive',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

module.exports = router;
