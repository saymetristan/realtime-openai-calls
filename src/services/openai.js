const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const config = require('../config/config');
const logger = require('../utils/logger');

class OpenAIService {
  constructor() {
    this.activeSessions = new Map(); // callSid -> session data
    this.websockets = new Map(); // callSid -> WebSocket connection
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;
    
    logger.info('Initializing OpenAI service...');
    
    // Validate configuration
    if (!config.openai.apiKey) {
      throw new Error('OpenAI API key is required');
    }
    
    this.initialized = true;
    logger.info('OpenAI service initialized successfully');
  }

  async initializeCallSession(callSid, callData) {
    try {
      logger.logOpenAI(callSid, 'initializing_session', callData);

      // Create session data
      const sessionData = {
        callSid,
        callData,
        sessionId: uuidv4(),
        startTime: new Date(),
        status: 'initializing',
        events: [],
        metadata: callData.metadata || {}
      };

      // Store session
      this.activeSessions.set(callSid, sessionData);

      // Connect to OpenAI Realtime WebSocket
      const wsUrl = `wss://api.openai.com/v1/realtime?model=${config.openai.model}`;
      const headers = {
        'Authorization': `Bearer ${config.openai.apiKey}`,
        'OpenAI-Beta': 'realtime=v1'
      };

      if (config.openai.organization) {
        headers['OpenAI-Organization'] = config.openai.organization;
      }

      if (config.openai.project) {
        headers['OpenAI-Project'] = config.openai.project;
      }

      const ws = new WebSocket(wsUrl, { headers });

      // Setup WebSocket event handlers
      this.setupWebSocketHandlers(ws, callSid, sessionData);

      // Store WebSocket connection
      this.websockets.set(callSid, ws);

      logger.logOpenAI(callSid, 'session_created', {
        sessionId: sessionData.sessionId
      });

      return sessionData;
    } catch (error) {
      logger.error(`Failed to initialize OpenAI session for call ${callSid}:`, error);
      
      // Cleanup on error
      this.activeSessions.delete(callSid);
      this.websockets.delete(callSid);
      
      throw error;
    }
  }

  setupWebSocketHandlers(ws, callSid, sessionData) {
    ws.on('open', () => {
      logger.logOpenAI(callSid, 'websocket_connected');
      
      // Send initial session configuration
      this.sendSessionUpdate(ws, callSid);
      
      // Update session status
      sessionData.status = 'connected';
      sessionData.connectedAt = new Date();
    });

    ws.on('message', (data) => {
      try {
        const event = JSON.parse(data.toString());
        this.handleServerEvent(callSid, event);
      } catch (error) {
        logger.error(`Error parsing OpenAI message for call ${callSid}:`, error);
      }
    });

    ws.on('error', (error) => {
      logger.error(`OpenAI WebSocket error for call ${callSid}:`, error);
      
      // Update session status
      if (this.activeSessions.has(callSid)) {
        this.activeSessions.get(callSid).status = 'error';
      }
    });

    ws.on('close', (code, reason) => {
      logger.logOpenAI(callSid, 'websocket_closed', {
        code,
        reason: reason.toString()
      });
      
      // Cleanup
      this.cleanupCallSession(callSid);
    });
  }

  sendSessionUpdate(ws, callSid) {
    const sessionConfig = {
      type: 'session.update',
      session: {
        modalities: ['text', 'audio'],
        instructions: config.business.defaultInstructions,
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
        tools: config.features.enableFunctionCalling ? this.getDefaultTools() : [],
        tool_choice: 'auto',
        temperature: 0.8,
        max_response_output_tokens: 4096
      }
    };

    this.sendEvent(ws, callSid, sessionConfig);
  }

  getDefaultTools() {
    return [
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
        name: 'schedule_callback',
        description: 'Schedule a callback for the user',
        parameters: {
          type: 'object',
          properties: {
            phone_number: {
              type: 'string',
              description: 'The phone number to call back'
            },
            preferred_time: {
              type: 'string',
              description: 'Preferred callback time'
            },
            reason: {
              type: 'string',
              description: 'Reason for callback'
            }
          },
          required: ['phone_number', 'preferred_time']
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
            },
            urgency: {
              type: 'string',
              enum: ['low', 'medium', 'high'],
              description: 'Urgency level'
            }
          },
          required: ['reason']
        }
      }
    ];
  }

  handleServerEvent(callSid, event) {
    const sessionData = this.activeSessions.get(callSid);
    if (!sessionData) {
      logger.warn(`Received event for unknown call ${callSid}:`, event.type);
      return;
    }

    // Log event
    sessionData.events.push({
      type: event.type,
      timestamp: new Date(),
      data: event
    });

    logger.logOpenAI(callSid, `event_${event.type}`, {
      eventId: event.event_id
    });

    // Handle specific events
    switch (event.type) {
      case 'session.created':
        this.handleSessionCreated(callSid, event);
        break;
      
      case 'session.updated':
        this.handleSessionUpdated(callSid, event);
        break;
        
      case 'conversation.item.created':
        this.handleConversationItem(callSid, event);
        break;
        
      case 'response.function_call_arguments.done':
        this.handleFunctionCall(callSid, event);
        break;
        
      case 'response.done':
        this.handleResponseDone(callSid, event);
        break;
        
      case 'error':
        this.handleError(callSid, event);
        break;
        
      default:
        // Log other events for debugging
        if (config.logging.debugMode) {
          logger.debug(`Unhandled OpenAI event: ${event.type}`, event);
        }
    }
  }

  handleSessionCreated(callSid, event) {
    const sessionData = this.activeSessions.get(callSid);
    if (sessionData) {
      sessionData.openaiSessionId = event.session.id;
      sessionData.status = 'active';
      logger.logOpenAI(callSid, 'session_active', {
        openaiSessionId: event.session.id
      });
    }
  }

  handleSessionUpdated(callSid, event) {
    logger.logOpenAI(callSid, 'session_updated');
  }

  handleConversationItem(callSid, event) {
    const sessionData = this.activeSessions.get(callSid);
    if (sessionData) {
      sessionData.lastActivity = new Date();
    }
  }

  async handleFunctionCall(callSid, event) {
    try {
      const { name, arguments: args, call_id } = event;
      
      logger.logOpenAI(callSid, 'function_call', {
        functionName: name,
        callId: call_id
      });

      let result;
      
      switch (name) {
        case 'get_current_time':
          result = this.getCurrentTime();
          break;
          
        case 'schedule_callback':
          result = await this.scheduleCallback(JSON.parse(args));
          break;
          
        case 'transfer_to_human':
          result = await this.transferToHuman(callSid, JSON.parse(args));
          break;
          
        default:
          result = { error: `Unknown function: ${name}` };
      }

      // Send function result back to OpenAI
      const ws = this.websockets.get(callSid);
      if (ws && ws.readyState === WebSocket.OPEN) {
        this.sendEvent(ws, callSid, {
          type: 'conversation.item.create',
          item: {
            type: 'function_call_output',
            call_id,
            output: JSON.stringify(result)
          }
        });
      }
      
    } catch (error) {
      logger.error(`Error handling function call for ${callSid}:`, error);
    }
  }

  getCurrentTime() {
    return {
      current_time: new Date().toLocaleString(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
    };
  }

  async scheduleCallback(args) {
    // Here you would integrate with your scheduling system
    logger.info('Callback scheduled:', args);
    
    return {
      success: true,
      message: 'Callback scheduled successfully',
      callback_id: uuidv4(),
      scheduled_time: args.preferred_time
    };
  }

  async transferToHuman(callSid, args) {
    logger.logCall(callSid, 'transfer_to_human_requested', args);
    
    // Here you would integrate with your human agent system
    return {
      success: true,
      message: 'Transfer to human agent initiated',
      reason: args.reason,
      urgency: args.urgency || 'medium'
    };
  }

  handleResponseDone(callSid, event) {
    const sessionData = this.activeSessions.get(callSid);
    if (sessionData) {
      sessionData.lastActivity = new Date();
      sessionData.totalTokens = (sessionData.totalTokens || 0) + (event.response?.usage?.total_tokens || 0);
    }
  }

  handleError(callSid, event) {
    logger.error(`OpenAI error for call ${callSid}:`, event.error);
    
    const sessionData = this.activeSessions.get(callSid);
    if (sessionData) {
      sessionData.status = 'error';
      sessionData.error = event.error;
    }
  }

  sendEvent(ws, callSid, event) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(event));
      logger.logOpenAI(callSid, `sent_${event.type}`);
    } else {
      logger.warn(`Cannot send event to closed WebSocket for call ${callSid}`);
    }
  }

  async cleanupCallSession(callSid) {
    try {
      logger.logOpenAI(callSid, 'cleaning_up_session');

      // Close WebSocket connection
      const ws = this.websockets.get(callSid);
      if (ws) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.close();
        }
        this.websockets.delete(callSid);
      }

      // Update session data before removing
      const sessionData = this.activeSessions.get(callSid);
      if (sessionData) {
        sessionData.endTime = new Date();
        sessionData.duration = sessionData.endTime - sessionData.startTime;
        sessionData.status = 'completed';
        
        // Log session summary
        logger.logOpenAI(callSid, 'session_summary', {
          duration: sessionData.duration,
          totalTokens: sessionData.totalTokens,
          eventCount: sessionData.events.length
        });

        // Remove from active sessions
        this.activeSessions.delete(callSid);
      }

      logger.logOpenAI(callSid, 'session_cleaned_up');
    } catch (error) {
      logger.error(`Error cleaning up session for call ${callSid}:`, error);
    }
  }

  getActiveSessions() {
    return Array.from(this.activeSessions.values());
  }

  getSession(callSid) {
    return this.activeSessions.get(callSid) || null;
  }

  async handleWebhookEvent(callId, event) {
    // Handle webhook events from OpenAI if using server-side controls
    logger.logOpenAI(callId, 'webhook_event', event);
    
    // Implementation for server-side webhook handling
    // This would be used for advanced features
  }
}

module.exports = new OpenAIService();
