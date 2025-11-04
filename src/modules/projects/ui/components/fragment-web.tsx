import { Fragment } from "@/generated/prisma";

import {useState} from "react";
import {ExternalLinkIcon, RefreshCcwIcon} from "lucide-react";

import {Button} from "@/components/ui/button";
import { Hint } from "@/components/hint";

interface Props{
    data: Fragment;
}

export const FragmentWeb = ({data}: Props) => {
    const [fragmentKey, setFragmentKey] = useState(0);
    const [copied, setCopied] = useState(false);

    const onRefresh = () => {
        setFragmentKey(prev => prev + 1);
    };

    const onCopy = () => {
        navigator.clipboard.writeText(data.sandBoxUrl);
        setCopied(true);
        setTimeout(()=>{ setCopied(false)}, 2000);
    };

    return (
        <div className="flex flex-col w-full h-full">

            <div className="flex items-center gap-x-2 p-2 border-b bg-sidebar " >

                <Hint content="Refresh" side="bottom" align="start">
                    <Button variant="outline" size="sm" onClick={onRefresh}>
                        <RefreshCcwIcon />
                    </Button>
                </Hint>
                

                <Hint content="Copy to clipboard" side="bottom" align="start">
                    <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={onCopy} 
                    disabled = {!data.sandBoxUrl || copied}
                    className="flex-1 justify-start items-start font-normal text-left gap-x-2"
                    >
                        <span className="text-xs truncate">
                            {data.sandBoxUrl}
                        </span>
                    </Button>
                </Hint>
                

                <Hint content="Open in a new tab " side="bottom" align="start">
                    <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={()=>{
                        if (!data.sandBoxUrl) return;
                        window.open(data.sandBoxUrl, "_blank");
                    }}
                    disabled = {!data.sandBoxUrl}
                    >
                        <ExternalLinkIcon />
                    </Button>
                </Hint>
            </div>
            <iframe 
            key={fragmentKey}
            src={data.sandBoxUrl} 
            className="w-full h-full" 
            loading="lazy"
            sandbox="allow-scripts allow-same-origin allow-form"
            
            />

            
        </div>
    )
}