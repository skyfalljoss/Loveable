"use client"

import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";



import { Suspense } from "react";
import MessagesContainer from "../components/messages-container";


interface Props{

    projectId: string;
}

export const ProjectView = ({projectId}: Props) => {
    // const trpc = useTRPC();
    // const {data: project} = useSuspenseQuery(trpc.projects.getOne.queryOptions({
    //     id: projectId, 
    // }))

    return (
        <div className="h-screen">
            <ResizablePanelGroup direction="horizontal">
                <ResizablePanel
                defaultSize={35}
                minSize={20}
                className="flex flex-col min-h-0" 
                >
                    <Suspense fallback= {<p> Loading messages....</p>}>
                        <MessagesContainer projectId = {projectId}/>
                    
                    </Suspense>
                </ResizablePanel>
                <ResizableHandle withHandle/>

                <ResizablePanel
                defaultSize={65}
                minSize={50}
                // className="flex flex-col min-h-0" 
                >
               
                    TODO
                </ResizablePanel>

            </ResizablePanelGroup>
            
            
            

        </div>
    )
}