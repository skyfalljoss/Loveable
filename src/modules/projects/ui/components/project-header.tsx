import Link from "next/link";
import Image from "next/image";
import {useTheme} from "next-themes";
import {useSuspenseQuery} from "@tanstack/react-query";
import {
    ChevronDownIcon,
    ChevronLeftIcon,
    SunMoonIcon,
} from "lucide-react";

import {useTRPC} from "@/trpc/client";
import {Button} from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuSeparator,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger
} from "@/components/ui/dropdown-menu";

interface Props{
    projectId: string;
}
export const ProjectHeader = ({projectId}: Props) => {

    const trpc = useTRPC();
    const {theme, setTheme} = useTheme();



    const {data:project} = useSuspenseQuery(
        trpc.projects.getOne.queryOptions({
            id: projectId,
        })
    )
    return(
        <header className = "p-2 flex justify-between items-center border-b">
            <div className = "flex items-center gap-2">
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button 
                        variant = "ghost" 
                        size = "sm"
                        className = "focus-visible:ring-0 hover:bg-transparent hover:opacity-75 transition-opacity pl-2! "
                        >
                            <Image src = "/logo.svg" alt = "vibe" width = {18} height = {18} />
                            <span className = "text-sm font-medium ">{project.name}</span>
                            <ChevronDownIcon/>
                        </Button>
                    </DropdownMenuTrigger>

                    <DropdownMenuContent align = "start" side = "bottom">

                        <DropdownMenuItem asChild>
                            <Link href = "/">
                                <ChevronLeftIcon />
                                <span>Go to dashboard</span>
                            </Link>
                        </DropdownMenuItem>

                        <DropdownMenuSeparator />

                        <DropdownMenuSub>
                            <DropdownMenuSubTrigger className="gap-2">
                                <SunMoonIcon className="size-4 text-muted-foreground" />
                                <span>Appearance</span>
                            </DropdownMenuSubTrigger>
                            <DropdownMenuSubContent>
                                <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
                                    <DropdownMenuRadioItem value="light">
                                        <span>Light</span>
                                    </DropdownMenuRadioItem>
                                    <DropdownMenuRadioItem value="dark">
                                        <span>Dark</span>
                                    </DropdownMenuRadioItem>
                                    <DropdownMenuRadioItem value="system">
                                        <span>System</span>
                                    </DropdownMenuRadioItem>
                                </DropdownMenuRadioGroup>
                            </DropdownMenuSubContent>
                        </DropdownMenuSub>

                    </DropdownMenuContent>
                </DropdownMenu>

            </div>
        </header>
    )
}