import { inngest } from "./client";
import {
  gemini,
  createAgent,
  createTool,
  createNetwork,
  type Tool,
  type Message,
  createState,
} from "@inngest/agent-kit";
import { Sandbox } from "@e2b/code-interpreter";
import { z } from "zod";

import { PROMPT } from "@/prompt";
import { prisma } from "@/lib/db";

import { getSandbox, lastAssistantTextMessageContent, retryWithBackoff } from "./utils";
import { SANDBOX_TIMEOUT } from "./types";

interface AgentState {
  summary: string;
  files: { [path: string]: string };
}

function truncateOutput(output: string, maxLength: number = 2000): string {
  if (output.length <= maxLength) {
    return output;
  }

  return `${output.slice(0, maxLength)}\n...[truncated]`;
}

function extractTitle(summary: string): string {
  const cleaned = summary.replace(/<\/?task_summary>/g, "").trim();
  const words = cleaned.split(/\s+/).filter((word) => word.length > 1).slice(0, 3);

  if (words.length === 0) {
    return "Code Fragment";
  }

  return words
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function generateResponse(summary: string): string {
  const cleaned = summary.replace(/<\/?task_summary>/g, "").trim();

  if (!cleaned) {
    return "Here's what I built for you!";
  }

  return `Here's what I built: ${cleaned}`;
}

function isQuotaError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const normalizedMessage = message.toLowerCase();

  return (
    normalizedMessage.includes("quota") ||
    normalizedMessage.includes("resource_exhausted") ||
    normalizedMessage.includes("rate limit") ||
    normalizedMessage.includes("too many requests") ||
    normalizedMessage.includes("429")
  );
}

const GEMINI_MODEL_OPTIONS = {
  model: "gemini-2.5-flash" as const,
  defaultParameters: {
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 2048,
      thinkingConfig: {
        thinkingBudget: 512,
      },
    },
  },
};

export const codeAgentFunction = inngest.createFunction(
  { id: "code-agent" },
  { event: "code-agent/run" },
  async ({ event, step }) => {
    try {
      const sandboxId = await step.run("get-sandbox-id", async () => {
        const sandbox = await Sandbox.create("vibe-nextjs-skyfall");
        await sandbox.setTimeout(SANDBOX_TIMEOUT);
        return sandbox.sandboxId;
      });

      const previousMessages = await step.run("get-previous-messages", async () => {
        const formattedMessages: Message[] = [];

        const messages = await prisma.message.findMany({
          where: {
            projectId: event.data.projectId,
          },
          orderBy: {
            createdAt: "desc",
          },
          take: 3,
        });

        for (const message of messages) {
          formattedMessages.push({
            type: "text",
            role: message.role === "ASSISTANT" ? "assistant" : "user",
            content: truncateOutput(message.content, 500),
          });
        }

        return formattedMessages.reverse();
      });

      const state = createState<AgentState>(
        {
          summary: "",
          files: {},
        },
        {
          messages: previousMessages,
        },
      );

      const codeAgent = createAgent<AgentState>({
        name: "code-agent",
        description: "An expert coding agent",
        system: PROMPT,
        model: gemini(GEMINI_MODEL_OPTIONS),
        tools: [
          createTool({
            name: "terminal",
            description: "Run a terminal command. Returns stdout.",
            parameters: z.object({
              command: z.string(),
            }),
            handler: async ({ command }, { step }) => {
              return await step?.run("terminal", async () => {
                const buffers = { stdout: "", stderr: "" };

                try {
                  const sandbox = await getSandbox(sandboxId);
                  const result = await sandbox.commands.run(command, {
                    onStdout: (data: string) => {
                      buffers.stdout += data;
                    },
                    onStderr: (data: string) => {
                      buffers.stderr += data;
                    },
                  });

                  return truncateOutput(result.stdout);
                } catch (error) {
                  const errorMessage = `command failed: ${error}\nstdout: ${buffers.stdout}\nstderr: ${buffers.stderr}`;
                  console.error(errorMessage);
                  return truncateOutput(errorMessage);
                }
              });
            },
          }),
          createTool({
            name: "createOrUpdateFiles",
            description: "Create or update files in the sandbox. Use relative paths.",
            parameters: z.object({
              files: z.array(
                z.object({
                  path: z.string(),
                  content: z.string(),
                }),
              ),
            }),
            handler: async ({ files }, { step, network }: Tool.Options<AgentState>) => {
              const newFiles = await step?.run("createOrUpdateFiles", async () => {
                try {
                  const updatedFiles = network.state.data.files || {};
                  const sandbox = await getSandbox(sandboxId);

                  for (const file of files) {
                    await sandbox.files.write(file.path, file.content);
                    updatedFiles[file.path] = file.content;
                  }

                  return updatedFiles;
                } catch (error) {
                  return `error${error}`;
                }
              });

              if (typeof newFiles === "object") {
                network.state.data.files = newFiles;
              }
            },
          }),
          createTool({
            name: "readFiles",
            description: "Read files from the sandbox. Use absolute paths like /home/user/app/page.tsx",
            parameters: z.object({
              files: z.array(z.string()),
            }),
            handler: async ({ files }, { step }) => {
              return await step?.run("readFiles", async () => {
                try {
                  const sandbox = await getSandbox(sandboxId);
                  const contents = [];

                  for (const file of files) {
                    const content = await sandbox.files.read(file);
                    contents.push({
                      path: file,
                      content: truncateOutput(content, 3000),
                    });
                  }

                  return JSON.stringify(contents);
                } catch (error) {
                  return `error${error}`;
                }
              });
            },
          }),
        ],
        lifecycle: {
          onResponse: async ({ result, network }) => {
            const lastAssistantMessageText = lastAssistantTextMessageContent(result);

            if (lastAssistantMessageText && network && lastAssistantMessageText.includes("<task_summary>")) {
              network.state.data.summary = lastAssistantMessageText;
            }

            return result;
          },
        },
      });

      const network = createNetwork<AgentState>({
        name: "coding-agent-network",
        agents: [codeAgent],
        maxIter: 5,
        defaultState: state,
        router: async ({ network }) => {
          if (network.state.data.summary) {
            return;
          }

          return codeAgent;
        },
      });

      let result;

      try {
        result = await retryWithBackoff(() => network.run(event.data.value, { state }), 3, 4000);
      } catch (error: unknown) {
        console.error("Code agent network failed after retries:", error);

        if (isQuotaError(error)) {
          result = {
            state: {
              data: {
                summary: "Gemini is currently rate limited or out of quota. Please wait a bit and try again.",
                files: {},
              },
            },
          };
        } else {
          throw error;
        }
      }

      const fragmentTitle = extractTitle(result.state.data.summary);
      const responseMessage = generateResponse(result.state.data.summary);
      const isError =
        !result.state.data.summary || Object.keys(result.state.data.files || {}).length === 0;

      const sandboxURL = isError
        ? null
        : await step.run("get-sandbox-url", async () => {
            const sandbox = await getSandbox(sandboxId);
            const host = sandbox.getHost(3000);
            return `https://${host}`;
          });

      await step.run("save-result", async () => {
        if (isError) {
          return await prisma.message.create({
            data: {
              projectId: event.data.projectId,
              content: result.state.data.summary || "Something went wrong. Please try again.",
              role: "ASSISTANT",
              type: "ERROR",
            },
          });
        }

        return await prisma.message.create({
          data: {
            projectId: event.data.projectId,
            content: responseMessage,
            role: "ASSISTANT",
            type: "RESULT",
            fragment: {
              create: {
                sandBoxUrl: sandboxURL!,
                title: fragmentTitle,
                files: result.state.data.files,
              },
            },
          },
        });
      });

      return {
        url: sandboxURL,
        title: fragmentTitle,
        files: result.state.data.files,
        summary: result.state.data.summary,
      };
    } finally {
      await step.run("unlock-project", async () => {
        await prisma.project.updateMany({
          where: {
            id: event.data.projectId,
          },
          data: {
            isGenerating: false,
          },
        });
      });
    }
  },
);
