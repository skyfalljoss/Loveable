# Vibe - Next.js Project

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app) and enhanced with a comprehensive UI component library and database setup.

## 🚀 What's Been Implemented

### Tech Stack
- **Framework**: Next.js 15.3.4 with App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS v4
- **Database**: PostgreSQL with Prisma ORM
- **UI Components**: Radix UI primitives with custom styling
- **Form Handling**: React Hook Form with Zod validation
- **Icons**: Lucide React
- **Theming**: Next Themes for dark/light mode support
- **API Layer**: tRPC for type-safe APIs
- **State Management**: TanStack Query (React Query)
- **Background Jobs**: Inngest for event-driven processing
- **Notifications**: Sonner for toast notifications

### Database Setup
- **Database Provider**: PostgreSQL (configured for Neon)
- **ORM**: Prisma with Accelerate extension
- **Models**: User and Post models with relationship
- **Features**: Auto-increment IDs, unique constraints, cascade deletes

### UI Component Library
A comprehensive set of reusable UI components built with Radix UI primitives:
- **Layout**: Accordion, Card, Collapsible, Resizable, Separator, Sheet, Sidebar
- **Navigation**: Breadcrumb, Command, Menubar, Navigation Menu, Pagination, Tabs
- **Forms**: Button, Checkbox, Input, Label, Radio Group, Select, Switch, Textarea, Toggle
- **Feedback**: Alert, Alert Dialog, Dialog, Drawer, Hover Card, Popover, Progress, Skeleton, Sonner (toasts), Spinner, Tooltip
- **Data Display**: Avatar, Badge, Calendar, Chart, Empty, Table
- **Interactive**: Carousel, Context Menu, Dropdown Menu, Slider, Toggle Group

### API & Background Processing
- **tRPC Setup**: Complete tRPC configuration with type-safe client/server setup
- **API Routes**: RESTful API endpoints with tRPC integration
- **Background Jobs**: Inngest integration for asynchronous task processing
- **Event Handling**: Event-driven architecture with Inngest functions
- **Data Transformation**: SuperJSON for serialization/deserialization

### Development Features
- **Turbopack**: Fast development builds
- **ESLint**: Code linting and formatting
- **TypeScript**: Full type safety
- **Hot Reload**: Instant updates during development
- **Query Caching**: TanStack Query for efficient data fetching and caching

## Getting Started

First, install dependencies:

```bash
npm install
```

Set up your environment variables:
```bash
# Create .env.local file
DATABASE_URL="your_postgresql_connection_string"
```

Generate Prisma client:
```bash
npx prisma generate
```

Run database migrations:
```bash
npx prisma db push
```

Start the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## 🎯 Current Features

### Background Job Processing
- **Inngest Integration**: Set up Inngest for handling background tasks
- **Event-Driven Architecture**: Implemented event-based job processing
- **Sample Job**: Created a "hello world" function that simulates a multi-step process:
  - 30-second download simulation
  - 10-second processing simulation  
  - 10-second upload simulation
- **Job Invocation**: tRPC endpoint to trigger background jobs from the frontend

### Type-Safe API Layer
- **tRPC Configuration**: Complete setup with client and server configurations
- **API Endpoints**: 
  - `invoke` mutation: Triggers background jobs via Inngest
  - `createAI` query: Simple greeting endpoint for testing
- **Type Safety**: Full TypeScript integration with end-to-end type safety
- **Data Serialization**: SuperJSON for handling complex data types

### Frontend Integration
- **Interactive UI**: Button component to trigger background jobs
- **Loading States**: Proper loading indicators during job execution
- **Toast Notifications**: Success feedback using Sonner
- **React Query Integration**: Efficient data fetching and caching

## Project Structure

```
src/
├── app/                 # Next.js App Router pages
├── components/
│   └── ui/             # Reusable UI components
├── hooks/              # Custom React hooks
├── lib/                # Utility functions
├── trpc/               # tRPC configuration and setup
│   ├── client.tsx      # Client-side tRPC setup
│   ├── server.tsx      # Server-side tRPC setup
│   ├── init.ts         # tRPC initialization
│   ├── query-client.ts # TanStack Query configuration
│   └── routers/        # tRPC API routes
│       └── _app.ts     # Main app router with API endpoints
├── inngest/            # Background job processing
│   ├── client.ts       # Inngest client configuration
│   └── functions.ts    # Background job functions
└── api/                # API routes (if using traditional Next.js API routes)
```

## Available Scripts

- `npm run dev` - Start development server with Turbopack
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint

## Learn More

To learn more about the technologies used:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API
- [Prisma Documentation](https://www.prisma.io/docs) - learn about database operations
- [Radix UI Documentation](https://www.radix-ui.com/) - learn about accessible UI primitives
- [Tailwind CSS Documentation](https://tailwindcss.com/docs) - learn about utility-first CSS

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
