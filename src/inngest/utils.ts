import {Sandbox} from "@e2b/code-interpreter"
import { AgentResult, Message, TextMessage } from "@inngest/agent-kit";
import { SANDBOX_TIMEOUT } from "./types";

export async function getSandbox(sandboxId:string) {
    const sandbox  = await Sandbox.connect(sandboxId);
    await sandbox.setTimeout(SANDBOX_TIMEOUT)
    return sandbox;
};

// Retry utility for API calls with exponential backoff
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      const isQuotaError = error?.message?.includes("quota") || 
                          error?.message?.includes("RESOURCE_EXHAUSTED") ||
                          error?.status === 429;
      
      if (isQuotaError && attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 1000; // Add jitter
        console.log(`Quota error, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries + 1})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      throw error;
    }
  }
  
  throw new Error("Max retries exceeded");
}


export function lastAssistantTextMessageContent (result: AgentResult){
    const lastAssistantTextMessageIndex = result.output.findLastIndex(
        (message) => message.role ==="assistant",
    );
    
    const message = result.output[lastAssistantTextMessageIndex] as
        | TextMessage
        | undefined;
    return message?.content
        ? typeof message.content ==="string"
            ? message.content
            : message.content.map((c)=> c.text).join("")
        :undefined;

};

export  const parseAgentOutput = (value: Message[]) =>{

  const output = value[0];

  if(output.type !=="text"){
    return "Fragment"
  }

  if(Array.isArray(output.content )){
    return output.content.map((txt) => txt).join("")
  }
  else{
    return output.content
  }
}
