"use client"

import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";



import { Suspense, useState } from "react";
import MessagesContainer from "../components/messages-container";
import { Fragment } from "@/generated/prisma";

import {Tabs, TabsContent, TabsList, TabsTrigger} from "@/components/ui/tabs";
import { ProjectHeader } from "../components/project-header";
import { FragmentWeb } from "../components/fragment-web";
import { CodeIcon, CrownIcon, EyeIcon } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { FileExplorer } from "@/components/file-explorer";
import { UserControl } from "@/components/user-control";
import { useAuth } from "@clerk/nextjs";


interface Props{

    projectId: string;


}

export const ProjectView = ({projectId}: Props) => {


    const [activeFragment,  setActiveFragment] = useState<Fragment | null>(null);
    const [tabState, setTabState] = useState<"preview" | "code">("preview");
    
    const{has} = useAuth()
    const hasProAccess = has?.({plan:"pro"});


    return (
        <div className="h-screen">
            <ResizablePanelGroup direction="horizontal">
                <ResizablePanel
                defaultSize={35}
                minSize={20}
                className="flex flex-col min-h-0" 
                >
                    <Suspense fallback= {<p> Loading project ....</p>}>
                        <ProjectHeader projectId={projectId} />
                    </Suspense>
                    <Suspense fallback= {<p> Loading messages....</p>}>
                        <MessagesContainer 
                        projectId = {projectId}
                        activeFragment = {activeFragment}
                        setActiveFragment = {setActiveFragment}
                        />
                    
                    </Suspense>
                </ResizablePanel>
                <ResizableHandle className="hover:bg-primary transition-colors"/>

                <ResizablePanel
                defaultSize={65}
                minSize={50}
                // className="flex flex-col min-h-0" 
                >
                    <Tabs
                    className="h-full gap-y-0"
                    defaultValue="preview"
                    value={tabState}
                    onValueChange={(value) => setTabState(value as "preview" | "code")}
                    >
                        <div className="w-full flex items-center p-2 border-b gap-x-2">
                            <TabsList className="h-8 p-0 border rounded-md">
                                <TabsTrigger value="preview" className =" rounded-md">
                                    <EyeIcon className="size-4" />
                                    <span>Preview</span>
                                </TabsTrigger>
                                <TabsTrigger value="code" className =" rounded-md">
                                    <CodeIcon className="size-4" />
                                    <span>Code</span>
                                </TabsTrigger>
                            </TabsList>
                            <div className = "ml-auto flex items-center gap-x-2 ">
                                {!hasProAccess &&(
                                <Button asChild variant="default" size="default">
                                    <Link href="/pricing" className="flex items-center gap-2">
                                        <CrownIcon className="size-4" />
                                        <span>Upgrade</span>
                                    </Link>
                                </Button>
                                )}
                                
                                <UserControl />
                            </div>
                        </div>
                        <TabsContent value="preview">
                            {!!activeFragment && (
                                <Suspense fallback= {<p> Loading fragment....</p>}>
                                    <FragmentWeb data={activeFragment} />
                                </Suspense>
                            )}
                        </TabsContent>
                        <TabsContent value="code" className="min-h-0">

                            {!!activeFragment?.files && (
                                <FileExplorer
                                    files = {activeFragment.files as { [path: string]: string}}
                                />
                            )}

                        </TabsContent>
                        
                        
                    </Tabs>
                    

                </ResizablePanel>

            </ResizablePanelGroup>
            
            
            

        </div>
    )
}