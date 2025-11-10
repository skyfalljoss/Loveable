import { inngest } from "./client";
import {  gemini, createAgent, createTool, createNetwork, type Tool, type Message, createState } from "@inngest/agent-kit";
// import { openai, createAgent, createTool, createNetwork, type Tool } from "@inngest/agent-kit";
import {Sandbox} from "@e2b/code-interpreter";
import { getSandbox, lastAssistantTextMessageContent, parseAgentOutput } from "./utils";
import {z} from "zod";
import { FRAGMENT_TITLE_PROMPT, PROMPT, RESPONSE_PROMPT } from "@/prompt";
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

    const previousMessages = await step.run("get-previous-messages", async() => {
      const formattedMessage: Message[] = [];

      const messages = await prisma.message.findMany({
        where:{
          projectId: event.data.projectId,
        },
        orderBy: {
          createdAt: "desc", //TODO: change to "asc" if AI does not understand what is the latest message
        },
      });

      for (const message of messages ){
        formattedMessage.push({
          type:"text",
          role:message.role ==="ASSISTANT" ? "assistant": "user",
          content: message.content
        })
      }

      return formattedMessage
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
          model:"gemini-2.5-pro",
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
      maxIter: 15, ////////////////////////////
      defaultState: state,

      router: async ({network}) =>{
        const summary = network.state.data.summary;

        if(summary){
          return;
        }
        return codeAgent;
      },
    })

    const result = await network.run(event.data.value, {state: state});

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

    const {output : fragmentTitleOutput}  = await fragmentTitleGenerator.run(result.state.data.summary)

    const {output : responseOutput}  = await responseGenerator.run(result.state.data.summary)
 

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
