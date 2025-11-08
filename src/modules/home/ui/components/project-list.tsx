"use client"

import Link from "next/link"
import Image from "next/image"

import { formatDistanceToNow } from "date-fns"
import { useQuery } from "@tanstack/react-query"

import { useTRPC } from "@/trpc/client"
import { Button } from "@/components/ui/button"

export const ProjectList = ()=>{

    const trpc = useTRPC();
    const {data: projects} = useQuery(trpc.projects.getMany.queryOptions());

    return (
        <div className="w-full bg-white dark:bg-sidebar rounded-xl p-8 border f;ex f;ex-col gap-y-6 sn:gap-y-4">
            <h2 className="text-2xl font-semibold mb-5">
                Saved vibes
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                {projects?.length === 0 &&(
                    <div className="col-span-full text-center">
                        <p>
                            No projects found
                        </p>
                    </div>
                )}
                {projects?.map((project) => (
                    <Button 
                        key={project.id}
                        variant="outline"
                        className="font-normal h-auto justify-start w-full text-start p-4"
                        asChild
                        >
                            <Link href={`/projects/${project.id}`}>
                                 <div className=".flex items-center gap-x-4">
                                    <Image 
                                        src = "/logo.svg"
                                        alt ="vibe"
                                        width={32}
                                        height={32}
                                        className="object-contain"
                                    />
                                    <div className="flex flex-col">
                                        <h3 className="truncate font-medium">
                                            {project.name}
                                        </h3>
                                        <p className=" text-ms text-muted-foreground">
                                            {formatDistanceToNow(project.updatedAt,{
                                                addSuffix: true,
                                            })}
                                        </p>
                                    </div>
                                    
                                 </div>
                            </Link>
                        </Button>
                ))}
            </div>
        </div>
    )
}