'use client';

import { Button } from "@/components/ui/button";

import { useTRPC } from "@/trpc/client";
import { useMutation } from "@tanstack/react-query";
import {toast} from "sonner";

const Page = () => {

  const trpc = useTRPC();
  const invoke = useMutation(trpc.invoke.mutationOptions({
    onSuccess:()=>{
      toast.success("Background job start")
    }
  }));
 
  return (
   
    <div className="p4 max-w-7xl mx-auto">
      <Button disabled = {invoke.isPending } onClick={() => invoke.mutate({text: "Test invoke inngest"})}>
        Invoke Inngest
      </Button>
  
    </div>
  );
};

export default Page;