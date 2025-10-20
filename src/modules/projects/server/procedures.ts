import { baseProcedure, createTRPCRouter} from "@/trpc/init";
import {z} from "zod"
import {generateSlug} from "random-word-slugs"
import { prisma } from "@/lib/db"
import { inngest } from "@/inngest/client";

export const projectsRouter = createTRPCRouter({

    getMany: baseProcedure
        .query(async()=>{
            const message = await prisma.message.findMany({
                orderBy:{
                    updatedAt:"asc"
                },
                include:{
                    fragment:true,
                }
            });
            return message;
        }),

    create: baseProcedure
        .input(
            z.object({
                value: z.string()
                .min(1, {message: "Value is required"})
                .max(10000, {message: "Value is too long"}),

            }),
        )
        .mutation(async ({input}) => {
            const createdProject = await prisma.project.create({
                data: {
                    name: generateSlug(2, {
                        format: "kebab",
                    }),
                    messages: {
                        create:{
                            content: input.value,
                            role: "USER",
                            type: "RESULT",
                        }
                    }
                }
            })

            await inngest.send({
                name: "code-agent/run",
                data: {
                  value: input.value,
                  projectID: createdProject.id,
                }
              });

            return createdProject;
        }),
        

});

// messagesRouter.createMessage