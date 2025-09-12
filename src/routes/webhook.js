const express = require('express');
const twilio = require('twilio');
const config = require('../config/config');
const logger = require('../utils/logger');
const OpenAIService = require('../services/openai');
const TwilioService = require('../services/twilio');

const router = express.Router();
const { MessagingResponse } = twilio.twiml;

// Middleware to validate Twilio webhook signature
const validateTwilioSignature = (req, res, next) => {
  if (config.env === 'development' && !config.twilio.webhookSecret) {
    logger.warn('Skipping Twilio signature validation in development mode');
    return next();
  }

  const twilioSignature = req.get('X-Twilio-Signature');
  const url = `${config.serverUrl}${req.originalUrl}`;
  
  if (!twilio.validateRequest(config.twilio.webhookSecret, req.body, url, twilioSignature)) {
    logger.error('Invalid Twilio signature:', {
      url,
      signature: twilioSignature,
      body: req.body
    });
    return res.status(403).json({ error: 'Invalid signature' });
  }
  
  next();
};

// Main SIP webhook endpoint - This is where the magic happens
router.post('/twilio/sip', validateTwilioSignature, async (req, res) => {
  try {
    const {
      CallSid,
      AccountSid,
      From,
      To,
      CallStatus,
      Direction,
      CallerName,
      FromCity,
      FromState,
      FromCountry
    } = req.body;

    logger.logWebhook('TWILIO_SIP', 'incoming_call', {
      callSid: CallSid,
      from: From,
      to: To,
      status: CallStatus,
      direction: Direction,
      callerName: CallerName,
      location: `${FromCity}, ${FromState}, ${FromCountry}`
    });

    // Create TwiML response
    const twiml = new twilio.twiml.VoiceResponse();

    if (CallStatus === 'ringing') {
      // This is where we bridge to OpenAI Realtime
      logger.logCall(CallSid, 'bridging_to_openai');

      // Connect to OpenAI Realtime via Media Stream
      const connect = twiml.connect();
      connect.stream({
        url: `wss://api.openai.com/v1/realtime?model=${config.openai.model}`,
        name: `openai_stream_${CallSid}`
      });

      // Start the OpenAI session management
      try {
        await OpenAIService.initializeCallSession(CallSid, {
          from: From,
          to: To,
          callerName: CallerName
        });
        logger.logCall(CallSid, 'openai_session_initialized');
      } catch (error) {
        logger.error(`Failed to initialize OpenAI session for call ${CallSid}:`, error);
        
        // Fallback to recording message
        twiml.say('Sorry, our AI assistant is temporarily unavailable. Please leave a message after the beep.');
        twiml.record({
          maxLength: 120,
          action: `/webhook/twilio/recording/${CallSid}`,
          method: 'POST'
        });
      }
    } else if (CallStatus === 'completed') {
      logger.logCall(CallSid, 'call_completed');
      await OpenAIService.cleanupCallSession(CallSid);
    } else if (CallStatus === 'failed') {
      logger.logCall(CallSid, 'call_failed');
      await OpenAIService.cleanupCallSession(CallSid);
    }

    res.type('text/xml');
    res.send(twiml.toString());

  } catch (error) {
    logger.error('Error in SIP webhook:', error);
    
    // Return basic error response
    const twiml = new twilio.twiml.VoiceResponse();
    twiml.say('Sorry, there was an error processing your call. Please try again later.');
    twiml.hangup();
    
    res.type('text/xml');
    res.send(twiml.toString());
  }
});

// Fallback webhook for when primary handler fails
router.post('/twilio/sip/fallback', validateTwilioSignature, (req, res) => {
  const { CallSid } = req.body;
  
  logger.logWebhook('TWILIO_SIP', 'fallback_triggered', { callSid: CallSid });
  
  const twiml = new twilio.twiml.VoiceResponse();
  twiml.say('We are experiencing technical difficulties. Please call back later or leave a message.');
  twiml.record({
    maxLength: 120,
    action: `/webhook/twilio/recording/${CallSid}`,
    method: 'POST'
  });
  
  res.type('text/xml');
  res.send(twiml.toString());
});

// Recording webhook (fallback)
router.post('/twilio/recording/:callSid', validateTwilioSignature, (req, res) => {
  const { callSid } = req.params;
  const { RecordingUrl, RecordingDuration } = req.body;
  
  logger.logWebhook('TWILIO_SIP', 'recording_received', {
    callSid,
    recordingUrl: RecordingUrl,
    duration: RecordingDuration
  });
  
  // Here you could save the recording to your database
  // or process it further
  
  const twiml = new twilio.twiml.VoiceResponse();
  twiml.say('Thank you for your message. We will get back to you soon.');
  twiml.hangup();
  
  res.type('text/xml');
  res.send(twiml.toString());
});

// General Twilio webhook for other events
router.post('/twilio', validateTwilioSignature, (req, res) => {
  const eventType = req.body.EventType || 'unknown';
  
  logger.logWebhook('TWILIO', eventType, req.body);
  
  // Handle different event types
  switch (eventType) {
    case 'call-completed':
    case 'call-failed':
      // Cleanup any active sessions
      if (req.body.CallSid) {
        OpenAIService.cleanupCallSession(req.body.CallSid).catch(error => {
          logger.error('Failed to cleanup session:', error);
        });
      }
      break;
    
    default:
      logger.info('Unhandled Twilio event:', eventType);
  }
  
  res.status(200).json({ received: true });
});

// Status callback webhook
router.post('/twilio/status', validateTwilioSignature, (req, res) => {
  const { CallSid, CallStatus, Direction } = req.body;
  
  logger.logWebhook('TWILIO_STATUS', CallStatus, {
    callSid: CallSid,
    direction: Direction,
    body: req.body
  });
  
  res.status(200).json({ received: true });
});

// OpenAI webhook (if needed for server-side controls)
router.post('/openai/:callId', async (req, res) => {
  const { callId } = req.params;
  const event = req.body;
  
  logger.logWebhook('OPENAI', event.type || 'unknown', {
    callId,
    event
  });
  
  try {
    // Handle OpenAI events
    await OpenAIService.handleWebhookEvent(callId, event);
    res.status(200).json({ received: true });
  } catch (error) {
    logger.error('Error handling OpenAI webhook:', error);
    res.status(500).json({ error: 'Failed to process webhook' });
  }
});

// Test webhook endpoint (development only)
if (config.env === 'development') {
  router.post('/test', (req, res) => {
    logger.info('Test webhook received:', req.body);
    res.json({
      message: 'Test webhook received',
      body: req.body,
      headers: req.headers,
      timestamp: new Date().toISOString()
    });
  });
}

module.exports = router;
