# Developer Guide - Vibe Project

## Table of Contents
1. [Introduction](#introduction)
2. [Project Architecture](#project-architecture)
3. [tRPC Deep Dive](#trpc-deep-dive)
4. [TanStack Query (React Query)](#tanstack-query-react-query)
5. [Prisma Database](#prisma-database)
6. [Inngest Background Jobs](#inngest-background-jobs)
7. [React Hook Form with Zod](#react-hook-form-with-zod)
8. [Server vs Client Components](#server-vs-client-components)
9. [File Structure](#file-structure)
10. [Common Patterns](#common-patterns)

---

## Introduction

This project is a **Next.js 15** application that demonstrates a modern full-stack architecture using:
- **tRPC** for type-safe APIs
- **TanStack Query** for server state management
- **Prisma** for database operations
- **Inngest** for background job processing
- **React Hook Form + Zod** for form validation
- **Next.js App Router** for file-based routing

This guide explains **how** and **why** each technology is used in this project, with detailed examples from the actual codebase.

---

## Project Architecture

### The Big Picture

```
User Action (Frontend)
    ↓
tRPC Mutation/Query
    ↓
tRPC Router (Backend)
    ↓
Database Operation (Prisma)
    OR
Background Job (Inngest)
    ↓
Response to Client
    ↓
Cache Update (TanStack Query)
    ↓
UI Update (React)
```

**Key Principle**: Everything is **type-safe** from the database to the UI. TypeScript types flow automatically through the entire stack.

---

## tRPC Deep Dive

### What is tRPC?

**tRPC** (TypeScript Remote Procedure Call) allows you to build APIs with **end-to-end type safety**. You define your API once in TypeScript, and both client and server share the same types automatically.

### tRPC Setup

#### 1. Initialization (`src/trpc/init.ts`)

```typescript
import { initTRPC } from '@trpc/server';
import superjson from 'superjson';

// Context: Data available to ALL procedures (like current user, DB connection)
export const createTRPCContext = cache(async () => {
  return { userId: 'user_123' }; // This could be from a session token
});

const t = initTRPC.create({
  transformer: superjson, // Handles Dates, undefined, etc. in JSON
});

// Export helpful utilities
export const createTRPCRouter = t.router;
export const baseProcedure = t.procedure; // Base for all queries/mutations
```

**Why `superjson`?** JSON can't serialize `Date` objects, `undefined`, etc. SuperJSON makes them work across the network.

**Why `cache()`?** In Next.js, React may call your context function multiple times. `cache()` ensures it only runs once per request.

#### 2. Create Routers (`src/modules/messages/server/procedures.ts`)

```typescript
export const messagesRouter = createTRPCRouter({
  // Query: Read data (like GET in REST)
  getMany: baseProcedure
    .input(
      z.object({
        projectId: z.string().min(1, { message: "Project ID is required" }),
      }),
    )
    .query(async ({ input }) => {
      const messages = await prisma.message.findMany({
        where: { projectId: input.projectId },
        orderBy: { updatedAt: "asc" },
        include: { fragment: true },
      });
      return messages;
    }),

  // Mutation: Change data (like POST/PUT/DELETE in REST)
  create: baseProcedure
    .input(
      z.object({
        value: z.string().min(1).max(10000),
        projectId: z.string().min(1),
      }),
    )
    .mutation(async ({ input }) => {
      // 1. Save message to database
      const createdMessage = await prisma.message.create({
        data: {
          projectId: input.projectId,
          content: input.value,
          role: "USER",
          type: "RESULT",
        },
      });

      // 2. Trigger background job
      await inngest.send({
        name: "code-agent/run",
        data: {
          value: input.value,
          projectId: input.projectId,
        }
      });

      return createdMessage;
    }),
});
```

**Key Concepts:**
- **`.input()`**: Validates incoming data with Zod schemas
- **`.query()`**: For reading data (GET-like)
- **`.mutation()`**: For writing data (POST/PUT/DELETE-like)
- Both return data that TypeScript knows the type of

#### 3. Combine Routers (`src/trpc/routers/_app.ts`)

```typescript
import { messagesRouter } from '@/modules/messages/server/procedures';
import { projectsRouter } from '@/modules/projects/server/procedures';

export const appRouter = createTRPCRouter({
  messages: messagesRouter,
  projects: projectsRouter,
});

// This type is what makes client-side type-safety possible!
export type AppRouter = typeof appRouter;
```

**The Magic**: `export type AppRouter` lets the client know all available routes and their types.

#### 4. Client Setup (`src/trpc/client.tsx`)

```typescript
'use client'; // Client component only

import { createTRPCContext } from '@trpc/tanstack-react-query';
import type { AppRouter } from './routers/_app';

// Create React hooks
export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();

// Query client setup (handles caching, refetching, etc.)
let browserQueryClient: QueryClient;
function getQueryClient() {
  if (typeof window === 'undefined') {
    // Server: new query client every time
    return makeQueryClient();
  }
  // Browser: reuse same client (important for React!)
  if (!browserQueryClient) browserQueryClient = makeQueryClient();
  return browserQueryClient;
}

export function TRPCReactProvider({ children }: { children: React.ReactNode }) {
  const queryClient = getQueryClient();
  
  // Create tRPC client
  const [trpcClient] = useState(() =>
    createTRPCClient<AppRouter>({
      links: [
        httpBatchLink({
          transformer: superjson,
          url: '/api/trpc', // The API endpoint
        }),
      ],
    }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        {children}
      </TRPCProvider>
    </QueryClientProvider>
  );
}
```

**Why two providers?** `QueryClientProvider` is TanStack Query, `TRPCProvider` is tRPC. They work together.

#### 5. API Route Handler (`src/app/api/trpc/[trpc]/route.ts`)

```typescript
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { appRouter } from '@/trpc/routers/_app';

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext: createTRPCContext,
  });

export { handler as GET, handler as POST };
```

This connects HTTP requests to your tRPC router.

#### 6. Wrap App (`src/app/layout.tsx`)

```typescript
import { TRPCReactProvider } from "@/trpc/client";

export default function RootLayout({ children }) {
  return (
    <TRPCReactProvider>
      <html>
        <body>
          {children}
        </body>
      </html>
    </TRPCReactProvider>
  );
}
```

Now every component can use tRPC!

### Using tRPC in Components

#### Example 1: Read Data (Query)

```typescript
// src/modules/projects/ui/components/messages-container.tsx
import { useTRPC } from "@/trpc/client";
import { useSuspenseQuery } from "@tanstack/react-query";

const MessagesContainer = ({ projectId }: Props) => {
  const trpc = useTRPC();
  
  // Query with type safety!
  const { data: messages } = useSuspenseQuery(
    trpc.messages.getMany.queryOptions({
      projectId: projectId,
    })
  );

  return (
    <div>
      {messages.map((message) => (
        <MessageCard key={message.id} content={message.content} />
      ))}
    </div>
  );
};
```

**What's happening:**
1. `useTRPC()` gets the tRPC hooks
2. `trpc.messages.getMany.queryOptions()` creates a query config
3. `useSuspenseQuery` runs it and returns typed data
4. TypeScript knows `messages` has `id`, `content`, etc. automatically!

**Why `useSuspenseQuery`?** It suspends the component until data loads (React 18 Suspense). Alternative: `useQuery` without Suspense.

#### Example 2: Write Data (Mutation)

```typescript
// src/app/page.tsx
import { useTRPC } from "@/trpc/client";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

const Page = () => {
  const trpc = useTRPC();
  const router = useRouter();
  
  // Mutation with callbacks
  const createProject = useMutation(
    trpc.projects.create.mutationOptions({
      onError: (error) => {
        toast.error(error.message);
      },
      onSuccess: (data) => {
        router.push(`/projects/${data.id}`);
      }
    })
  );

  return (
    <Button 
      disabled={createProject.isPending}
      onClick={() => createProject.mutate({ value: "Hello" })}
    >
      SUBMIT
    </Button>
  );
};
```

**What's happening:**
1. `trpc.projects.create.mutationOptions()` creates mutation config
2. `useMutation` gives you `mutate`, `mutateAsync`, `isPending`, etc.
3. `onSuccess` and `onError` handle results
4. TypeScript knows what `data` looks like after success!

---

## TanStack Query (React Query)

### What is TanStack Query?

**React Query** handles server state for you:
- **Caching**: Stores fetched data in memory
- **Refetching**: Updates stale data automatically
- **Optimistic Updates**: Shows expected results before server confirms
- **Loading States**: Manages pending/error/success states

### Setup (`src/trpc/query-client.ts`)

```typescript
export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30 * 1000, // Data is "fresh" for 30 seconds
      },
      dehydrate: {
        serializeData: superjson.serialize, // For SSR
      },
      hydrate: {
        deserializeData: superjson.deserialize,
      },
    },
  });
}
```

**Why `staleTime`?** After 30 seconds, React Query considers data "stale" and refetches it in the background.

### useQueryClient Hook

**Purpose**: Manually control the cache.

```typescript
// src/modules/projects/ui/components/message-form.tsx
import { useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/client";

const MessageForm = ({ projectId }: Props) => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const createMessage = useMutation(
    trpc.messages.create.mutationOptions({
      onSuccess: () => {
        form.reset();
        
        // Invalidate query cache - tells React Query "this data is old"
        queryClient.invalidateQueries(
          trpc.messages.getMany.queryOptions({
            projectId,
          })
        );
      },
      onError: (error) => {
        toast.error(error.message);
      }
    })
  );
};
```

**What `invalidateQueries` does:**
1. Marks cached data as stale
2. Triggers a refetch in the background
3. Updates UI automatically when new data arrives

**Why is this needed?** After creating a message, the messages list is outdated. Invalidation forces a refresh.

### Server-Side Rendering (SSR)

```typescript
// src/app/projects/[projectId]/page.tsx
import { getQueryClient, trpc } from "@/trpc/server";
import { dehydrate, HydrationBoundary } from "@tanstack/react-query";

const Page = async ({ params }: Props) => {
  const { projectId } = await params;
  const queryClient = getQueryClient();

  // Prefetch data on the server
  await queryClient.prefetchQuery(
    trpc.messages.getMany.queryOptions({ projectId })
  );
  
  await queryClient.prefetchQuery(
    trpc.projects.getOne.queryOptions({ id: projectId })
  );

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <Suspense fallback={<p>Loading...</p>}>
        <ProjectView projectId={projectId} />
      </Suspense>
    </HydrationBoundary>
  );
};
```

**What's happening:**
1. Server fetches data before sending HTML
2. `dehydrate(queryClient)` extracts cache
3. `HydrationBoundary` sends cache to client
4. Client uses cached data immediately (no loading spinner!)
5. Client refetches in background if stale

**Benefits:**
- Instant data on page load
- Better SEO
- No loading flicker

---

## Prisma Database

### What is Prisma?

**Prisma** is a type-safe ORM for databases. You write a schema, and Prisma generates TypeScript types and a query builder.

### Schema (`prisma/schema.prisma`)

```prisma
model Project {
  id        String   @id @default(uuid())
  name      String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  messages  Message[]  // One project has many messages
}

model Message {
  id        String      @id @default(uuid())
  content   String
  role      MessageRole
  type      MessageType
  createdAt DateTime    @default(now())
  updatedAt DateTime    @updatedAt
  
  fragment   Fragment?  // Optional relationship
  projectId  String
  project    Project    @relation(fields: [projectId], references: [id], onDelete: Cascade)
}

enum MessageRole {
  USER
  ASSISTANT
}
```

**Key Concepts:**
- `@id`: Primary key
- `@default(uuid())`: Auto-generate UUID
- `@updatedAt`: Auto-update on change
- `onDelete: Cascade`: Delete messages when project is deleted

### Prisma Client (`src/lib/db.ts`)

```typescript
import { PrismaClient } from '@/generated/prisma';

const globalForPrisma = global as unknown as { 
  prisma: PrismaClient
};

// Reuse client in development (avoid too many connections)
export const prisma = globalForPrisma.prisma || new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
```

**Why the global check?** In development, Next.js hot-reloading creates new Prisma clients. Reusing one prevents "too many connections" errors.

### Using Prisma in tRPC

```typescript
// src/modules/projects/server/procedures.ts
import { prisma } from "@/lib/db";

export const projectsRouter = createTRPCRouter({
  getOne: baseProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ input }) => {
      const project = await prisma.project.findUnique({
        where: { id: input.id }
      });
      
      if (!project) {
        throw new TRPCError({ 
          code: "NOT_FOUND", 
          message: "Project not found!" 
        });
      }
      
      return project;
    }),

  create: baseProcedure
    .input(z.object({ value: z.string().min(1) }))
    .mutation(async ({ input }) => {
      // Create project AND message in one transaction
      const project = await prisma.project.create({
        data: {
          name: generateSlug(2, { format: "kebab" }),
          messages: {
            create: {
              content: input.value,
              role: "USER",
              type: "RESULT",
            }
          }
        }
      });
      
      return project;
    }),
});
```

**Common Prisma Operations:**

```typescript
// Find one
prisma.project.findUnique({ where: { id: "123" } })

// Find many
prisma.message.findMany({ 
  where: { projectId: "123" },
  orderBy: { updatedAt: "asc" },
  include: { fragment: true } // Include related data
})

// Create
prisma.message.create({
  data: { content: "Hello", projectId: "123" }
})

// Update
prisma.message.update({
  where: { id: "123" },
  data: { content: "Updated" }
})

// Delete
prisma.message.delete({ where: { id: "123" } })
```

**Type Safety**: Prisma types are auto-generated. Your IDE autocompletes everything!

---

## Inngest Background Jobs

### What is Inngest?

**Inngest** runs background jobs reliably:
- Retries on failure
- Schedules jobs for later
- Handles long-running tasks
- Triggered by events

### Setup (`src/inngest/client.ts`)

```typescript
import { Inngest } from "inngest";

export const inngest = new Inngest({ id: "my-app" });
```

### API Route (`src/app/api/inngest/route.ts`)

```typescript
import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { codeAgentFunction } from "@/inngest/functions";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [codeAgentFunction],
});
```

This exposes Inngest's API to trigger functions.

### Creating Functions (`src/inngest/functions.ts`)

```typescript
export const codeAgentFunction = inngest.createFunction(
  { id: "code-agent" },
  { event: "code-agent/run" }, // Listens for this event
  async ({ event, step }) => {
    
    // Step 1: Create sandbox
    const sandboxId = await step.run("get-sandbox-id", async () => {
      const sandbox = await Sandbox.create("vibe-nextjs-skyfall");
      return sandbox.sandboxId;
    });

    // Step 2: Run AI agent
    const codeAgent = createAgent({...});
    const result = await network.run(event.data.value);

    // Step 3: Get sandbox URL
    const sandboxURL = await step.run("get-sandbox-url", async () => {
      const sandbox = await getSandbox(sandboxId);
      return `https://${sandbox.getHost(3000)}`;
    });

    // Step 4: Save result to database
    await step.run("save-result", async () => {
      return await prisma.message.create({
        data: {
          projectId: event.data.projectId,
          content: result.state.data.summary,
          role: "ASSISTANT",
          type: "RESULT",
        }
      });
    });

    return { url: sandboxURL, summary: result.state.data.summary };
  }
);
```

**Why `step.run()`?** Each step is retryable. If a step fails, only that step retries.

### Triggering from tRPC

```typescript
// src/modules/messages/server/procedures.ts
import { inngest } from "@/inngest/client";

export const messagesRouter = createTRPCRouter({
  create: baseProcedure
    .mutation(async ({ input }) => {
      // Save message immediately
      const message = await prisma.message.create({...});

      // Trigger background job (async, doesn't block response)
      await inngest.send({
        name: "code-agent/run",
        data: {
          value: input.value,
          projectId: input.projectId,
        }
      });

      return message; // Return immediately
    }),
});
```

**Flow:**
1. User submits form → tRPC mutation
2. Save message to DB → return response
3. Trigger Inngest job → runs in background
4. AI processes request → takes ~30 seconds
5. Save result to DB → user sees new message

---

## React Hook Form with Zod

### What are they?

**React Hook Form**: Declarative form library
**Zod**: TypeScript-first schema validation

Together, they provide type-safe forms.

### Example (`src/modules/projects/ui/components/message-form.tsx`)

```typescript
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

// 1. Define schema
const formSchema = z.object({
  value: z.string()
    .min(1, { message: "Message is required" })
    .max(10000, { message: "Message is too long" }),
});

type FormValues = z.infer<typeof formSchema>;

const MessageForm = ({ projectId }: Props) => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  // 2. Initialize form
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema), // Use Zod for validation
    defaultValues: { value: "" },
  });

  // 3. Create mutation
  const createMessage = useMutation(
    trpc.messages.create.mutationOptions({
      onSuccess: () => {
        form.reset(); // Clear form
        queryClient.invalidateQueries(...); // Refresh data
      },
      onError: (error) => {
        toast.error(error.message);
      }
    })
  );

  // 4. Submit handler
  const onSubmit = async (values: FormValues) => {
    await createMessage.mutateAsync({
      value: values.value,
      projectId,
    });
  };

  // 5. Render form
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <FormField
          control={form.control}
          name="value"
          render={({ field }) => (
            <TextareaAutosize
              {...field} // Spreads onChange, onBlur, value, etc.
              disabled={createMessage.isPending}
              minRows={2}
              maxRows={8}
              placeholder="What would you want to build?"
            />
          )}
        />
        
        <Button
          disabled={createMessage.isPending || !form.formState.isValid}
        >
          {createMessage.isPending ? <Loader2Icon /> : <ArrowUpIcon />}
        </Button>
      </form>
    </Form>
  );
};
```

**Key Concepts:**

1. **Schema**: Defines what valid data looks like
2. **`resolver: zodResolver(formSchema)`**: Connects Zod to React Hook Form
3. **`control={form.control}`**: Links form state to field
4. **`{...field}`**: Auto-connects value, onChange, etc.
5. **`form.formState.isValid`**: True when all fields pass validation

**Benefits:**
- Type-safe: `z.infer<typeof formSchema>` generates types
- Auto-validation: Errors show inline
- Performance: Only re-renders changed fields

---

## Server vs Client Components

### Server Components (Default)

**When to use**: Reading data, auth checks, DB queries

```typescript
// src/app/projects/[projectId]/page.tsx
import { getQueryClient, trpc } from "@/trpc/server";

// No 'use client' directive = Server Component
const Page = async ({ params }: Props) => {
  const queryClient = getQueryClient();
  
  // Can access DB directly
  await queryClient.prefetchQuery(...);
  
  return <HydrationBoundary>...</HydrationBoundary>;
};
```

**Characteristics:**
- Run on server
- No browser APIs (localStorage, window, etc.)
- Can access DB/prisma directly
- No useState, useEffect, events
- Smaller bundle size

### Client Components

**When to use**: Interactivity, browser APIs, events

```typescript
// src/modules/projects/ui/components/message-form.tsx
'use client'; // Required directive

import { useState } from "react";

const MessageForm = () => {
  const [isFocused, setIsFocused] = useState(false);
  
  // Can use useState, useEffect, browser APIs, etc.
  
  return (
    <button onClick={() => setIsFocused(true)}>
      Click me
    </button>
  );
};
```

**Characteristics:**
- Run in browser
- Can use useState, useEffect, events
- Can access localStorage, window, etc.
- Larger bundle size

### Hybrid Approach

Often you use both:

```typescript
// Server Component (page.tsx)
const Page = async ({ params }) => {
  // Fetch data on server
  const queryClient = getQueryClient();
  await queryClient.prefetchQuery(...);
  
  return (
    <HydrationBoundary>
      {/* Client Component for interactivity */}
      <ProjectView projectId={params.projectId} />
    </HydrationBoundary>
  );
};

// Client Component (project-view.tsx)
'use client';
const ProjectView = ({ projectId }) => {
  const [selectedMessage, setSelectedMessage] = useState(null);
  
  // Interactive UI
  return <MessagesContainer projectId={projectId} />;
};
```

**Best Practice**: Fetch on server, interact on client.

---

## File Structure

```
src/
├── app/                              # Next.js App Router
│   ├── layout.tsx                    # Root layout (providers)
│   ├── page.tsx                      # Home page
│   ├── projects/[projectId]/
│   │   └── page.tsx                  # Project page (SSR)
│   └── api/
│       ├── trpc/[trpc]/route.ts     # tRPC HTTP handler
│       └── inngest/route.ts         # Inngest webhook
│
├── trpc/                             # tRPC configuration
│   ├── client.tsx                    # Client-side setup
│   ├── server.tsx                    # Server-side setup
│   ├── init.ts                       # tRPC initialization
│   ├── query-client.ts               # TanStack Query config
│   └── routers/
│       └── _app.ts                   # Combine all routers
│
├── modules/                          # Feature-based code
│   ├── messages/
│   │   ├── server/
│   │   │   └── procedures.ts         # tRPC router
│   │   └── ui/
│   │       └── components/           # React components
│   └── projects/
│       ├── server/procedures.ts
│       └── ui/...
│
├── inngest/                          # Background jobs
│   ├── client.ts                     # Inngest instance
│   ├── functions.ts                  # Background functions
│   └── utils.ts
│
├── components/                       # Shared UI
│   └── ui/                           # shadcn/ui components
│
├── lib/                              # Utilities
│   ├── db.ts                         # Prisma client
│   └── utils.ts                      # Helper functions
│
└── generated/                        # Auto-generated (Prisma)
    └── prisma/
```

**Design Philosophy**: Group by feature, not by layer.

---

## Common Patterns

### Pattern 1: Fetch and Display

```typescript
'use client';
import { useSuspenseQuery } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/client";

const Component = ({ id }) => {
  const trpc = useTRPC();
  
  const { data } = useSuspenseQuery(
    trpc.items.getOne.queryOptions({ id })
  );
  
  return <div>{data.name}</div>;
};
```

### Pattern 2: Create and Invalidate

```typescript
'use client';
import { useQueryClient } from "@tanstack/react-query";

const Component = ({ projectId }) => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  
  const create = useMutation(
    trpc.items.create.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries(
          trpc.items.getMany.queryOptions({ projectId })
        );
      }
    })
  );
  
  return (
    <button onClick={() => create.mutate({ value: "Hello" })}>
      Create
    </button>
  );
};
```

### Pattern 3: Server-Side Prefetch

```typescript
// No 'use client'
import { getQueryClient, trpc } from "@/trpc/server";
import { HydrationBoundary, dehydrate } from "@tanstack/react-query";

const Page = async ({ params }) => {
  const queryClient = getQueryClient();
  
  await queryClient.prefetchQuery(
    trpc.items.getMany.queryOptions({ projectId })
  );
  
  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <ItemsList />
    </HydrationBoundary>
  );
};
```

### Pattern 4: Background Job

```typescript
import { inngest } from "@/inngest/client";

// In tRPC mutation
const create = baseProcedure.mutation(async ({ input }) => {
  // Save immediately
  const item = await prisma.item.create({ data: input });
  
  // Trigger background job
  await inngest.send({
    name: "process-item",
    data: { itemId: item.id },
  });
  
  return item;
});
```

### Pattern 5: Form with Validation

```typescript
const formSchema = z.object({
  email: z.string().email(),
  age: z.number().min(18),
});

const Form = () => {
  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: { email: "", age: 0 },
  });
  
  const onSubmit = form.handleSubmit((values) => {
    // values is typed!
    console.log(values.email, values.age);
  });
  
  return (
    <Form {...form}>
      <form onSubmit={onSubmit}>
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => <Input {...field} />}
        />
      </form>
    </Form>
  );
};
```

---

## Key Takeaways

### Type Safety

Everything is typed end-to-end:
- Database → Prisma → tRPC → React → UI
- Forms → Zod → React Hook Form → tRPC → Prisma → Database

### Data Flow

1. **Server**: Fetch data, send to client
2. **Client**: Cache with TanStack Query
3. **User Action**: Mutate via tRPC
4. **Background**: Inngest processes jobs
5. **Invalidation**: Refresh cache automatically

### Best Practices

1. **Fetch on server** when possible (SSR)
2. **Invalidate after mutations** to keep UI in sync
3. **Use background jobs** for long-running tasks
4. **Validate with Zod** for type safety
5. **Group by feature**, not by layer

---

## Development Log - Today's Changes

### Overview
Today's work focused on implementing the core UI components for the project view, including message display, project header, and a resizable two-panel layout. The implementation emphasizes proper data fetching patterns, loading states, and user experience enhancements.

---

### 1. Messages Container Component (`messages-container.tsx`)

**Purpose**: Displays the conversation thread between user and assistant, with real-time updates and loading states.

**Key Features Implemented**:

1. **Data Fetching with Suspense**:
   ```typescript
   const {data: messages} = useSuspenseQuery(
     trpc.messages.getMany.queryOptions({
       projectId: projectId, 
     },
     {
       // Temporary refetch interval to show loading state
       refetchInterval: 5000,
     })
   );
   ```
   - Uses `useSuspenseQuery` for type-safe data fetching
   - Temporary 5-second refetch interval for testing loading states
   - Automatically handles loading states via Suspense boundaries

2. **Auto-Scroll to Bottom**:
   ```typescript
   useEffect(() => {
     bottomRef.current?.scrollIntoView();
   }, [messages.length]);
   ```
   - Scrolls to bottom when new messages arrive
   - Uses a ref to target the bottom element

3. **Loading State Display**:
   ```typescript
   const lastMessage = messages[messages.length - 1];
   const isLastMessage = lastMessage?.role === "USER";
   
   {isLastMessage && <MessageLoading />}
   ```
   - Shows `MessageLoading` component when the last message is from USER
   - Indicates assistant is processing the request

4. **Fragment Management**:
   - Receives `activeFragment` and `setActiveFragment` props
   - Passes fragment state to `MessageCard` components
   - Allows clicking fragments to set them as active
   - **Note**: Auto-selection of last assistant message with fragment is temporarily disabled (commented out)

5. **Layout Structure**:
   - Flex column layout with scrollable message area
   - Fixed message form at bottom with gradient fade effect
   - Proper spacing and overflow handling

**Temporary TODOs**:
- `refetchInterval: 5000` - Remove after implementing proper real-time updates
- Auto-fragment selection logic is commented out (lines 40-47)

---

### 2. Project Header Component (`project-header.tsx`)

**Purpose**: Provides navigation and project context at the top of the project view.

**Key Features Implemented**:

1. **Project Data Fetching**:
   ```typescript
   const {data: project} = useSuspenseQuery(
     trpc.projects.getOne.queryOptions({
       id: projectId,
     })
   );
   ```
   - Fetches project details using Suspense query
   - Type-safe project data access

2. **Dropdown Menu with Navigation**:
   ```typescript
   <DropdownMenu>
     <DropdownMenuTrigger asChild>
       <Button variant="ghost" size="sm">
         <Image src="/logo.svg" alt="vibe" width={18} height={18} />
         <span>{project.name}</span>
         <ChevronDownIcon/>
       </Button>
     </DropdownMenuTrigger>
     <DropdownMenuContent>
       <DropdownMenuItem asChild>
         <Link href="/">
           <ChevronLeftIcon />
           <span>Go to dashboard</span>
         </Link>
       </DropdownMenuItem>
       {/* Theme switcher */}
     </DropdownMenuContent>
   </DropdownMenu>
   ```
   - Logo + project name as dropdown trigger
   - "Go to dashboard" link with back arrow icon
   - Clean, accessible dropdown UI

3. **Theme Switcher Integration**:
   ```typescript
   const {theme, setTheme} = useTheme();
   
   <DropdownMenuSub>
     <DropdownMenuSubTrigger>
       <SunMoonIcon />
       <span>Appearance</span>
     </DropdownMenuSubTrigger>
     <DropdownMenuSubContent>
       <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
         <DropdownMenuRadioItem value="light">Light</DropdownMenuRadioItem>
         <DropdownMenuRadioItem value="dark">Dark</DropdownMenuRadioItem>
         <DropdownMenuRadioItem value="system">System</DropdownMenuRadioItem>
       </DropdownMenuRadioGroup>
     </DropdownMenuSubContent>
   </DropdownMenuSub>
   ```
   - Integrated with `next-themes` for theme management
   - Supports Light, Dark, and System themes
   - Nested submenu for clean organization

4. **Styling Details**:
   - Border bottom separator
   - Proper padding and spacing
   - Hover states and transitions
   - Focus-visible ring removal for clean look

---

### 3. Project View Component (`project-view.tsx`)

**Purpose**: Main container for the project interface with resizable panels.

**Key Features Implemented**:

1. **Resizable Two-Panel Layout**:
   ```typescript
   <ResizablePanelGroup direction="horizontal">
     <ResizablePanel defaultSize={35} minSize={20}>
       {/* Left panel: Messages */}
     </ResizablePanel>
     <ResizableHandle withHandle/>
     <ResizablePanel defaultSize={65} minSize={50}>
       {/* Right panel: TODO */}
     </ResizablePanel>
   </ResizablePanelGroup>
   ```
   - Left panel: 35% default, 20% minimum (messages + header)
   - Right panel: 65% default, 50% minimum (future: fragment preview)
   - Resizable handle with visual indicator
   - Horizontal layout for side-by-side panels

2. **State Management**:
   ```typescript
   const [activeFragment, setActiveFragment] = useState<Fragment | null>(null);
   ```
   - Manages which fragment is currently active/selected
   - Passed down to `MessagesContainer` for fragment highlighting

3. **Suspense Boundaries**:
   ```typescript
   <Suspense fallback={<p>Loading project ....</p>}>
     <ProjectHeader projectId={projectId} />
   </Suspense>
   <Suspense fallback={<p>Loading messages....</p>}>
     <MessagesContainer 
       projectId={projectId}
       activeFragment={activeFragment}
       setActiveFragment={setActiveFragment}
     />
   </Suspense>
   ```
   - Separate Suspense boundaries for header and messages
   - Allows independent loading states
   - Better user experience with granular loading

4. **Layout Structure**:
   - Full height container (`h-screen`)
   - Flex column layout in left panel
   - Proper overflow handling

**Future Work**:
- Right panel currently shows "TODO" - will display fragment preview/editor

---

### 4. Message Loading Component (`message-loading.tsx`) - New File

**Purpose**: Provides visual feedback when assistant is processing a request.

**Key Features Implemented**:

1. **Animated Message Rotation**:
   ```typescript
   const message = [
     "Thinking...",
     "Preparing your response...",
     "Generating code...",
     "Creating a plan...",
     // ... more messages
   ];
   
   const [currentMessageIndex, setCurrentMessageIndex] = useState(0);
   
   useEffect(() => {
     const interval = setInterval(() => {
       setCurrentMessageIndex((prev) => (prev + 1) % message.length);
     }, 2000);
     return () => clearInterval(interval);
   }, [message.length]);
   ```
   - Rotates through 8 different messages every 2 seconds
   - Provides engaging loading experience
   - Prevents users from thinking the app is frozen

2. **Visual Design**:
   - Matches `AssistantMessage` component styling
   - Logo + "Vibe" branding
   - Animated pulse effect on text
   - Consistent spacing and layout

3. **Component Structure**:
   ```typescript
   export const MessageLoading = () => {
     return (
       <div className="flex flex-col group px-2 pb-4">
         <div className="flex items-center gap-2 pl-2 mb-2">
           <Image src="/logo.svg" alt="vibe" width={18} height={18} />
           <span className="text-sm font-medium">Vibe</span>
         </div>
         <div className="pl-8.5 flex flex-col gap-y-4">
           <ShimmerMessage />
         </div>
       </div>
     );
   };
   ```
   - Reusable component
   - Consistent with message card layout

---

### 5. Root Layout Updates (`layout.tsx`)

**Changes Made**:

1. **Theme Provider Integration**:
   ```typescript
   <ThemeProvider 
     attribute="class" 
     defaultTheme="system" 
     enableSystem
     disableTransitionOnChange
   >
     <Toaster/>
     {children}
   </ThemeProvider>
   ```
   - Added `ThemeProvider` from `next-themes`
   - Supports system theme detection
   - Disables transitions during theme changes for better UX
   - `suppressHydrationWarning` on `<html>` to prevent theme flash

2. **Toast Notifications**:
   - Added `<Toaster/>` component for user feedback
   - Used in `MessageForm` for error notifications

---

### Architecture Decisions

1. **Suspense Query Pattern**: 
   - Used `useSuspenseQuery` instead of `useQuery` for better integration with React Suspense
   - Allows loading states to be handled at the boundary level
   - Reduces loading flicker

2. **Component Composition**:
   - Separated concerns: `MessagesContainer` handles data, `MessageCard` handles display
   - `ProjectHeader` is self-contained with its own data fetching
   - `ProjectView` orchestrates the layout and state

3. **State Management**:
   - `activeFragment` managed at `ProjectView` level (future: will control right panel)
   - Props drilling used for simple state (appropriate for current scope)
   - Consider context or state management library if complexity grows

4. **Loading States**:
   - `MessageLoading` shows when last message is from USER
   - Temporary refetch interval for testing
   - Future: Use WebSockets or Server-Sent Events for real-time updates

---

### Integration Points

1. **tRPC Integration**:
   - `messages.getMany` - Fetches all messages for a project
   - `projects.getOne` - Fetches project details
   - Both use Suspense queries for optimal loading

2. **TanStack Query**:
   - Query invalidation in `MessageForm` after message creation
   - Automatic refetching when data is stale
   - Cache management via query keys

3. **Next.js App Router**:
   - Server components for initial data fetching (prefetch)
   - Client components for interactivity
   - Proper Suspense boundaries for streaming

---

### Next Steps (From Today's Work)

1. **Remove Temporary Code**:
   - Remove `refetchInterval: 5000` from messages query
   - Implement proper real-time updates (WebSockets/SSE)

2. **Complete Right Panel**:
   - Implement fragment preview/editor in right panel
   - Connect `activeFragment` state to preview display

3. **Re-enable Auto-Fragment Selection**:
   - Uncomment and fix auto-selection logic in `MessagesContainer`
   - Ensure it works correctly with loading states

4. **Performance Optimization**:
   - Consider virtual scrolling for long message lists
   - Optimize re-renders with React.memo where appropriate

5. **Error Handling**:
   - Add error boundaries for better error UX
   - Handle edge cases (empty messages, failed fetches)

---

## Next Steps

1. Read the actual code files to see these patterns in action
2. Add a new feature following these patterns
3. Experiment with tRPC/tanstack query/Inngest
4. Check official docs:
   - [tRPC](https://trpc.io)
   - [TanStack Query](https://tanstack.com/query)
   - [Prisma](https://prisma.io)
   - [Inngest](https://inngest.com)
   - [Next.js](https://nextjs.org)

Happy coding! 🚀

