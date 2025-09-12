require('dotenv').config();

const config = {
  // Server
  port: process.env.PORT || 3000,
  env: process.env.NODE_ENV || 'development',
  serverUrl: process.env.SERVER_URL || 'http://localhost:3000',
  
  // OpenAI
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    organization: process.env.OPENAI_ORGANIZATION,
    project: process.env.OPENAI_PROJECT,
    model: process.env.OPENAI_REALTIME_MODEL || 'gpt-4o-realtime-preview',
    voice: process.env.OPENAI_VOICE || 'alloy',
    audioFormat: process.env.AUDIO_FORMAT || 'pcm16'
  },
  
  // Twilio
  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    authToken: process.env.TWILIO_AUTH_TOKEN,
    apiKey: process.env.TWILIO_API_KEY,
    apiSecret: process.env.TWILIO_API_SECRET,
    phoneNumber: process.env.TWILIO_PHONE_NUMBER,
    sipDomain: process.env.TWILIO_SIP_DOMAIN || 'vadai-realtime.sip.twilio.com',
    webhookSecret: process.env.TWILIO_WEBHOOK_SECRET
  },
  
  // Database
  database: {
    url: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  },
  
  // Redis
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379'
  },
  
  // Security
  security: {
    jwtSecret: process.env.JWT_SECRET || 'your-jwt-secret',
    encryptionKey: process.env.ENCRYPTION_KEY || 'your-32-char-encryption-key-here',
    sessionSecret: process.env.SESSION_SECRET || 'your-session-secret'
  },
  
  // Application limits
  limits: {
    maxConcurrentCalls: parseInt(process.env.MAX_CONCURRENT_CALLS) || 50,
    callTimeoutMinutes: parseInt(process.env.CALL_TIMEOUT_MINUTES) || 30,
    rateLimitCallsPerMinute: parseInt(process.env.RATE_LIMIT_CALLS_PER_MINUTE) || 10,
    rateLimitCallsPerHour: parseInt(process.env.RATE_LIMIT_CALLS_PER_HOUR) || 100,
    maxCostPerCall: parseFloat(process.env.MAX_COST_PER_CALL) || 5.00,
    dailyBudgetLimit: parseFloat(process.env.DAILY_BUDGET_LIMIT) || 500.00,
    costAlertThreshold: parseFloat(process.env.COST_ALERT_THRESHOLD) || 400.00
  },
  
  // Features
  features: {
    enableOutboundCalls: process.env.ENABLE_OUTBOUND_CALLS === 'true',
    enableFunctionCalling: process.env.ENABLE_FUNCTION_CALLING === 'true',
    enableHumanTransfer: process.env.ENABLE_HUMAN_TRANSFER === 'true',
    enableCallRecording: process.env.ENABLE_CALL_RECORDING === 'true'
  },
  
  // Business
  business: {
    companyName: process.env.COMPANY_NAME || 'VADAI Agency',
    companyPhone: process.env.COMPANY_PHONE || '+1234567890',
    businessHours: process.env.BUSINESS_HOURS || 'Monday to Friday, 9 AM to 6 PM',
    defaultInstructions: process.env.DEFAULT_INSTRUCTIONS || 'You are a helpful AI assistant. Speak clearly and be concise.'
  },
  
  // Logging
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    debugMode: process.env.DEBUG_MODE === 'true'
  },
  
  // Development
  development: {
    mockExternalApis: process.env.MOCK_EXTERNAL_APIS === 'true',
    testPhoneNumbers: process.env.TEST_PHONE_NUMBERS ? process.env.TEST_PHONE_NUMBERS.split(',') : []
  },
  
  // CORS
  allowedOrigins: [
    'https://yourdomain.com',
    'https://www.yourdomain.com'
  ]
};

// Validation
function validateConfig() {
  const required = [
    'openai.apiKey',
    'twilio.accountSid',
    'twilio.authToken'
  ];
  
  const missing = required.filter(key => {
    const value = key.split('.').reduce((obj, k) => obj && obj[k], config);
    return !value;
  });
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

// Only validate in production or if explicitly requested
if (process.env.NODE_ENV === 'production' || process.env.VALIDATE_CONFIG === 'true') {
  validateConfig();
}

module.exports = config;
