const twilio = require('twilio');
const config = require('../config/config');
const logger = require('../utils/logger');

class TwilioService {
  constructor() {
    this.client = null;
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;
    
    logger.info('Initializing Twilio service...');
    
    // Validate configuration
    if (!config.twilio.accountSid || !config.twilio.authToken) {
      throw new Error('Twilio Account SID and Auth Token are required');
    }
    
    // Initialize Twilio client
    this.client = twilio(config.twilio.accountSid, config.twilio.authToken);
    
    // Test the connection
    try {
      await this.client.api.accounts(config.twilio.accountSid).fetch();
      logger.info('Twilio connection verified successfully');
    } catch (error) {
      throw new Error(`Failed to connect to Twilio: ${error.message}`);
    }
    
    this.initialized = true;
    logger.info('Twilio service initialized successfully');
  }

  async initiateOutboundCall({ to, instructions, voice, metadata }) {
    try {
      if (!this.initialized) {
        throw new Error('Twilio service not initialized');
      }

      logger.logTwilio('outbound', 'initiating_call', {
        to,
        from: config.twilio.phoneNumber
      });

      // Prepare the call parameters
      const callParams = {
        to: to,
        from: config.twilio.phoneNumber,
        url: `${config.serverUrl}/webhook/twilio/sip`,
        method: 'POST',
        statusCallback: `${config.serverUrl}/webhook/twilio/status`,
        statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed', 'failed'],
        statusCallbackMethod: 'POST',
        record: config.features.enableCallRecording,
        timeout: 30,
        // Pass custom parameters for the AI session
        machineDetection: 'Enable',
        machineDetectionTimeout: 5
      };

      // Add metadata as custom parameters
      if (metadata) {
        Object.keys(metadata).forEach(key => {
          callParams[`custom_${key}`] = metadata[key];
        });
      }

      // Create the call
      const call = await this.client.calls.create(callParams);

      logger.logTwilio(call.sid, 'call_created', {
        to: call.to,
        from: call.from,
        status: call.status
      });

      return {
        sid: call.sid,
        to: call.to,
        from: call.from,
        status: call.status,
        direction: call.direction,
        dateCreated: call.dateCreated
      };

    } catch (error) {
      logger.error('Error initiating outbound call:', error);
      throw error;
    }
  }

  async getCall(callSid) {
    try {
      if (!this.initialized) {
        throw new Error('Twilio service not initialized');
      }

      const call = await this.client.calls(callSid).fetch();
      
      return {
        sid: call.sid,
        to: call.to,
        from: call.from,
        status: call.status,
        direction: call.direction,
        duration: call.duration,
        price: call.price,
        priceUnit: call.priceUnit,
        dateCreated: call.dateCreated,
        dateUpdated: call.dateUpdated,
        startTime: call.startTime,
        endTime: call.endTime
      };

    } catch (error) {
      logger.error(`Error getting call ${callSid}:`, error);
      throw error;
    }
  }

  async endCall(callSid) {
    try {
      if (!this.initialized) {
        throw new Error('Twilio service not initialized');
      }

      logger.logTwilio(callSid, 'ending_call');

      const call = await this.client.calls(callSid).update({
        status: 'completed'
      });

      logger.logTwilio(callSid, 'call_ended', {
        status: call.status
      });

      return call;

    } catch (error) {
      logger.error(`Error ending call ${callSid}:`, error);
      throw error;
    }
  }

  async transferCall(callSid, transferTo) {
    try {
      if (!this.initialized) {
        throw new Error('Twilio service not initialized');
      }

      logger.logTwilio(callSid, 'transferring_call', {
        transferTo
      });

      // Create TwiML for transfer
      const twiml = new twilio.twiml.VoiceResponse();
      twiml.say('Please hold while we transfer your call.');
      twiml.dial(transferTo);

      // Update the call with new TwiML
      const call = await this.client.calls(callSid).update({
        twiml: twiml.toString()
      });

      logger.logTwilio(callSid, 'call_transferred', {
        transferTo,
        status: call.status
      });

      return call;

    } catch (error) {
      logger.error(`Error transferring call ${callSid}:`, error);
      throw error;
    }
  }

  async getCallStats({ startDate, endDate }) {
    try {
      if (!this.initialized) {
        throw new Error('Twilio service not initialized');
      }

      const params = {
        pageSize: 1000
      };

      if (startDate) {
        params.startTimeAfter = new Date(startDate);
      }

      if (endDate) {
        params.startTimeBefore = new Date(endDate);
      }

      const calls = await this.client.calls.list(params);

      // Calculate statistics
      const stats = {
        totalCalls: calls.length,
        inboundCalls: 0,
        outboundCalls: 0,
        completedCalls: 0,
        failedCalls: 0,
        totalDuration: 0,
        totalCost: 0,
        averageDuration: 0,
        successRate: 0
      };

      calls.forEach(call => {
        if (call.direction === 'inbound') {
          stats.inboundCalls++;
        } else {
          stats.outboundCalls++;
        }

        if (call.status === 'completed') {
          stats.completedCalls++;
          stats.totalDuration += parseInt(call.duration) || 0;
        } else if (call.status === 'failed' || call.status === 'busy' || call.status === 'no-answer') {
          stats.failedCalls++;
        }

        if (call.price) {
          stats.totalCost += Math.abs(parseFloat(call.price));
        }
      });

      // Calculate derived statistics
      stats.averageDuration = stats.completedCalls > 0 ? 
        Math.round(stats.totalDuration / stats.completedCalls) : 0;
      
      stats.successRate = stats.totalCalls > 0 ? 
        Math.round((stats.completedCalls / stats.totalCalls) * 100) : 0;

      return stats;

    } catch (error) {
      logger.error('Error getting call statistics:', error);
      throw error;
    }
  }

  async createSipDomain(friendlyName, sipUri) {
    try {
      if (!this.initialized) {
        throw new Error('Twilio service not initialized');
      }

      const domain = await this.client.sip.domains.create({
        friendlyName,
        domainName: sipUri,
        voiceUrl: `${config.serverUrl}/webhook/twilio/sip`,
        voiceMethod: 'POST',
        voiceFallbackUrl: `${config.serverUrl}/webhook/twilio/sip/fallback`,
        voiceFallbackMethod: 'POST'
      });

      logger.info('SIP domain created:', {
        sid: domain.sid,
        domainName: domain.domainName
      });

      return domain;

    } catch (error) {
      logger.error('Error creating SIP domain:', error);
      throw error;
    }
  }

  async getSipDomains() {
    try {
      if (!this.initialized) {
        throw new Error('Twilio service not initialized');
      }

      const domains = await this.client.sip.domains.list();
      return domains;

    } catch (error) {
      logger.error('Error getting SIP domains:', error);
      throw error;
    }
  }

  async validatePhoneNumber(phoneNumber) {
    try {
      if (!this.initialized) {
        throw new Error('Twilio service not initialized');
      }

      const lookup = await this.client.lookups.v1.phoneNumbers(phoneNumber).fetch({
        type: ['carrier']
      });

      return {
        valid: true,
        phoneNumber: lookup.phoneNumber,
        countryCode: lookup.countryCode,
        nationalFormat: lookup.nationalFormat,
        carrier: lookup.carrier
      };

    } catch (error) {
      if (error.status === 404) {
        return {
          valid: false,
          error: 'Invalid phone number'
        };
      }
      
      logger.error('Error validating phone number:', error);
      throw error;
    }
  }

  // Helper method to format TwiML response for OpenAI integration
  createOpenAITwiML(customInstructions) {
    const twiml = new twilio.twiml.VoiceResponse();
    
    // Connect to OpenAI Realtime via Media Stream
    const connect = twiml.connect();
    connect.stream({
      url: `wss://api.openai.com/v1/realtime?model=${config.openai.model}`,
      name: 'openai_stream'
    });

    return twiml.toString();
  }

  // Helper method to create fallback TwiML
  createFallbackTwiML(message = 'Sorry, we are experiencing technical difficulties. Please try again later.') {
    const twiml = new twilio.twiml.VoiceResponse();
    twiml.say(message);
    twiml.hangup();
    return twiml.toString();
  }

  // Webhook signature validation
  validateWebhookSignature(signature, url, params) {
    return twilio.validateRequest(
      config.twilio.authToken,
      signature,
      url,
      params
    );
  }
}

module.exports = new TwilioService();
