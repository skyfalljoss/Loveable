'use client';

import { ClerkProvider } from "@clerk/nextjs";
import { ThemeProvider } from "next-themes";
import { TRPCReactProvider } from "@/trpc/client";
import { Toaster } from "@/components/ui/sonner";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider 
      appearance={{
        variables: {
          colorPrimary: "oklch(.6446 .1883 43.7603)"
        }
      }}
    >
      <TRPCReactProvider>
        <ThemeProvider 
          attribute="class" 
          defaultTheme="system" 
          enableSystem
          disableTransitionOnChange
        >
          <Toaster />
          {children}
        </ThemeProvider>
      </TRPCReactProvider>
    </ClerkProvider>
  );
}
