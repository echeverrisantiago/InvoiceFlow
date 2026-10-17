# EntraFactura - SaaS de Gestión Inteligente de Facturas

![EntraFactura](https://img.shields.io/badge/Next.js-15-black?logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue?logo=typescript)
![Supabase](https://img.shields.io/badge/Supabase-Enabled-green?logo=supabase)
![Prisma](https://img.shields.io/badge/Prisma-ORM-2D3748?logo=prisma)

Sistema de gestión inteligente de facturas dirigido a PYMEs en Colombia con extracción automática de datos mediante IA, backup en Google Drive y alertas de vencimiento.

## 🚀 Características

- ✅ **Autenticación Multi-Tenant**: Sistema de organizaciones con roles (Admin/Member)
- 📄 **Subida de Facturas**: Soporta PDF, imágenes, ZIP y XML (factura electrónica DIAN)
- 🤖 **Extracción automática**: factura electrónica (ZIP/XML → UBL 2.1) sin IA, y PDF/imágenes con IA (Groq)
- ☁️ **Backup Automático**: Guardado en Supabase Storage y Google Drive del usuario
- 📊 **Dashboard Inteligente**: Visualiza facturas, proveedores y resúmenes mensuales
- 🔔 **Alertas de Vencimiento**: Notificaciones por email con SendGrid
- 💳 **Suscripciones**: Planes Básico, Profesional y Empresarial con Mercado Pago
- 📱 **Responsive**: UI moderna con Tailwind CSS y shadcn/ui

## 🛠️ Stack Tecnológico

- **Frontend**: Next.js 15 (App Router), React 19, TailwindCSS, shadcn/ui
- **Backend**: Next.js API Routes, Server Actions
- **Database**: PostgreSQL (Supabase) con Prisma ORM
- **Auth**: Supabase Auth (sesiones con cookies SSR)
- **Storage**: Supabase Storage + Google Drive API
- **IA**: Groq (LangChain.js) con llama-3.3-70b-versatile
- **Emails**: SendGrid
- **Payments**: Mercado Pago
- **Deployment**: Vercel

## 🏗️ Arquitectura

Vista general de los componentes del sistema (capas, datos y servicios externos):

![Arquitectura de EntraFactura](docs/arquitectura.png)

Flujo completo de una factura, desde que entra (carga manual o correo) hasta que queda registrada:

![Flujo de una factura](docs/flujo-factura.png)

> Los diagramas también están en formato vectorial: `docs/arquitectura.svg` y `docs/flujo-factura.svg`.
> Se pueden regenerar con `node scripts/generate-diagrams.mjs`.

## 📋 Requisitos Previos

- Node.js 18+
- npm o yarn
- Cuenta de Supabase (https://supabase.com)
- Cuenta de Groq API (https://console.groq.com)
- Cuenta de SendGrid (https://sendgrid.com)
- Cuenta de Mercado Pago para Desarrolladores (https://www.mercadopago.com.co/developers)
- Proyecto en Google Cloud Console (para Google Drive API)

## 🔧 Instalación

### 1. Clonar el repositorio

```bash
git clone <repository-url>
cd EntraFactura
```

### 2. Instalar dependencias

```bash
npm install --legacy-peer-deps
```

### 3. Configurar variables de entorno

Copia el archivo `.env.example` a `.env.local` y completa las variables:

```bash
cp .env.example .env.local
```

#### Supabase

1. Crea un proyecto en https://supabase.com
2. Ve a Settings > API
3. Copia las credenciales:

```env
NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu_anon_key
SUPABASE_SERVICE_ROLE_KEY=tu_service_role_key
```

4. Ve a Settings > Database > Connection string
5. Copia la connection pooler URL:

```env
DATABASE_URL=postgresql://postgres.xxx:password@aws-0-us-west-1.pooler.supabase.com:5432/postgres?pgbouncer=true
DIRECT_URL=postgresql://postgres:password@db.xxx.supabase.co:5432/postgres
```

#### Groq AI

1. Regístrate en https://console.groq.com
2. Crea una API key en API Keys
3. Agrégala a tu `.env.local`:

```env
GROQ_API_KEY=gsk_...
```

#### SendGrid

1. Crea una cuenta en https://sendgrid.com
2. Ve a Settings > API Keys
3. Crea una API key con permisos de "Mail Send"
4. Verifica un dominio o email:

```env
SENDGRID_API_KEY=SG.xxx
SENDGRID_FROM_EMAIL=noreply@tudominio.com
```

#### Google Drive API

1. Ve a https://console.cloud.google.com
2. Crea un nuevo proyecto
3. Habilita Google Drive API
4. Crea credenciales OAuth 2.0:
   - Application type: Web application
   - Authorized redirect URIs: `http://localhost:3000/api/auth/google-drive/callback`
5. Copia las credenciales:

```env
GMAIL_CLIENT_ID=xxx.apps.googleusercontent.com
GMAIL_CLIENT_SECRET=xxx
GMAIL_REDIRECT_URI=http://localhost:3000/api/auth/email/gmail/callback
GOOGLE_DRIVE_REDIRECT_URI=http://localhost:3000/api/auth/google-drive/callback
```

#### Mercado Pago

1. Regístrate en https://www.mercadopago.com.co/developers
2. Crea una aplicación
3. Copia las credenciales de prueba:

```env
MERCADOPAGO_ACCESS_TOKEN=TEST-xxx
MERCADOPAGO_PUBLIC_KEY=TEST-xxx
```

#### Otras variables

```env
NEXT_PUBLIC_APP_URL=http://localhost:3000
CRON_SECRET=genera_un_secreto_aleatorio_seguro
```

### 4. Configurar Supabase Storage

1. Ve a tu proyecto de Supabase > Storage
2. Crea un bucket llamado `invoices`
3. Déjalo **privado** (Settings > Public bucket: **OFF**)
4. Los archivos se sirven con **URLs firmadas** de corta duración desde
   `/api/invoices/[id]/file`; no hay acceso público directo.

### 5. Configurar la base de datos

```bash
# Generar cliente de Prisma
npx prisma generate

# Ejecutar migraciones
npx prisma migrate dev --name init

# (Opcional) Ver la base de datos
npx prisma studio
```

### 6. Ejecutar el proyecto

```bash
npm run dev
```

Visita http://localhost:3000

## 📁 Estructura del Proyecto

```
EntraFactura/
├── app/
│   ├── (auth)/
│   │   ├── login/          # Página de login
│   │   └── register/       # Página de registro
│   ├── dashboard/
│   │   ├── invoices/       # Lista y subida de facturas
│   │   ├── settings/       # Configuración y billing
│   │   ├── layout.tsx      # Layout del dashboard
│   │   └── page.tsx        # Dashboard principal
│   ├── api/
│   │   ├── auth/           # Endpoints de autenticación
│   │   ├── invoices/       # Upload y extracción
│   │   ├── subscriptions/  # Mercado Pago
│   │   ├── cron/           # Vercel Cron para alertas
│   │   └── organization/   # Tenant management
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   └── ui/                 # Componentes shadcn/ui
├── lib/
│   ├── supabase/           # Clientes de Supabase
│   ├── prisma.ts           # Prisma client
│   ├── ia.ts               # Extracción con Groq
│   ├── drive.ts            # Google Drive API
│   ├── mercadopago.ts      # Mercado Pago SDK
│   ├── email.ts            # SendGrid
│   ├── with-tenant.ts      # Multi-tenancy helpers
│   ├── organization-context.tsx
│   └── utils.ts
├── prisma/
│   └── schema.prisma       # Schema de base de datos
├── types/
│   └── index.ts            # TypeScript types
├── middleware.ts           # Auth middleware
├── vercel.json             # Configuración de cron
└── package.json
```

## 🗄️ Schema de Base de Datos

### Tablas Principales

- **users**: Usuarios del sistema (vinculados a Supabase Auth)
- **organizations**: Organizaciones/empresas
- **organization_members**: Relación many-to-many con roles
- **invoices**: Facturas con datos extraídos
- **subscriptions**: Planes de suscripción
- **alert_logs**: Registro de alertas enviadas

### Roles

- **ADMIN**: Acceso completo, gestión de suscripción y configuración
- **MEMBER**: Ver facturas y subir nuevas

### Estados de Factura

- **PROCESSING**: Subiendo archivo
- **EXTRACTED**: Datos extraídos por IA
- **BACKED_UP**: Guardado en Drive
- **FAILED**: Error en extracción
- **PAID**: Marcado como pagado
- **PENDING**: Pendiente de pago
- **OVERDUE**: Vencido

## 🤖 Extracción con IA

El sistema usa Groq con el modelo `llama-3.3-70b-versatile` para extraer:

- **Proveedor**: Nombre del emisor
- **NIT**: Número de identificación tributaria
- **Fecha de Emisión**: Convertida a formato ISO
- **Fecha de Vencimiento**: Extraída o calculada (emisión + 30 días)
- **Subtotal**: Monto antes de impuestos
- **IVA**: Monto del impuesto
- **Total**: Monto total (validado: subtotal + IVA ≈ total)
- **Descripción**: Resumen de productos/servicios

El prompt está optimizado para facturas colombianas con formato DD/MM/YYYY.

## 📧 Alertas de Vencimiento

- **Frecuencia**: Diario a las 9:00 AM (Colombia)
- **Alcance**: Facturas que vencen en los próximos 3 días
- **Destinatarios**: Usuarios con rol ADMIN
- **Prevención de duplicados**: Se registra cada envío en `alert_logs`

### Configurar Vercel Cron

En `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/cron/check-due-invoices",
      "schedule": "0 0 * * *"
    }
  ]
}
```

Nota: El horario está en UTC. `14:00 UTC` = `9:00 AM Colombia` (UTC-5)

## 💳 Suscripción

| Plan | Precio/Mes | Precio/Año | Facturas | Correos sincronizados |
|------|------------|------------|----------|-----------------------|
| **Básico** | $69.000 COP | $690.000 COP | 50 por mes | 1 (Gmail / Outlook) |
| **Profesional** | $119.000 COP | $1.190.000 COP | 200 por mes | 2 (Gmail / Outlook) |
| **Empresarial** | $265.000 COP | $2.650.000 COP | 500 por mes | 3 (Gmail / Outlook) |

Todos los planes incluyen extracción con IA, backup en la nube (Google Drive / OneDrive), alertas de vencimiento y dashboard completo.

- **Plan anual**: pagas 10 meses y obtienes 12 (2 meses gratis).
- Suscripciones recurrentes (débito automático) procesadas por Mercado Pago.
- Trial de 30 días al registrarse.
- El límite de facturas se cuenta por **mes calendario** (se reinicia el día 1) y aplica a facturas manuales y por correo.
- El usuario puede cambiar de plan/periodicidad o cancelar en cualquier momento; al cancelar conserva el acceso hasta el final del período pagado.

### Webhooks de Mercado Pago

En "Tus integraciones → Webhooks" activa los topics `subscription_preapproval` y `subscription_authorized_payment`, apunta la URL a `https://<tu-dominio>/api/subscriptions/webhook` y copia el **secret** en `MERCADOPAGO_WEBHOOK_SECRET`.

## 🚀 Deployment en Vercel

### 1. Conectar repositorio

```bash
# Instalar Vercel CLI
npm i -g vercel

# Login
vercel login

# Deploy
vercel
```

### 2. Configurar variables de entorno

En Vercel Dashboard > Settings > Environment Variables, agrega todas las variables de `.env.example`.

### 3. Configurar Prisma

Vercel ejecuta automáticamente `postinstall` script que incluye `prisma generate`.

### 4. Configurar webhooks

- **Mercado Pago**: Agrega `https://tu-dominio.vercel.app/api/subscriptions/webhook`
- **Vercel Cron**: Se configura automáticamente desde `vercel.json`

## 🔒 Seguridad

- ✅ **Aislamiento multi-tenant a nivel de aplicación** (Prisma + `organizationId` en cada consulta)
- ✅ **Bucket de Storage privado** con URLs firmadas de corta duración
- ✅ **Validación de tenant** en todos los endpoints API
- ✅ **Sanitización de archivos** antes de almacenar
- ✅ **Rate limiting** en endpoints sensibles (con Upstash Redis)
- ✅ **Validación de entrada** con Zod schemas
- ✅ **CRON_SECRET** para proteger endpoints de cron
- ✅ **Tokens OAuth cifrados** a nivel de aplicación (AES-256-GCM, `lib/token-crypto.ts`)

### Rate limiting (Upstash Redis)

Implementado en `lib/ratelimit.ts`. Requiere `UPSTASH_REDIS_REST_URL` y
`UPSTASH_REDIS_REST_TOKEN` válidas (URL `https://`). Si faltan, tienen los
valores de ejemplo (`your_upstash_*`) o Redis no responde, el sistema opera en
modo **fail-open**: la petición pasa sin limitar para no tumbar el servicio por
una dependencia externa.

| Endpoint | Clave | Límite |
|----------|-------|--------|
| `POST /api/auth/register` | IP | 5 / 10 min |
| `POST /api/auth/trial-register` | IP | 5 / hora |
| `POST /api/auth/forgot-password` | IP + email | 5 / 15 min · 3 / hora |
| `POST /api/auth/reset-password` | IP | 10 / 15 min |
| `GET /api/auth/reset-password/validate` | IP | 10 / 15 min |
| `POST /api/invoices/upload` | organización | 60 / hora |
| `POST /api/invoices/[id]/extract` | organización | 60 / hora |

Al exceder el límite se responde `429` con `Retry-After` y headers
`X-RateLimit-*`, y body `{ "error": "...", "code": "RATE_LIMITED" }`.

### Rate limiting de Supabase Auth (login/signup)

Login (`signInWithPassword`) y signup (`signUp`) van directo a Supabase desde el
navegador, así que no pasan por el rate limiting de Upstash. Se configuran en
**Supabase Dashboard → Authentication → Rate Limits**. Valores recomendados:

| Campo en el dashboard | Por defecto | Recomendado |
|-----------------------|-------------|-------------|
| Rate limit for sign-ups and sign-ins | 30 / 5 min | 10 / 5 min |
| Rate limit for token refreshes (incluye el login) | 150 / 5 min | 60 / 5 min |
| Rate limit for sending emails | 2 / hora | Dejar por defecto* |
| Rate limit for sending SMS messages | 30 / hora | Dejar desactivado (no se usa SMS) |
| Rate limit for token verifications | 30 / 5 min | Dejar desactivado (no se usa OTP/magic link) |
| Rate limit for anonymous users | 30 / hora | Dejar desactivado (no se usa login anónimo) |
| Rate limit for Web3 sign-ups and sign-ins | 30 / 5 min | Dejar desactivado (no se usa Web3) |

\* El campo de correos solo aplica a los emails de Supabase Auth (confirmación,
invitación). La recuperación de contraseña de la app usa su propia API con
SendGrid. Con SMTP propio configurado (`Authentication → Emails`), el tope
interno de 2/hora deja de aplicar; solo actívalo si quieres un tope explícito.

> Regla general: configura un rate limit **solo cuando la función subyacente esté
> activa**. Los campos de SMS, anónimo y Web3 pueden quedar desactivados con su
> valor por defecto sin ningún riesgo, porque esas operaciones no ocurren.

> El campo "token refreshes" cubre el endpoint `/auth/v1/token`, que incluye el
> login con contraseña; es la **única** protección de fuerza bruta del login.

### Cifrado de tokens OAuth

Los refresh/access tokens de Google Drive, OneDrive, Gmail y Outlook se guardan
**cifrados** en la base de datos con **AES-256-GCM** (autenticado, con IV
aleatorio por valor). La implementación está en `lib/token-crypto.ts` y el
formato en disco es `enc:v1:<iv>:<tag>:<ciphertext>` (todo en base64).

Requiere la variable `TOKEN_ENCRYPTION_KEY` (32 bytes en base64):

```bash
npm run gen:encryption-key   # genera una clave nueva
```

Agrégala en `.env` (local) y en las variables de entorno de Vercel
(producción). **Debe ser la misma clave** en todos los entornos que compartan
base de datos: si cambia, los tokens guardados ya no podrán descifrarse y los
usuarios tendrán que reconectar sus cuentas.

Para cifrar los tokens que ya estaban en texto plano (migración única e
idempotente):

```bash
npm run encrypt:tokens
```

Columnas afectadas: `organizations.driveRefreshToken`,
`organizations.onedriveRefreshToken`, `email_accounts.oauthRefreshToken` y
`email_accounts.oauthAccessToken`. Los valores heredados sin cifrar se siguen
leyendo (pass-through), de modo que la migración puede ser gradual.

### Aislamiento de datos y Storage

- **Aislamiento multi-tenant**: hoy es **a nivel de aplicación**. `getTenantContext()`
  resuelve el usuario y su organización, y cada consulta filtra por
  `organizationId`. La app **no usa RLS** porque Prisma se conecta directo a
  Postgres (bypassa RLS) y el cliente de Storage/Auth usa `service_role`.
- **RLS**: **no está habilitado**. Se puede añadir como defensa en profundidad
  (sobre todo en `storage.objects`) si algún día se expone la API de Supabase al
  cliente; hoy no es necesario para el funcionamiento.
- **Storage**: el bucket `invoices` es **privado**. Los archivos se sirven con
  **URLs firmadas** (5 min) desde `/api/invoices/[id]/file`, que valida sesión y
  tenant. Las facturas importadas por correo no se guardan en Storage: se leen en
  vivo del buzón. Ver `lib/invoice-storage.ts`.

Migración de las facturas manuales antiguas (que guardaban la URL pública):

```bash
npm run migrate:file-paths -- --dry-run   # simulación
npm run migrate:file-paths                # aplica
```

Para poner el bucket en privado (**después** de desplegar el código):

```bash
npm run storage:private -- --dry-run
npm run storage:private
```

## 📝 Próximos Pasos (Post-MVP)

### ✅ Ya implementado
- Edición manual de facturas extraídas (formulario de detalle + `PATCH /api/invoices/[id]`)
- Exportación de facturas a Excel (`.xlsx`) en `/api/invoices/export`
- Extracción de factura electrónica DIAN (XML/ZIP) sin IA y por IA (PDF/imagen)
- Dashboard con KPIs, top de proveedores y resumen del mes
- Sincronización de correo (Gmail/Outlook) y respaldo en Google Drive/OneDrive
- Rate limiting, cifrado de tokens OAuth y páginas legales (Privacidad/Términos)

### 🚧 Pendientes
- Reportes y gráficos (hay `recharts` instalado pero sin uso)
- Exportación a PDF
- Categorización de gastos
- Análisis predictivo de gastos
- Workflow de aprobación de facturas
- Integración con sistemas contables
- Soporte multi-moneda
- Extracción/OCR más robusto para facturas escaneadas
- App móvil nativa
- API pública para integraciones

## 🐛 Troubleshooting

### Error: "Unable to resolve dependency tree"

```bash
npm install --legacy-peer-deps
```

### Error: "Prisma Client not generated"

```bash
npx prisma generate
```

### Error: "Can't reach database server"

Verifica que las URLs de DATABASE_URL y DIRECT_URL sean correctas en `.env.local`.

### Groq API retorna error 401

Verifica que tu GROQ_API_KEY sea válida y tenga créditos disponibles.

### Emails no se envían

1. Verifica que SENDGRID_API_KEY sea válida
2. Confirma que SENDGRID_FROM_EMAIL esté verificado en SendGrid

## 📄 Licencia

Este proyecto es propietario y confidencial.

## 👥 Contribución

Proyecto desarrollado para MVP de EntraFactura.

---

**¿Preguntas?** Contacta al equipo de desarrollo.
