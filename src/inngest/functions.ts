import { inngest } from "./client";
import { openai, createAgent } from "@inngest/agent-kit";


export const helloWorld = inngest.createFunction(
  { id: "hello-world-name-function" },
  { event: "test/hello.world" },
  async ({ event }) => {

    const codeAgent = createAgent({
        name: "code-agent",
        system: "You are an expert next.js developer.  You write a readable, maintainable code. You write simple Next.js & React snippets",
        model: openai({ model: "gpt-4o" }),
      });

    const { output } = await codeAgent.run(
        `Summarize the following text: ${event.data.value}`
    )

    console.log(output)

    return { output };
  },
);
