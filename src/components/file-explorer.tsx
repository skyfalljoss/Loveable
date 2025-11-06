import { CopyCheckIcon, CopyIcon } from "lucide-react";
import { useState, useMemo, useCallback, Fragment } from "react";

import { Hint } from "@/components/hint";
import { Button } from "@/components/ui/button";

import { CodeView } from "@/components/code-view";

import {

    ResizableHandle,
    ResizablePanel,
    ResizablePanelGroup
} from "@/components/ui/resizable"

import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator,
    BreadcrumbEllipsis

} from "@/components/ui/breadcrumb"

import { convertFilesToTreeItems } from "@/lib/utils";
import { TreeView } from "./tree-view";


type FileCollection = { [path: string]: string} // same in function.tsx


function getLanguageFromExtension (filename: string): string{
    const extension = filename.split(".").pop()?.toLowerCase();
    return extension|| "text";
};


interface FileBreadCrumbProps{
    filePath: string;
}

const FileBreadCrumb = ({filePath}: FileBreadCrumbProps)=> {
    const pathSegments = filePath.split("/");

    const maxSegments = 4

    const renderBreadCrumbItems = ()=> {

       if (pathSegments.length <= maxSegments){
        //show all segments if 4 or less
        return pathSegments.map((segment, index) =>{
            const isLast = index === pathSegments.length - 1
            return(
                <Fragment key={index}>
                    <BreadcrumbItem>
                        {isLast ? (
                            <BreadcrumbPage className="font-medium">
                                {segment}
                            </BreadcrumbPage>
                        ) :(
                            <span className="text-muted-foreground">
                                {segment}
                            </span>
                        )}
                    </BreadcrumbItem>
                    {!isLast && <BreadcrumbSeparator/>}
                </Fragment>
            )
        })
       } else{
            const firstSegment =pathSegments[0];
            const lastSegment = pathSegments[pathSegments.length - 1];

            return (
                <>
                    <BreadcrumbItem>
                        <span className="text-muted-foreground">
                            {firstSegment}
                        </span>
                        <BreadcrumbSeparator/>
                        <BreadcrumbItem>
                            <BreadcrumbEllipsis/>
                        </BreadcrumbItem>
                        <BreadcrumbSeparator/>
                        
                        <BreadcrumbItem>
                            <BreadcrumbPage className="font-medium">
                                {lastSegment}
                            </BreadcrumbPage>
                        </BreadcrumbItem>
                    </BreadcrumbItem>
                </>
            )
       }
    }
    return (
        <Breadcrumb>
            <BreadcrumbList>
                {renderBreadCrumbItems()}
            </BreadcrumbList>
        </Breadcrumb>
    )
}


interface FileExplorerProps{
    files: FileCollection
};

export const FileExplorer = ({
    files,
}: FileExplorerProps) =>{

    const [copied, setCopied] = useState(false);
    const [selectedFile, setSelectedFile] = useState<string | null>(() => {
        const fileKeys = Object.keys(files);
        return fileKeys.length > 0 ? fileKeys[0] : null;
     });


     const treeData = useMemo (() =>{
        return convertFilesToTreeItems(files)
     }, [files]);

    const handleFileSelect = useCallback((
        filepath : string
    ) => {
        if(files[filepath]){
            setSelectedFile(filepath);
        }
        
    }, [files])

    const handleCopy = () => {
        if(selectedFile){
            navigator.clipboard.writeText(files[selectedFile]);
            setCopied(true);
            setTimeout(()=>{ setCopied(false)}, 2000);
        }
    };

    return(
        <ResizablePanelGroup direction="horizontal">
            <ResizablePanel defaultSize={30} minSize ={30} className= "bg-sidebar">
                <p>TODO: Tree view</p>

                <TreeView
                data = {treeData}
                value = {selectedFile}
                onSelect = {handleFileSelect}
                
                />
            </ResizablePanel>

            <ResizableHandle className="hover:bg-primary transition-colors"/>

            <ResizablePanel defaultSize={70} minSize ={50} className= "bg-sidebar">
                {selectedFile && files[selectedFile] ? (
                    <div className="h-full w-full flex flex-col ">
                        <div className=" border-b bg-sidebar px-4 py-2 flex justify-between items-center gap-x-2">
                            <FileBreadCrumb filePath={selectedFile}/>
                            <Hint content="Copy to clipboard" side="bottom">
                                <Button
                                    variant="outline"
                                    size= "icon"
                                    className="ml-auto "
                                    onClick={handleCopy}
                                    disabled= {copied}
                                >
                                    {copied ? <CopyCheckIcon/> : <CopyIcon/>}
                                </Button>

                            </Hint>
                        </div>
                        <div className="flex-1 overflow-auto">
                            <CodeView
                            code = {files[selectedFile]}
                            language={getLanguageFromExtension(selectedFile)}
                            >

                            </CodeView>
                        </div>
                        <p> Code view</p>
                    </div>
                ): (

                    <div className="flex h-full items-center justify-center text-muted-foreground">
                        Select a file to view it &apos;s content
                    </div>
                )}
            </ResizablePanel>
        </ResizablePanelGroup>
    )
}