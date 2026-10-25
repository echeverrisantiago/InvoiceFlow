# 🚀 Quick Setup Guide for EntraFactura MVP

Follow these steps in order to get EntraFactura running locally.

## ✅ Prerequisites Checklist

Before you start, create accounts for:
- [ ] Supabase (https://supabase.com)
- [ ] Groq AI (https://console.groq.com)
- [ ] SendGrid (https://sendgrid.com)
- [ ] Mercado Pago Developers (https://www.mercadopago.com.co/developers)
- [ ] Google Cloud Console (https://console.cloud.google.com)

## 📝 Step-by-Step Setup

### 1. Install Dependencies (5 min)

```bash
npm install --legacy-peer-deps
```

### 2. Configure Environment Variables (10 min)

Copy the example file:
```bash
cp .env.example .env.local
```

Fill in each section:

#### Supabase
1. Create project at https://supabase.com
2. Go to Settings > API
3. Copy URL and keys
4. Go to Settings > Database > Connection string
5. Copy both connection strings (pooler and direct)

#### Groq AI
1. Sign up at https://console.groq.com
2. Create API key
3. Copy the key (starts with `gsk_`)

#### SendGrid
1. Create account at https://sendgrid.com
2. Settings > API Keys > Create API Key
3. Select "Full Access" or "Mail Send"
4. Verify a sender email

#### Google Cloud (Gmail)
1. Go to https://console.cloud.google.com
2. Create new project
3. Enable "Gmail API"
4. Configure the OAuth consent screen with scope `https://www.googleapis.com/auth/gmail.readonly`
5. Create OAuth 2.0 credentials
6. Add redirect URI: `http://localhost:3000/api/auth/email/gmail/callback`
7. Copy Client ID and Secret

#### Microsoft Entra (Outlook)
1. Go to https://entra.microsoft.com → App registrations → New registration
2. Add redirect URI: `http://localhost:3000/api/auth/email/outlook/callback`
3. API permissions → Microsoft Graph → Delegated → add `Mail.Read`
4. Certificates & secrets → create a client secret
5. Copy Client ID, Secret and set `OUTLOOK_REDIRECT_URI`

#### Mercado Pago
1. Sign up at https://www.mercadopago.com.co/developers
2. Create application
3. Copy TEST credentials (Access Token and Public Key)

#### Clave de cifrado de tokens OAuth
1. Genera una clave de 32 bytes:
   ```bash
   npm run gen:encryption-key
   ```
2. Copia el resultado en `TOKEN_ENCRYPTION_KEY` (en `.env` / `.env.local` y en
   las variables de entorno de Vercel).
3. Si la base de datos ya tenía tokens en texto plano, cífralos una vez:
   ```bash
   npm run encrypt:tokens
   ```
   Los valores heredados sin cifrar se leen igual (pass-through), así que este
   paso es seguro y opcional para bases de datos nuevas.

### 3. Setup Supabase Database (10 min)

#### Create Storage Bucket
1. Go to Storage in Supabase dashboard
2. Create new bucket named `invoices`
3. Keep it **private** (Public bucket: OFF)

Los archivos se sirven con URLs firmadas desde `/api/invoices/[id]/file`, así que
el bucket debe permanecer privado.

#### Run Database Migrations
```bash
npx prisma generate
npx prisma migrate dev --name init
```

#### (Optional) View Database
```bash
npx prisma studio
```

### 4. Test Locally (5 min)

Start the development server:
```bash
npm run dev
```

Visit http://localhost:3000 and test:
- [ ] Homepage loads
- [ ] Can navigate to /register
- [ ] Can navigate to /login

### 5. Complete Integration Test (15 min)

#### Test Registration Flow
1. Go to http://localhost:3000/register
2. Fill form with:
   - Name: Test User
   - Email: test@example.com
   - Password: TestPassword123
   - Organization: Test Company
3. Click "Crear Cuenta"
4. Should redirect to /dashboard

#### Test Invoice Upload
1. Go to Dashboard > Facturas
2. Click "Subir Factura"
3. Upload a test invoice PDF
4. Wait for AI extraction
5. Verify data appears in invoices list

#### Test Dashboard
1. Check KPI cards show correct data
2. Verify recent invoices appear
3. Navigate between pages

#### Test Email Sync (Optional)
1. Go to Settings
2. Connect Gmail or Outlook
3. Authorize the account
4. Send yourself an email with a PDF invoice attached
5. Wait for the cron (or trigger `/api/cron/fetch-emails`) and check the invoices list

#### Test Subscription Flow
1. Go to Settings > Billing
2. Click on a plan
3. Should redirect to Mercado Pago
4. (Don't complete payment in test mode)

## 🎯 Production Deployment

### Deploy to Vercel

1. Push code to GitHub:
```bash
git init
git add .
git commit -m "Initial EntraFactura MVP"
git remote add origin <your-repo-url>
git push -u origin main
```

2. Connect to Vercel:
   - Go to https://vercel.com
   - Import your GitHub repository
   - Add all environment variables from `.env.local`
   - Deploy!

3. Update redirect URIs:
   - Gmail: Add `https://your-domain.vercel.app/api/auth/email/gmail/callback`
   - Mercado Pago: Add webhook URL `https://your-domain.vercel.app/api/subscriptions/webhook`

4. Update environment variables:
   - Change `NEXT_PUBLIC_APP_URL` to your Vercel domain
   - Change `GMAIL_REDIRECT_URI` to production URL

### Configure Production Services

#### Supabase
- Consider upgrading to Pro plan for backups ($25/month)
- Enable additional security features
- Set up database backups

#### SendGrid
- Verify your domain (not just email)
- Set up DKIM and SPF records
- Monitor sending limits

#### Mercado Pago
- Switch from TEST to PRODUCTION credentials
- Configure production webhook
- Test payment flow with real card

## 🐛 Common Issues

### "Unable to resolve dependency tree"
Solution: Use `npm install --legacy-peer-deps`

### "Prisma Client not generated"
Solution: Run `npx prisma generate`

### "Can't reach database server"
Solution: Check DATABASE_URL in .env.local

### Groq API 401 error
Solution: Verify GROQ_API_KEY is correct and has credits

### SendGrid emails not sending
Solution: Verify sender email is verified in SendGrid

### Gmail OAuth error
Solution: Check redirect URI matches exactly in Google Console

## 📞 Support

If you encounter issues:
1. Check the main README.md for detailed documentation
2. Review error logs in terminal
3. Check Vercel deployment logs
4. Verify all environment variables are set correctly

## ✅ Launch Checklist

Before going live:
- [ ] All environment variables configured
- [ ] `TOKEN_ENCRYPTION_KEY` configured (and `npm run encrypt:tokens` run if the DB already had tokens)
- [ ] Database migrations run successfully
- [ ] Test registration and login
- [ ] Test invoice upload and extraction
- [ ] Test email sync (Gmail/Outlook)
- [ ] Test email alerts (manually trigger cron)
- [ ] Test payment flow
- [ ] Deploy to Vercel
- [ ] Configure production webhooks
- [ ] Switch to production API keys
- [ ] Test full flow in production

**You're ready to launch! 🚀**
