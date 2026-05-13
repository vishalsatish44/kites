# K-AI-TES: Real-Time Sales & Operations Hub

K-AI-TES is a high-performance business dashboard designed to bridge the gap between Airtable’s data flexibility and Supabase’s robust infrastructure. It provides real-time tracking, automated financial normalization, and AI-driven insights for sales teams.

## 🚀 Key Features

### 1. Unified Sales Intelligence
- **Multi-Source Aggregation**: Merges New Sales, Cross-Sales (on new enrollments), and Cross-Sales (on existing students) into a single, cohesive timeline.
- **Auto-Normalization**: Automatically handles different enrollment types and student link IDs to ensure data integrity across the pipeline.
- **After-Sales Tracking**: Dedicated module for AR and Management to track payments, collections, and pending dues.

### 2. Live Financial Engine
- **Global Currency Support**: Native support for **INR, GBP, AUD, USD, CAD, and NZD**.
- **Real-Time FX Conversion**: Integrated with an exchange rate API to convert all global revenue into a base "INR Equivalent" instantly.
- **Dynamic Formatting**: Smart UI that respects locale-specific symbols (£, A$, ₹) while maintaining precision in internal calculations.

### 3. Smart Operations & Automation
- **Supabase Cron Integration**: Background sync jobs (`pg_cron`) keep the Supabase mirror updated with Airtable data every 10 minutes without manual intervention.
- **Attendance & Goals**: Automated tracking for employee attendance and monthly targets/goals with visual progress bars.
- **Incentive Engine**: Configurable logic to calculate commissions and bonuses based on sales performance.

### 4. Advanced Analytics
- **Modern Dashboard**: A clean, "Modern UI" view for a high-level overview of key performance indicators (KPIs).
- **Day-Wise Trends**: Granular charts showing sales velocity and performance peaks throughout the month.
- **Team Breakdown**: Performance comparison across Management, Sales, Pre-sales, and AR roles.

### 5. AI Assistant
- **Gemini Pro Integration**: A built-in chat interface that understands the dashboard's data, allowing users to ask questions like "Who is the top performer this week?" or "What is our total revenue in GBP?"

---

## 🛠️ Tech Stack

- **Frontend**: React 19 (Vite), Tailwind CSS (custom modern theme), Recharts for data visualization.
- **Backend/DB**: Supabase (PostgreSQL) with Row Level Security (RLS).
- **Automation**: GitHub Actions, Supabase Edge Functions, and `pg_cron`.
- **Data Source**: Airtable API (Real-time mirroring).
- **AI**: Google Gemini SDK.

## 🏗️ Getting Started

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Environment Setup**:
   Create a `.env` file with your credentials:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_GEMINI_API_KEY`
   - `AIRTABLE_API_KEY`

3. **Development**:
   ```bash
   npm run dev
   ```

4. **Database Sync**:
   Run the local sync script to populate the Supabase mirror:
   ```bash
   node scripts/sync-airtable.mjs
   ```

---

## 🔒 Permissions & Roles

The system is built on strict RBAC (Role-Based Access Control):
- **Management**: Full access to WBR, Targets, Goals, and Team performance.
- **Sales/Pre-Sales**: Access to individual metrics, attendance, and demo tracking.
- **AR (Accounts Receivable)**: Access to breakup data and after-sales collection tracking.
- **Super Admin**: Low-level database configuration and incentive logic management.
