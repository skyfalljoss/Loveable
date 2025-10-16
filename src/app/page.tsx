// import { useTRPC } from "@/trpc/client";
// import { useQuery } from "@tanstack/react-query";
// import {caller} from "@/trpc/server"
import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { getQueryClient, trpc } from "@/trpc/server";

import { Client } from "./client";
import {Suspense} from "react";

const Page = async () => {

  // const trpc = useTRPC();
  // trpc.createAI.queryOptions({ text: "Hello" });
  // const {data} = useQuery(trpc.createAI.queryOptions({text: "Hello"}))
  // // localhost:3000/api/create-ai?body={text: "Hello"}
  const queryClient = getQueryClient();
  void queryClient.prefetchQuery(trpc.createAI.queryOptions({text: "Hello1"}))


  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
        <Suspense fallback={<p>Loading...</p>}>
          <Client/>
        </Suspense>
    </HydrationBoundary>
    
  );
};

export default Page;