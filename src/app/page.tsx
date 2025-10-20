'use client';

import { Button } from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import { useTRPC } from "@/trpc/client";

import { useMutation } from "@tanstack/react-query";
import {toast} from "sonner";
import { useState } from "react";
import { useRouter } from "next/router";





const Page = () => {
  const router = useRouter();
  const [value, setValue] = useState("");

  const trpc = useTRPC();
  const createProject = useMutation(trpc.projects.create.mutationOptions({
    onError: (error)=>{
      toast.error(error.message);
    },
    onSuccess: (data) =>{
      router.push(`/project/${data.id}`);
    }
  }))

 
  return (
   
    <div className="h-screen w-screen flex items-center justify-center">
      <div className="max-w-7xl mx-auto flex items-center flex-col gap-y-4 justify-center">
        <Input value ={value} onChange ={(e)=> setValue(e.target.value)}>
        </Input>
        <Button 
        disabled = {createProject.isPending } 
        onClick={() => createProject.mutate({ value: value})}>
          SUBMIT
        </Button>
      </div>
    </div>
  );
};

export default Page;