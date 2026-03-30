import { inngest } from "./client";
import {  gemini, createAgent, createTool, createNetwork, type Tool, type Message, createState } from "@inngest/agent-kit";
// import { openai, createAgent, createTool, createNetwork, type Tool } from "@inngest/agent-kit";
import {Sandbox} from "@e2b/code-interpreter";
import { getSandbox, lastAssistantTextMessageContent, parseAgentOutput, retryWithBackoff } from "./utils";
import {z} from "zod";
import { FRAGMENT_TITLE_PROMPT, PROMPT, RESPONSE_PROMPT } from "@/prompt";
import { prisma } from "@/lib/db";
import { SANDBOX_TIMEOUT } from "./types";

interface AgentState{
  summary: string;
  files:{[path: string]: string};
}


export const codeAgentFunction = inngest.createFunction(
  { id: "code-agent" },
  { event: "code-agent/run" },
  async ({ event, step }) => {
    
    const sandboxId = await step.run("get-sandbix-id", async () =>{
      const sandbox = await Sandbox.create("vibe-nextjs-skyfall");
      await sandbox.setTimeout(SANDBOX_TIMEOUT)
      return sandbox.sandboxId;
    } );

    const previousMessages = await step.run("get-previous-messages", async() => {
      const formattedMessage: Message[] = [];

      const messages = await prisma.message.findMany({
        where:{
          projectId: event.data.projectId,
        },
        orderBy: {
          createdAt: "desc", 
        },
        take: 5, // max 5 messages
      });

      for (const message of messages ){
        formattedMessage.push({
          type:"text",
          role:message.role ==="ASSISTANT" ? "assistant": "user",
          content: message.content
        })
      }

      return formattedMessage.reverse();
    })

    const state = createState<AgentState>(
      {
        summary:"",
        files: {},
      },
      {
        messages: previousMessages,
      }
    )

    const codeAgent = createAgent<AgentState>({
        name: "code-agent",
        description: " An expert coding agent",
        system: PROMPT,
        model: gemini({
          model:"gemini-2.5-pro", // Changed from gemini-2.5-pro to avoid quota limits
        }),
        // model: openai({ 
        //   model: "gpt-4.1",
        //   defaultParameters: {
        //     temperature: 0.1,
        //   }
        //  }),
        tools: [
          createTool({
            name: "terminal",
            description: "Use the terminal to run commands",
            parameters: z.object ({
              command: z.string(),
            }),
            handler: async ({ command}, {step}) => {
              return await step?.run("terminal", async () =>{
                const buffers = {stdout:"", stderr:""};
                try{
                  const sandbox = await getSandbox(sandboxId);
                  const result = await sandbox.commands.run(command, {
                    onStdout: (data:string) =>{
                      buffers.stdout += data
                    },
                    onStderr: (data: string) => {
                      buffers.stderr += data
                    },
                  });
                  return result.stdout;
                }catch (e){
                  console.error(
                    `command failed : ${e} \n stdout: ${buffers.stdout} \n stderr ${buffers.stderr}`
                  );
                  return  `command failed : ${e} \n stdout: ${buffers.stdout} \n stderr ${buffers.stderr}`
                }
              });
            },
          }),
          createTool({
            name: "createOrUpdateFiles",
            description: "create or update files in the sandbox",
            parameters: z.object({
              files: z.array(
                z.object({
                  path:z.string(),
                  content: z.string(),
                }),
              ),
            }),
            handler: async( 
              {files},
              {step, network}: Tool.Options<AgentState>
            ) =>{
              /**
               * {
               * "/app.tsx": "<p> app page </p>",
               * "button.tsx:<>"
               * }
               */
              const newFiles = await step?.run("createOrUpdateFiles", async () => {
                try{ 
                  const updateFiles = network.state.data.files || {};
                  const sandbox = await getSandbox(sandboxId);
                  for (const file of files){
                    await sandbox.files.write(file.path, file.content);
                    updateFiles[file.path] = file.content;

                  }
                  return updateFiles;

                }catch(e){
                  return "error" + e
                }
              });
              if (typeof newFiles === "object"){
                network.state.data.files = newFiles;

              } 
            }
          }),
          createTool({
            name: "readFiles",
            description:"Read files from the sandbox",
            parameters: z.object({
              files: z.array(z.string()),
            }),
            handler: async ({files}, {step}) =>{
              return await step?.run("readFiles", async() =>{
                try{
                  const sandbox = await getSandbox(sandboxId);
                  const contents = [];
                  for(const file of files){
                    const content = await sandbox.files.read(file);
                    contents.push ({path:file, content});
                  }
                  return JSON.stringify(contents);
                }
                catch(e){
                  return "error" + e;
                }
              })
            }
          }),
        ],
        lifecycle:{
          onResponse: async ({ result, network })=> {
            const lastAssistantMesageText = lastAssistantTextMessageContent(result);

            if (lastAssistantMesageText && network){
              if(lastAssistantMesageText.includes("<task_summary>")){
                network.state.data.summary = lastAssistantMesageText;
              }
            }
            return result;
          },
        },
      });

    const network = createNetwork<AgentState>({
      name:"coding-agent-network",
      agents:[codeAgent],
      maxIter: 8, // Reduced from 15 to prevent quota exhaustion
      defaultState: state,

      router: async ({network}) =>{
        const summary = network.state.data.summary;

        if(summary){
          return;
        }
        return codeAgent;
      },
    })

    let result;
    try {
      result = await retryWithBackoff(() => network.run(event.data.value, {state: state}), 2, 2000);
    } catch (error: unknown) {
      console.error("Code agent network failed after retries:", error);
      
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Check if it's a quota error
      if (errorMessage.includes("quota") || errorMessage.includes("RESOURCE_EXHAUSTED")) {
        // Create a fallback result
        result = {
          state: {
            data: {
              summary: "I'm sorry, but I've reached my API usage limits. Please try again later or consider upgrading your plan.",
              files: {}
            }
          }
        };
      } else {
        // Re-throw other errors
        throw error;
      }
    }

    const fragmentTitleGenerator =  createAgent({
      name: "fragment-title-generator",
        description: " A fragment title generator",
        system: FRAGMENT_TITLE_PROMPT,
        model: gemini({
          model:"gemini-2.5-flash",
        }),
    })

    const responseGenerator =  createAgent({
      name: "response-generator",
        description: " A response generator",
        system: RESPONSE_PROMPT,
        model: gemini({
          model:"gemini-2.5-flash",
        }),
    })

    // Add error handling for agent calls
    let fragmentTitleOutput: Message[];
    let responseOutput: Message[];

    try {
      const fragmentResult = await retryWithBackoff(() => fragmentTitleGenerator.run(result.state.data.summary), 2, 1000);
      fragmentTitleOutput = fragmentResult.output;
    } catch (error: unknown) {
      console.error("Fragment title generation failed:", error);
      // Fallback to a default title
      fragmentTitleOutput = [{ type: "text", role: "assistant", content: "Code Fragment" }];
    }

    try {
      const responseResult = await retryWithBackoff(() => responseGenerator.run(result.state.data.summary), 2, 1000);
      responseOutput = responseResult.output;
    } catch (error: unknown) {
      console.error("Response generation failed:", error);
      // Fallback to a default response
      responseOutput = [{ type: "text", role: "assistant", content: "I've created something for you! Check out the result." }];
    }
 

    const isError = !result.state.data.summary || Object.keys(result.state.data.files || {}).length === 0;

    const sandboxURL = await step.run("get-sandbox-url", async () => {
      const sandbox = await getSandbox(sandboxId);
      const host = sandbox.getHost(3000);
      return `https://${host}`
    });

    await step.run("save-result", async () => {
      if (isError){
        return await prisma.message.create({
          data:{
            projectId:event.data.projectId,
            content: "Something went wrong. try again!!!",
            role: "ASSISTANT",
            type: "ERROR"
          },
        });
      }
      return await prisma.message.create({
        data: {
          projectId:event.data.projectId,
          content: parseAgentOutput(responseOutput),
          role: "ASSISTANT",
          type: "RESULT",
          fragment: {
            create:{
              sandBoxUrl: sandboxURL,
              title : parseAgentOutput(fragmentTitleOutput),
              files: result.state.data.files,
            } 
          },
        }
      })
    })


    return {  
      url: sandboxURL,
      title:"Fragment",
      files: result.state.data.files,
      summary: result.state.data.summary
    };
  },
);
