# P6 Project Controls Data Management

A React application for managing P6 Project Controls data with Supabase (PostgreSQL) backend.

## Features

- **4 Data Management Forms:**
  - Engineering (dbp6_bd041engineering)
  - QAQC/HSE (dbp6_bd0402_qaqc_hse)
  - Actual Resources (dbp6_ud0501actualresources)
  - Dynamic Actual Data (dgt_dbp6bd06dynamicactualdata)

- **Each form includes:**
  - Table view with all records
  - Search/filter functionality
  - Pagination (15 records per page)
  - Create new records
  - Edit existing records
  - Form validation
  - Success/error notifications

- **Responsive design** - Works on desktop and tablet

## Tech Stack

- React 18 with TypeScript
- Vite (build tool)
- Tailwind CSS (styling)
- React Hook Form (form management)
- Supabase JS Client (database operations)

## Setup Instructions

### 1. Clone and Install Dependencies

```bash
cd P6ProjectControlForms
npm install
```

### 2. Configure Environment Variables

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` and add your Supabase credentials:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

You can find these values in your Supabase project:
- Go to Settings -> API
- Copy the Project URL and anon/public key

### 3. Run Development Server

```bash
npm run dev
```

The app will be available at `http://localhost:5173`

### 4. Build for Production

```bash
npm run build
```

The built files will be in the `dist` folder.

## Deploy to Vercel

### Option 1: Vercel CLI

```bash
npm i -g vercel
vercel
```

### Option 2: GitHub Integration

1. Push your code to GitHub
2. Import the repository in Vercel
3. Add environment variables in Vercel dashboard:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Deploy

## Database Tables

### dbp6_bd041engineering
- **Editable:** dgt_actualsubmissiondate, dgt_actualreturndate, dgt_revision, dgt_status
- **Display:** dgt_dtfid, dgt_transmittalref, dgt_transmittalsubject, dgt_discipline

### dbp6_bd0402_qaqc_hse
- **Editable:** dgt_status
- **Display:** dgt_docid, dgt_docref, dgt_documentsubject, dgt_discipline, dgt_documenttype

### dbp6_ud0501actualresources
- **Editable:** dgt_resourcecount
- **Display:** resource_name, dgt_resourcediscipline, dgt_resourcetype

### dgt_dbp6bd06dynamicactualdata
- **Editable:** dgt_actualstart, dgt_actualfinish, dgt_pctcomplete
- **Display:** dgt_activityid, dgt_projectid

## Supabase Row Level Security (RLS)

Make sure to configure appropriate RLS policies in your Supabase dashboard to control data access. For development, you may need to disable RLS or create permissive policies.

Example policy for full access (development only):

```sql
CREATE POLICY "Enable all access" ON public.dbp6_bd041engineering
FOR ALL USING (true) WITH CHECK (true);
```

## Project Structure

```
src/
├── components/       # Reusable UI components
│   ├── FormField.tsx
│   ├── LoadingSpinner.tsx
│   ├── Modal.tsx
│   ├── Notification.tsx
│   ├── Pagination.tsx
│   └── SearchFilter.tsx
├── forms/           # Form components for each table
│   ├── ActualResourcesForm.tsx
│   ├── DynamicActualDataForm.tsx
│   ├── EngineeringForm.tsx
│   └── QaqcHseForm.tsx
├── hooks/           # Custom React hooks
│   └── useNotification.ts
├── lib/             # External service clients
│   └── supabase.ts
├── types/           # TypeScript type definitions
│   └── database.ts
├── App.tsx          # Main application component
├── main.tsx         # Application entry point
└── index.css        # Global styles
```
