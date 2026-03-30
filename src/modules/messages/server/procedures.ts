import { protectedProcedure, createTRPCRouter} from "@/trpc/init";
import {z} from "zod"
import { prisma } from "@/lib/db"
import { inngest } from "@/inngest/client";
import { TRPCError } from "@trpc/server";
import { consumeCredits } from "@/lib/usage";


export const messagesRouter = createTRPCRouter({
    getMany: protectedProcedure
        .input(
            z.object({
                projectId: z.string().min(1, {message:"Project ID is required"}),
            }),
        )
        .query(async({input, ctx})=>{
            const message = await prisma.message.findMany({
                where:{
                    projectId: input.projectId,
                    project:{
                        userId:ctx.auth.userId,
                    }
                },
   
                orderBy:{
                    updatedAt:"asc"
                },
                include:{
                    fragment:true,
                }
            });
            return message;
        }),


    create: protectedProcedure
        .input(
            z.object({
                value: z.string()
                .min(1, {message: "Message is required"})
                .max(10000, {message: "Message is too long"}),
            projectId: z.string().min(1, {message:"Project ID is required"}),
            }),
        )
        .mutation(async ({input, ctx}) => {
            const existingProject = await prisma.project.findUnique({
                where: {
                    id: input.projectId,
                    userId: ctx.auth.userId
                },
            });

            if( !existingProject) {
                throw new TRPCError ({
                    code:"NOT_FOUND",
                    message:"Project not found"
                })
            }

            const lockResult = await prisma.project.updateMany({
                where: {
                    id: existingProject.id,
                    userId: ctx.auth.userId,
                    isGenerating: false,
                },
                data: {
                    isGenerating: true,
                },
            });

            if (lockResult.count === 0) {
                throw new TRPCError({
                    code: "CONFLICT",
                    message: "Please wait for the current response to finish before sending another message.",
                });
            }

            try{
                await consumeCredits();
            } catch (error) {
                await prisma.project.update({
                    where: {
                        id: existingProject.id,
                    },
                    data: {
                        isGenerating: false,
                    },
                });

                if (error instanceof Error) {
                    throw new TRPCError({
                        code:"BAD_REQUEST", 
                        message:"Something went wrong"})
                } else {
                    throw new TRPCError({ 
                        code :"TOO_MANY_REQUESTS",
                        message: "You have reached the limit. You have run out of credits"})
                }
            }

            const createdMessage = await prisma.message.create
            ({
                data:{
                    projectId: existingProject.id,
                    content: input.value,
                    role: "USER",
                    type: "RESULT",
                },
            });

            try {
                await inngest.send({
                    name: "code-agent/run",
                    data: {
                      value: input.value,
                      projectId: input.projectId,
                    }
                  });
            } catch {
                await prisma.project.update({
                    where: {
                        id: existingProject.id,
                    },
                    data: {
                        isGenerating: false,
                    },
                });

                await prisma.message.create({
                    data: {
                        projectId: existingProject.id,
                        content: "I couldn't start the generation. Please try again.",
                        role: "ASSISTANT",
                        type: "ERROR",
                    },
                });

                throw new TRPCError({
                    code: "INTERNAL_SERVER_ERROR",
                    message: "Couldn't start generation. Please try again.",
                });
            }

            return createdMessage;
        }),
        

});

// messagesRouter.createMessage
