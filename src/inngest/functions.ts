import { inngest } from "./client";
import { openai, gemini, createAgent, createTool, createNetwork, type Tool } from "@inngest/agent-kit";
import {Sandbox} from "@e2b/code-interpreter";
import { getSandbox, lastAssistantTextMessageContent } from "./utils";
import {z} from "zod";
import { PROMPT } from "@/prompt";
import { prisma } from "@/lib/db";

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
      return sandbox.sandboxId;
    } );

    const codeAgent = createAgent<AgentState>({
        name: "code-agent",
        description: " An expert coding agent",
        system: PROMPT,
        model: gemini({
          model:"gemini-2.5-flash",
          // defaultParameters:{
          //   temperature: 0.5,
          // }
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
      maxIter: 10, ////////////////////////////
      router: async ({network}) =>{
        const summary = network.state.data.summary;

        if(summary){
          return;
        }
        return codeAgent;
      },
    })

    const result = await network.run(event.data.value);

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
            content: "Something went wrong. try again!!!",
            role: "ASSISTANT",
            type: "ERROR"
          },
        });
      }
      return await prisma.message.create({
        data: {
          content: "result.state.data.summary",
          role: "ASSISTANT",
          type: "RESULT",
          fragment: {
            create:{
              sandBoxUrl: sandboxURL,
              title : "Fragment",
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
