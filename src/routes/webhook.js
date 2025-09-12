const express = require('express');
const twilio = require('twilio');
const fetch = require('node-fetch');
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

  // Skip validation if explicitly disabled
  if (process.env.DISABLE_WEBHOOK_VALIDATION === 'true') {
    logger.warn('Skipping Twilio signature validation - disabled via env var');
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

// OpenAI SIP webhook endpoint - This is the new native flow
router.post('/openai/sip', async (req, res) => {
  try {
    const { type, data } = req.body;
    
    logger.logWebhook('OPENAI_SIP', type, {
      eventId: req.body.id,
      callId: data?.call_id,
      sipHeaders: data?.sip_headers
    });

    if (type === 'realtime.call.incoming') {
      const { call_id, sip_headers } = data;
      
      // Extract phone numbers from SIP headers
      const fromHeader = sip_headers.find(h => h.name === 'From');
      const toHeader = sip_headers.find(h => h.name === 'To');
      const callIdHeader = sip_headers.find(h => h.name === 'Call-ID');
      
      const from = fromHeader?.value?.match(/sip:([^@]+)/)?.[1] || 'unknown';
      const to = toHeader?.value?.match(/sip:([^@]+)/)?.[1] || 'unknown';
      
      logger.logCall(call_id, 'openai_sip_call_incoming', {
        from,
        to,
        callIdHeader: callIdHeader?.value
      });

      // Accept the call using OpenAI REST API
      const acceptResponse = await fetch(`https://api.openai.com/v1/realtime/calls/${call_id}/accept`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.openai.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          type: 'realtime',
          instructions: config.business.defaultInstructions,
          model: config.openai.model,
          voice: config.openai.voice,
          input_audio_format: config.openai.audioFormat,
          output_audio_format: config.openai.audioFormat,
          input_audio_transcription: {
            model: 'whisper-1'
          },
          turn_detection: {
            type: 'server_vad',
            threshold: 0.5,
            prefix_padding_ms: 300,
            silence_duration_ms: 200
          },
          tools: config.features.enableFunctionCalling ? [
            {
              type: 'function',
              name: 'get_current_time',
              description: 'Get the current time and date',
              parameters: {
                type: 'object',
                properties: {},
                required: []
              }
            },
            {
              type: 'function',
              name: 'transfer_to_human',
              description: 'Transfer the call to a human agent',
              parameters: {
                type: 'object',
                properties: {
                  reason: {
                    type: 'string',
                    description: 'Reason for transfer'
                  }
                },
                required: ['reason']
              }
            }
          ] : []
        })
      });

      if (acceptResponse.ok) {
        logger.logCall(call_id, 'call_accepted_successfully');
        
        // Wait for OpenAI to activate the session before connecting WebSocket
        // First attempt after 5 seconds
        setTimeout(async () => {
          try {
            await OpenAIService.initializeOpenAISipSession(call_id, {
              from,
              to,
              sipHeaders: sip_headers,
              acceptedAt: new Date()
            });
            logger.logCall(call_id, 'websocket_session_started');
          } catch (error) {
            logger.error(`WebSocket attempt 1 failed for call ${call_id}:`, error);
            
            // Retry after 5 more seconds if 404 error
            if (error.message?.includes('404')) {
              logger.logCall(call_id, 'websocket_retry_attempt_2');
              setTimeout(async () => {
                try {
                  await OpenAIService.initializeOpenAISipSession(call_id, {
                    from,
                    to,
                    sipHeaders: sip_headers,
                    acceptedAt: new Date()
                  });
                  logger.logCall(call_id, 'websocket_session_started_retry');
                } catch (retryError) {
                  logger.error(`Final WebSocket attempt failed for call ${call_id}:`, retryError);
                }
              }, 5000);
            }
          }
        }, 5000); // 5 second initial delay
      } else {
        const errorText = await acceptResponse.text();
        logger.error(`Failed to accept call ${call_id}:`, errorText);
        
        // Reject the call if accept fails
        await fetch(`https://api.openai.com/v1/realtime/calls/${call_id}/reject`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${config.openai.apiKey}`,
            'Content-Type': 'application/json'
          }
        });
      }
    }

    res.status(200).json({ received: true });
  } catch (error) {
    logger.error('Error in OpenAI SIP webhook:', error);
    
    // Try to reject the call on error
    if (data?.call_id) {
      try {
        await fetch(`https://api.openai.com/v1/realtime/calls/${data.call_id}/reject`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${config.openai.apiKey}`,
            'Content-Type': 'application/json'
          }
        });
        logger.logCall(data.call_id, 'call_rejected_due_to_error');
      } catch (rejectError) {
        logger.error('Failed to reject call after error:', rejectError);
      }
    }
    
    res.status(500).json({ error: 'Failed to process OpenAI webhook' });
  }
});

// Twilio SIP webhook endpoint - Keep for backward compatibility
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

      // For now, let's use basic text-to-speech while we configure proper audio
      twiml.say({
        voice: 'alice',
        language: 'es-MX'
      }, '¡Hola! Soy tu asistente de inteligencia artificial de VADAI Agency. ¿En qué puedo ayudarte hoy?');
      
      // Pause to let user speak
      twiml.pause({ length: 2 });
      
      // For now, let's record their response
      twiml.record({
        maxLength: 30,
        action: `/webhook/twilio/recording/${CallSid}`,
        method: 'POST',
        playBeep: false
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