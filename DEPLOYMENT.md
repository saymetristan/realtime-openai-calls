# 🚀 Guía de Deployment a Railway

## Paso 1: Preparar Railway

### 1.1 Instalar Railway CLI
```bash
npm install -g @railway/cli
```

### 1.2 Login a Railway
```bash
railway login
```

### 1.3 Crear nuevo proyecto
```bash
railway init
```

## Paso 2: Configurar Variables de Entorno

Copia todas las variables de tu `.env` a Railway:

```bash
# OpenAI
railway variables set OPENAI_API_KEY="sk-proj-your-openai-api-key-here"
railway variables set OPENAI_ORGANIZATION="org-your-organization-id"
railway variables set OPENAI_PROJECT="proj_your-project-id"

# Twilio  
railway variables set TWILIO_ACCOUNT_SID="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
railway variables set TWILIO_AUTH_TOKEN="your-twilio-auth-token"
railway variables set TWILIO_API_KEY="SKxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
railway variables set TWILIO_API_SECRET="your-twilio-api-secret"
railway variables set TWILIO_PHONE_NUMBER="+1234567890"
railway variables set TWILIO_SIP_DOMAIN="vadai-realtime.sip.twilio.com"

# Configuración de Producción
railway variables set NODE_ENV="production"
railway variables set LOG_LEVEL="info"
railway variables set DEBUG_MODE="false"

# Límites y seguridad
railway variables set MAX_CONCURRENT_CALLS="50"
railway variables set CALL_TIMEOUT_MINUTES="30"
railway variables set DAILY_BUDGET_LIMIT="500.00"

# Configuración de AI
railway variables set OPENAI_REALTIME_MODEL="gpt-4o-realtime-preview"
railway variables set OPENAI_VOICE="alloy"
railway variables set AUDIO_FORMAT="pcm16"

# Business
railway variables set COMPANY_NAME="VADAI Agency"
railway variables set DEFAULT_INSTRUCTIONS="You are a helpful AI assistant for VADAI Agency. Speak clearly and be concise."
```

## Paso 3: Deploy

### 3.1 Deploy inicial
```bash
railway deploy
```

### 3.2 Obtener URL
Después del deploy, Railway te dará una URL como:
```
https://realtime-openai-calls-production.up.railway.app
```

### 3.3 Actualizar SERVER_URL
```bash
railway variables set SERVER_URL="https://tu-url-de-railway.up.railway.app"
```

### 3.4 Re-deploy con la URL correcta
```bash
railway deploy
```

## Paso 4: Configurar Twilio SIP Domain

### 4.1 Ir a Twilio Console
- Ve a: Console > Voice > SIP Domains
- Encuentra tu domain: `vadai-realtime.sip.twilio.com`

### 4.2 Actualizar Webhooks
En "Call Control Configuration":

**A CALL COMES IN:**
```
https://tu-url-de-railway.up.railway.app/webhook/twilio/sip
HTTP POST
```

**PRIMARY HANDLER FAILS:**
```
https://tu-url-de-railway.up.railway.app/webhook/twilio/sip/fallback
HTTP POST
```

### 4.3 Guardar configuración
Haz clic en "Save" en el SIP Domain.

## Paso 5: Testing

### 5.1 Health Check
```bash
curl https://tu-url-de-railway.up.railway.app/health
```

Deberías ver:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "uptime": 123,
  "environment": "production",
  "version": "1.0.0",
  "services": {
    "server": "operational",
    "openai": "configured",
    "twilio": "configured"
  }
}
```

### 5.2 Test de Webhook
```bash
curl -X POST https://tu-url-de-railway.up.railway.app/webhook/test \
  -H "Content-Type: application/json" \
  -d '{"test": "deployment"}'
```

### 5.3 Test de llamada
¡Llama a tu número Twilio configurado!

## Paso 6: Monitoreo

### 6.1 Ver logs en tiempo real
```bash
railway logs --follow
```

### 6.2 Ver status del deployment
```bash
railway status
```

### 6.3 Dashboard de Railway
Puedes ver métricas en: https://railway.app/dashboard

## 🎯 URLs Importantes Post-Deployment

Una vez deployado, estas son tus URLs importantes:

```
# Health checks
https://tu-url.railway.app/health
https://tu-url.railway.app/health/detailed

# Webhooks (para Twilio)
https://tu-url.railway.app/webhook/twilio/sip
https://tu-url.railway.app/webhook/twilio/sip/fallback

# API endpoints
https://tu-url.railway.app/api/calls/active
https://tu-url.railway.app/api/calls/stats/summary
```

## 🔧 Comandos Útiles Post-Deployment

```bash
# Ver logs
railway logs --follow

# Ver variables
railway variables

# Re-deploy
railway deploy

# Acceso directo al proyecto
railway open
```

## ⚠️ Troubleshooting

### Error: "OpenAI service not initialized"
- Verifica que `OPENAI_API_KEY` esté configurada
- Revisa los logs: `railway logs`

### Error: "Twilio service not initialized"  
- Verifica `TWILIO_ACCOUNT_SID` y `TWILIO_AUTH_TOKEN`
- Confirma que las credenciales son correctas

### Llamadas no conectan
1. Verifica webhook URLs en Twilio SIP Domain
2. Asegúrate que Railway esté deployado y funcionando
3. Revisa logs para errores: `railway logs`

### Audio de mala calidad
- El servidor está optimizado para `pcm16`
- Verifica latencia entre Railway y OpenAI
- Revisa configuración VAD en OpenAI

## 🎉 ¡Listo!

Tu sistema de llamadas AI está ahora en producción y listo para recibir llamadas telefónicas reales con OpenAI Realtime API.

**Próximos pasos:**
1. Configurar base de datos para logs persistentes
2. Implementar analytics avanzados  
3. Agregar function calling personalizado
4. Setup de alertas y monitoring avanzado
