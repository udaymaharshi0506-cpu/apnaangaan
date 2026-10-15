# Apna Aangan (अपना आँगन)

A modern, privacy-first real estate marketplace application built with Next.js, React, TypeScript, Drizzle ORM, and PostgreSQL / Supabase.

## Features

- 🏡 **Privacy-First Property Listings**: Shield owner identity and contact details with serialized public property views.
- ⚡ **Next.js App Router**: Optimized server and client components powered by Next.js 16 and React 19.
- 🗄️ **Drizzle ORM & PostgreSQL**: Robust schema and migrations with type-safe database queries.
- 🔐 **Secure Authentication**: Role-based access control (Admin, Owner, Buyer) with JWT sessions and hashed passwords.
- 🎨 **Modern UI**: Styled with Tailwind CSS for high responsiveness and clean aesthetics.
- ✉️ **Email Notifications**: Integrated Resend service for communications.

## Getting Started

### 1. Prerequisites

- Node.js 18+ or 20+
- PostgreSQL or Supabase instance

### 2. Installation

```bash
# Clone the repository
git clone https://github.com/udaymaharshi0506-cpu/apnaangaan.git
cd apnaangaan

# Install dependencies
npm install
```

### 3. Environment Setup

Copy `.env.example` to `.env` and fill in the required environment variables:

```bash
cp .env.example .env
```

Configure:
- `DATABASE_URL`: Your PostgreSQL connection string
- `SUPABASE_URL` & `SUPABASE_ANON_KEY`: Supabase project configuration
- `ADMIN_EMAIL` & `ADMIN_PASSWORD`: Default admin credentials
- `RESEND_API_KEY`: API key for email delivery

### 4. Database Setup

Run the SQL migration script located at `supabase-setup.sql` or use Drizzle Kit:

```bash
# Push schema or run migration
npm run test:connections
```

### 5. Running the Application

```bash
# Development mode
npm run dev

# Production build
npm run build
npm run start
```

## Scripts

- `npm run dev`: Starts the Next.js development server.
- `npm run build`: Builds the production bundle.
- `npm run start`: Runs the built Next.js application.
- `npm run lint`: Runs ESLint checks.
- `npm run typecheck`: Runs TypeScript type checking.
- `npm run test`: Executes unit and integration tests.
- `npm run test:connections`: Verifies database and external service connections.
- `npm run verify`: Runs end-to-end application verification.
