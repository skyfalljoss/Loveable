"use client";

import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";

interface HintProps{
    children: React.ReactNode;
    content: string;
    side?: "top" | "bottom" | "left" | "right";
    align?: "start" | "center" | "end";
};

export const Hint = ({
    children, 
    content, 
    side = "top", 
    align = "center"
}: HintProps) => {
    return (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>
                    {children}
                </TooltipTrigger>     
                <TooltipContent side={side} align={align}>
                    <p>{content} </p>
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    )
}