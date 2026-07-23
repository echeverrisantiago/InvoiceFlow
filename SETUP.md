# 🚀 Quick Setup Guide for FactuMeIA MVP

Follow these steps in order to get FactuMeIA running locally.

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

#### Google Drive API
1. Go to https://console.cloud.google.com
2. Create new project
3. Enable "Google Drive API"
4. Create OAuth 2.0 credentials
5. Add redirect URI: `http://localhost:3000/api/auth/google-drive/callback`
6. Copy Client ID and Secret

#### Mercado Pago
1. Sign up at https://www.mercadopago.com.co/developers
2. Create application
3. Copy TEST credentials (Access Token and Public Key)

### 3. Setup Supabase Database (10 min)

#### Create Storage Bucket
1. Go to Storage in Supabase dashboard
2. Create new bucket named `invoices`
3. Make it public

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

#### Test Google Drive (Optional)
1. Go to Settings
2. Click "Conectar Google Drive"
3. Authorize your Google account
4. Upload another invoice
5. Check your Google Drive for "FactuMeIA" folder

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
git commit -m "Initial FactuMeIA MVP"
git remote add origin <your-repo-url>
git push -u origin main
```

2. Connect to Vercel:
   - Go to https://vercel.com
   - Import your GitHub repository
   - Add all environment variables from `.env.local`
   - Deploy!

3. Update redirect URIs:
   - Google Drive: Add `https://your-domain.vercel.app/api/auth/google-drive/callback`
   - Mercado Pago: Add webhook URL `https://your-domain.vercel.app/api/subscriptions/webhook`

4. Update environment variables:
   - Change `NEXT_PUBLIC_APP_URL` to your Vercel domain
   - Change `GOOGLE_DRIVE_REDIRECT_URI` to production URL

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

### Google Drive OAuth error
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
- [ ] Database migrations run successfully
- [ ] Test registration and login
- [ ] Test invoice upload and extraction
- [ ] Test Google Drive integration
- [ ] Test email alerts (manually trigger cron)
- [ ] Test payment flow
- [ ] Deploy to Vercel
- [ ] Configure production webhooks
- [ ] Switch to production API keys
- [ ] Test full flow in production

**You're ready to launch! 🚀**
