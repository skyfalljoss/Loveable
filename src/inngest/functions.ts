import { inngest } from "./client";

export const helloWorld = inngest.createFunction(
  { id: "hello-world-name-function" },
  { event: "test/hello.world" },
  async ({ event, step }) => {
    //imaging this a download step
    await step.sleep("wait-a-moment", "30s");
    // imagine this is a processing step, like a model inference or a database query
    await step.sleep("wait-a-moment", "10s");
    //imagine this is a upload step
    await step.sleep("wait-a-moment", "10s");
    return { message: `Hello ${event.data.email}!` };
  },
);
