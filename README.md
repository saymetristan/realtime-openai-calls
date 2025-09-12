# Sistema de Llamadas AI con OpenAI Realtime API

Sistema de voz AI que permite realizar y recibir llamadas telefónicas utilizando la Realtime API de OpenAI con conexión SIP a través de Twilio.

## 🚀 Características

- **Llamadas Inbound**: Recibe llamadas telefónicas y responde con AI
- **Llamadas Outbound**: Realiza llamadas automáticas desde tu aplicación
- **Integración OpenAI**: Utiliza la Realtime API para conversaciones naturales
- **SIP Integration**: Conecta teléfonos tradicionales vía Twilio SIP
- **Function Calling**: El AI puede ejecutar funciones personalizadas
- **Monitoreo**: Logs detallados y métricas de llamadas
- **Escalabilidad**: Diseñado para manejar múltiples llamadas concurrentes

## 📋 Requisitos Previos

- Node.js 18+
- Cuenta OpenAI con acceso a Realtime API
- Cuenta Twilio con número telefónico
- PostgreSQL (opcional, para logs persistentes)
- Redis (opcional, para cache de sesiones)

## ⚙️ Configuración

### 1. Clonar el repositorio
```bash
git clone <repository-url>
cd realtime-openai-calls
```

### 2. Instalar dependencias
```bash
npm install
```

### 3. Configurar variables de entorno
```bash
cp .env.example .env
```

Llena las variables en `.env` con tus credenciales:

```env
# OpenAI
OPENAI_API_KEY=sk-proj-your-api-key
OPENAI_ORGANIZATION=org-your-org-id
OPENAI_PROJECT=proj_your-project-id

# Twilio
TWILIO_ACCOUNT_SID=ACxxxxxxxxxx
TWILIO_AUTH_TOKEN=your-auth-token
TWILIO_PHONE_NUMBER=+1234567890
TWILIO_SIP_DOMAIN=your-domain.sip.twilio.com

# Server
PORT=3000
SERVER_URL=https://your-domain.railway.app
```

### 4. Configurar Twilio SIP Domain

1. Ve a Twilio Console > Voice > SIP Domains
2. Crea un nuevo SIP Domain:
   - **Friendly Name**: `vadai-sip-realtime`
   - **SIP URI**: `vadai-realtime.sip.twilio.com`
3. En "Call Control Configuration":
   - **A CALL COMES IN**: `https://your-domain.railway.app/webhook/twilio/sip`
   - **PRIMARY HANDLER FAILS**: `https://your-domain.railway.app/webhook/twilio/sip/fallback`

## 🚀 Deployment en Railway

### 1. Conectar con Railway
```bash
# Instalar Railway CLI
npm install -g @railway/cli

# Login
railway login

# Inicializar proyecto
railway init
```

### 2. Configurar variables de entorno en Railway
```bash
# Configurar todas las variables de .env en Railway
railway variables set OPENAI_API_KEY=sk-proj-your-key
railway variables set TWILIO_ACCOUNT_SID=ACxxxxxxxxxx
# ... todas las demás variables
```

### 3. Deploy
```bash
railway deploy
```

### 4. Obtener URL de producción
Después del deploy, Railway te dará una URL como:
`https://realtime-openai-calls-production.up.railway.app`

### 5. Actualizar webhook en Twilio
Actualiza la configuración del SIP Domain con tu nueva URL de Railway.

## 📞 Uso

### Llamadas Inbound
1. Llama al número configurado en Twilio
2. La llamada se conecta automáticamente con el AI
3. Habla naturalmente con el asistente

### Llamadas Outbound
```bash
curl -X POST https://your-domain.railway.app/api/calls/outbound \
  -H "Content-Type: application/json" \
  -d '{
    "to": "+1234567890",
    "instructions": "You are a sales assistant calling to follow up.",
    "voice": "alloy"
  }'
```

### Monitoreo
- Health check: `GET /health`
- Llamadas activas: `GET /api/calls/active`
- Estadísticas: `GET /api/calls/stats/summary`

## 🛠️ Desarrollo Local

### 1. Instalar ngrok para testing
```bash
npm install -g ngrok
ngrok http 3000
```

### 2. Actualizar SERVER_URL
```env
SERVER_URL=https://abc123.ngrok.io
```

### 3. Ejecutar en desarrollo
```bash
npm run dev
```

### 4. Testing
```bash
# Test webhook
curl -X POST http://localhost:3000/webhook/test \
  -H "Content-Type: application/json" \
  -d '{"test": "data"}'

# Health check
curl http://localhost:3000/health
```

## 📊 Estructura del Proyecto

```
src/
├── config/
│   └── config.js          # Configuración general
├── middleware/
│   └── errorHandler.js    # Manejo de errores
├── routes/
│   ├── health.js          # Health checks
│   ├── webhook.js         # Webhooks de Twilio/OpenAI
│   └── calls.js           # API de llamadas
├── services/
│   ├── openai.js          # Servicio OpenAI Realtime
│   └── twilio.js          # Servicio Twilio
├── utils/
│   └── logger.js          # Sistema de logging
└── server.js              # Servidor principal
```

## 🔧 Configuración Avanzada

### Function Calling
El AI puede ejecutar funciones personalizadas:
- `get_current_time`: Obtiene fecha/hora actual
- `schedule_callback`: Agenda una llamada de retorno
- `transfer_to_human`: Transfiere a un agente humano

### Personalización de Prompts
Modifica `DEFAULT_INSTRUCTIONS` en tu `.env`:
```env
DEFAULT_INSTRUCTIONS="You are a helpful customer service AI for VADAI Agency. Be friendly and professional."
```

### Límites y Costos
```env
MAX_CONCURRENT_CALLS=50
MAX_COST_PER_CALL=5.00
DAILY_BUDGET_LIMIT=500.00
```

## 📈 Monitoreo y Métricas

### Logs
- Todos los logs se guardan con Winston
- Logs específicos por call ID y session ID
- Diferentes niveles: error, warn, info, debug

### Métricas Disponibles
- Duración promedio de llamadas
- Tasa de éxito de conexiones
- Costos por llamada
- Tokens utilizados por OpenAI
- Llamadas concurrentes

### Health Checks
- `GET /health` - Estado básico
- `GET /health/detailed` - Estado detallado con servicios
- `GET /health/ready` - Readiness probe
- `GET /health/live` - Liveness probe

## 🔒 Seguridad

- Validación de firmas de Twilio webhooks
- Rate limiting en endpoints públicos
- Headers de seguridad con Helmet
- Validación de entrada con express-validator
- Logs de auditoría completos

## 🐛 Troubleshooting

### Llamadas no se conectan
1. Verificar configuración SIP en Twilio
2. Revisar logs: `railway logs`
3. Verificar webhook URL está accesible
4. Comprobar API keys de OpenAI

### Audio de mala calidad
1. Verificar formato de audio (`pcm16` recomendado)
2. Revisar latencia de red
3. Comprobar configuración VAD

### Errores de costo
1. Verificar límites en `.env`
2. Monitorear usage de OpenAI
3. Revisar precios de Twilio

## 📝 Logs Importantes

```bash
# Ver logs en Railway
railway logs --follow

# Filtrar por tipo
railway logs | grep "CALL"
railway logs | grep "ERROR"
```

## 🤝 Contribución

1. Fork el proyecto
2. Crea una rama para tu feature
3. Commit tus cambios
4. Push a la rama
5. Abre un Pull Request

## 📄 Licencia

MIT License - ver archivo LICENSE para detalles.

## 📞 Soporte

Para soporte técnico:
- Email: support@vadai.agency
- Documentation: `/documentation/`
- Issues: GitHub Issues

---

**🎉 ¡Tu sistema de llamadas AI está listo para usar!**
