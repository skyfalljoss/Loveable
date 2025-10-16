import { inngest } from "./client";
import { openai, createAgent } from "@inngest/agent-kit";


export const helloWorld = inngest.createFunction(
  { id: "hello-world-name-function" },
  { event: "test/hello.world" },
  async ({ event }) => {

    const summarizer = createAgent({
        name: "summarizer",
        system: "You are an expert summarizer.  Your summarize in 2 words.",
        model: openai({ model: "gpt-4o" }),
      });

    const { output } = await summarizer.run(
        `Summarize the following text: ${event.data.value}`
    )

    console.log(output)

    return { output };
  },
);
