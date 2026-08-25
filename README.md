# FactuMeIA - SaaS de Gestión Inteligente de Facturas

![FactuMeIA](https://img.shields.io/badge/Next.js-15-black?logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue?logo=typescript)
![Supabase](https://img.shields.io/badge/Supabase-Enabled-green?logo=supabase)
![Prisma](https://img.shields.io/badge/Prisma-ORM-2D3748?logo=prisma)

Sistema de gestión inteligente de facturas dirigido a PYMEs en Colombia con extracción automática de datos mediante IA, backup en Google Drive y alertas de vencimiento.

## 🚀 Características

- ✅ **Autenticación Multi-Tenant**: Sistema de organizaciones con roles (Admin/Member)
- 📄 **Subida de Facturas**: Soporta PDF e imágenes
- 🤖 **Extracción con IA**: Groq AI extrae automáticamente proveedor, NIT, fechas y montos
- ☁️ **Backup Automático**: Guardado en Supabase Storage y Google Drive del usuario
- 📊 **Dashboard Inteligente**: Visualiza facturas, proveedores y resúmenes mensuales
- 🔔 **Alertas de Vencimiento**: Notificaciones por email con SendGrid
- 💳 **Suscripciones**: Planes Starter y Pro con Mercado Pago
- 📱 **Responsive**: UI moderna con Tailwind CSS y shadcn/ui

## 🛠️ Stack Tecnológico

- **Frontend**: Next.js 15 (App Router), React 19, TailwindCSS, shadcn/ui
- **Backend**: Next.js API Routes, Server Actions
- **Database**: PostgreSQL (Supabase) con Prisma ORM
- **Auth**: Supabase Auth con Row Level Security (RLS)
- **Storage**: Supabase Storage + Google Drive API
- **IA**: Groq (LangChain.js) con llama-3.3-70b-versatile
- **Emails**: SendGrid
- **Payments**: Mercado Pago
- **Deployment**: Vercel

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
cd FactuMeIA
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
3. Configura como público:
   - Settings > Public bucket: ON
4. Políticas de acceso se manejan con RLS en Prisma

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
FactuMeIA/
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
      "schedule": "0 14 * * *"
    }
  ]
}
```

Nota: El horario está en UTC. `14:00 UTC` = `9:00 AM Colombia` (UTC-5)

## 💳 Suscripción

| Plan | Precio/Mes | Características |
|------|------------|-----------------|
| **Plan Mensual** | $69.000 COP | Facturas ilimitadas, extracción con IA, backup en la nube, alertas de vencimiento |

- Trial de 30 días al registrarse
- Pagos procesados por Mercado Pago
- Webhooks para activación automática

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

- ✅ **RLS (Row Level Security)** en todas las tablas de Supabase
- ✅ **Validación de tenant** en todos los endpoints API
- ✅ **Sanitización de archivos** antes de almacenar
- ✅ **Rate limiting** en endpoints de upload (con Upstash Redis)
- ✅ **Validación de entrada** con Zod schemas
- ✅ **CRON_SECRET** para proteger endpoints de cron
- ✅ **Tokens encriptados** para Google Drive (almacenados en DB)

## 📝 Próximos Pasos (Post-MVP)

- [ ] Edición manual de facturas extraídas
- [ ] Categorización de gastos
- [ ] Reportes y exportación a Excel/PDF
- [ ] Análisis predictivo de gastos
- [ ] Workflow de aprobación de facturas
- [ ] Integración con sistemas contables
- [ ] Multi-currency support
- [ ] OCR mejorado para facturas escaneadas
- [ ] App móvil nativa
- [ ] API pública para integraciones

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

Proyecto desarrollado para MVP de FactuMeIA.

---

**¿Preguntas?** Contacta al equipo de desarrollo.
