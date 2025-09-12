const express = require('express');
const { body, validationResult } = require('express-validator');
const config = require('../config/config');
const logger = require('../utils/logger');
const TwilioService = require('../services/twilio');
const OpenAIService = require('../services/openai');

const router = express.Router();

// Validation middleware
const validatePhoneNumber = body('to')
  .isMobilePhone('any')
  .withMessage('Invalid phone number format');

const validateOutboundCall = [
  validatePhoneNumber,
  body('instructions').optional().isString().isLength({ max: 1000 }),
  body('voice').optional().isIn(['alloy', 'ash', 'ballad', 'coral', 'echo', 'sage', 'shimmer', 'verse']),
  body('metadata').optional().isObject()
];

// Get active calls
router.get('/active', async (req, res) => {
  try {
    const activeCalls = await OpenAIService.getActiveSessions();
    
    res.json({
      success: true,
      count: activeCalls.length,
      calls: activeCalls,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting active calls:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get active calls'
    });
  }
});

// Initiate outbound call
router.post('/outbound', validateOutboundCall, async (req, res) => {
  try {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { to, instructions, voice, metadata } = req.body;
    
    // Check if outbound calls are enabled
    if (!config.features.enableOutboundCalls) {
      return res.status(403).json({
        success: false,
        error: 'Outbound calls are not enabled'
      });
    }

    // Check rate limits and concurrent calls
    const activeCalls = await OpenAIService.getActiveSessions();
    if (activeCalls.length >= config.limits.maxConcurrentCalls) {
      return res.status(429).json({
        success: false,
        error: 'Maximum concurrent calls reached',
        limit: config.limits.maxConcurrentCalls,
        current: activeCalls.length
      });
    }

    logger.info('Initiating outbound call:', {
      to,
      instructions: instructions ? 'custom' : 'default',
      voice: voice || config.openai.voice,
      metadata
    });

    // Initiate call through Twilio
    const call = await TwilioService.initiateOutboundCall({
      to,
      instructions: instructions || config.business.defaultInstructions,
      voice: voice || config.openai.voice,
      metadata
    });

    logger.logCall(call.sid, 'outbound_call_initiated', {
      to,
      status: call.status
    });

    res.status(201).json({
      success: true,
      call: {
        sid: call.sid,
        to: call.to,
        from: call.from,
        status: call.status,
        direction: call.direction,
        dateCreated: call.dateCreated
      },
      message: 'Outbound call initiated successfully'
    });

  } catch (error) {
    logger.error('Error initiating outbound call:', error);
    
    let statusCode = 500;
    let errorMessage = 'Failed to initiate outbound call';
    
    // Handle specific Twilio errors
    if (error.code === 21211) {
      statusCode = 400;
      errorMessage = 'Invalid phone number';
    } else if (error.code === 21612) {
      statusCode = 400;
      errorMessage = 'The phone number is not reachable';
    } else if (error.code === 21614) {
      statusCode = 400;
      errorMessage = 'Invalid caller ID';
    }
    
    res.status(statusCode).json({
      success: false,
      error: errorMessage,
      code: error.code || null
    });
  }
});

// Get call details
router.get('/:callSid', async (req, res) => {
  try {
    const { callSid } = req.params;
    
    const [twilioCall, openaiSession] = await Promise.all([
      TwilioService.getCall(callSid),
      OpenAIService.getSession(callSid)
    ]);
    
    res.json({
      success: true,
      call: {
        twilio: twilioCall,
        openai: openaiSession
      }
    });
  } catch (error) {
    logger.error('Error getting call details:', error);
    
    if (error.code === 20404) {
      return res.status(404).json({
        success: false,
        error: 'Call not found'
      });
    }
    
    res.status(500).json({
      success: false,
      error: 'Failed to get call details'
    });
  }
});

// End call
router.delete('/:callSid', async (req, res) => {
  try {
    const { callSid } = req.params;
    
    logger.logCall(callSid, 'ending_call_requested');
    
    // End call in Twilio
    await TwilioService.endCall(callSid);
    
    // Cleanup OpenAI session
    await OpenAIService.cleanupCallSession(callSid);
    
    logger.logCall(callSid, 'call_ended');
    
    res.json({
      success: true,
      message: 'Call ended successfully'
    });
  } catch (error) {
    logger.error('Error ending call:', error);
    
    if (error.code === 20404) {
      return res.status(404).json({
        success: false,
        error: 'Call not found'
      });
    }
    
    res.status(500).json({
      success: false,
      error: 'Failed to end call'
    });
  }
});

// Transfer call to human (if feature enabled)
router.post('/:callSid/transfer', async (req, res) => {
  try {
    const { callSid } = req.params;
    const { to, reason } = req.body;
    
    if (!config.features.enableHumanTransfer) {
      return res.status(403).json({
        success: false,
        error: 'Human transfer is not enabled'
      });
    }
    
    if (!to) {
      return res.status(400).json({
        success: false,
        error: 'Transfer destination is required'
      });
    }
    
    logger.logCall(callSid, 'transfer_requested', {
      to,
      reason
    });
    
    // Transfer call through Twilio
    await TwilioService.transferCall(callSid, to);
    
    // Cleanup OpenAI session
    await OpenAIService.cleanupCallSession(callSid);
    
    logger.logCall(callSid, 'call_transferred', { to });
    
    res.json({
      success: true,
      message: 'Call transferred successfully'
    });
  } catch (error) {
    logger.error('Error transferring call:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to transfer call'
    });
  }
});

// Get call statistics
router.get('/stats/summary', async (req, res) => {
  try {
    const { from, to } = req.query;
    
    const stats = await TwilioService.getCallStats({
      startDate: from,
      endDate: to
    });
    
    res.json({
      success: true,
      stats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting call statistics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get call statistics'
    });
  }
});

module.exports = router;
