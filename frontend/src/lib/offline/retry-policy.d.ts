export interface ReadRetryOptions {
  method?: string;
  status?: number;
  hasResponse?: boolean;
  code?: string;
  attempts?: number;
}

export function shouldRetryReadRequest(options?: ReadRetryOptions): boolean;
export function readRetryDelayMs(attempts?: number): number;
