const winston = require('winston');
const config = require('../config/config');

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss'
  }),
  winston.format.errors({ stack: true }),
  winston.format.printf(info => {
    const { timestamp, level, message, ...meta } = info;
    let log = `${timestamp} [${level.toUpperCase()}]: ${message}`;
    
    if (Object.keys(meta).length > 0) {
      log += `\n${JSON.stringify(meta, null, 2)}`;
    }
    
    return log;
  })
);

// Define transports
const transports = [
  new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      logFormat
    )
  })
];

// Add file transport in production
if (config.env === 'production') {
  transports.push(
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      format: logFormat,
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    new winston.transports.File({
      filename: 'logs/combined.log',
      format: logFormat,
      maxsize: 5242880, // 5MB
      maxFiles: 5
    })
  );
}

// Create logger
const logger = winston.createLogger({
  level: config.logging.level,
  format: logFormat,
  transports,
  exitOnError: false
});

// Add custom methods for call logging
logger.logCall = function(callId, event, data = {}) {
  this.info(`[CALL ${callId}] ${event}`, {
    callId,
    event,
    ...data,
    timestamp: new Date().toISOString()
  });
};

logger.logWebhook = function(source, event, data = {}) {
  this.info(`[WEBHOOK ${source}] ${event}`, {
    source,
    event,
    ...data,
    timestamp: new Date().toISOString()
  });
};

logger.logOpenAI = function(sessionId, event, data = {}) {
  this.info(`[OPENAI ${sessionId}] ${event}`, {
    sessionId,
    event,
    ...data,
    timestamp: new Date().toISOString()
  });
};

logger.logTwilio = function(callSid, event, data = {}) {
  this.info(`[TWILIO ${callSid}] ${event}`, {
    callSid,
    event,
    ...data,
    timestamp: new Date().toISOString()
  });
};

// Handle uncaught exceptions
logger.exceptions.handle(
  new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      logFormat
    )
  })
);

// Handle unhandled promise rejections
process.on('unhandledRejection', (ex) => {
  logger.error('Unhandled Promise Rejection:', ex);
});

module.exports = logger;
