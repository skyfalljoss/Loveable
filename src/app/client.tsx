'use client';

import { useQuery } from "@tanstack/react-query";
import { useTRPC} from "@/trpc/client";


export const Client = () => {
    const trpc = useTRPC();
    const {data} = useQuery(trpc.createAI.queryOptions({text: "Hello1"}))
  
    return (
        <div>
            {JSON.stringify(data)}
        </div>
    )
}