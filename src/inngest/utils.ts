import {Sandbox} from "@e2b/code-interpreter"
import { AgentResult, Message, TextMessage } from "@inngest/agent-kit";
import { SANDBOX_TIMEOUT } from "./types";

export async function getSandbox(sandboxId:string) {
    const sandbox  = await Sandbox.connect(sandboxId);
    await sandbox.setTimeout(SANDBOX_TIMEOUT)
    return sandbox;
};

type RetryableError = {
  cause?: unknown;
  code?: number | string;
  error?: unknown;
  message?: string;
  response?: {
    headers?: {
      get?: (name: string) => string | null;
    };
    status?: number;
  };
  status?: number;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function getErrorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") {
    return undefined;
  }

  const value = error as RetryableError;
  const candidates = [value.status, value.response?.status, value.code]
    .map((candidate) => Number(candidate))
    .filter((candidate) => Number.isFinite(candidate));

  if (candidates.length > 0) {
    return candidates[0];
  }

  return (
    getErrorStatus(value.error) ??
    getErrorStatus(value.cause)
  );
}

function extractRetryDelayMs(error: unknown, message: string): number | undefined {
  if (!error || typeof error !== "object") {
    return undefined;
  }

  const value = error as RetryableError;
  const retryAfter = value.response?.headers?.get?.("retry-after");

  if (retryAfter) {
    const retryAfterSeconds = Number(retryAfter);

    if (Number.isFinite(retryAfterSeconds)) {
      return retryAfterSeconds * 1000;
    }
  }

  const retryDelayMatch = message.match(
    /(?:retry(?:ing)?|try again) (?:in|after) (\d+(?:\.\d+)?)\s*(ms|s|sec|seconds)?/i,
  );

  if (!retryDelayMatch) {
    return undefined;
  }

  const delay = Number(retryDelayMatch[1]);
  const unit = retryDelayMatch[2]?.toLowerCase();

  if (!Number.isFinite(delay)) {
    return undefined;
  }

  if (!unit || unit === "ms") {
    return delay;
  }

  return delay * 1000;
}

function isRetryableError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();
  const status = getErrorStatus(error);

  return (
    status === 429 ||
    status === 503 ||
    message.includes("quota") ||
    message.includes("resource_exhausted") ||
    message.includes("rate limit") ||
    message.includes("too many requests") ||
    message.includes("temporarily unavailable") ||
    message.includes("malformed_function_call")
  );
}

// Retry utility for API calls with exponential backoff
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 2000
): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: unknown) {
      const message = getErrorMessage(error);

      if (isRetryableError(error) && attempt < maxRetries) {
        const hintedDelay = extractRetryDelayMs(error, message);
        const exponentialDelay = baseDelay * Math.pow(2, attempt);
        const jitter = Math.floor(Math.random() * 1000);
        const delay = Math.min(
          Math.max(hintedDelay ?? 0, exponentialDelay + jitter),
          60_000,
        );

        console.log(
          `Retryable Gemini error, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries + 1})`,
        );
        await sleep(delay);
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
