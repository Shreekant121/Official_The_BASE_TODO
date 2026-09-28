export interface AgentTransportErrorOptions {
  status?: number;
  detail?: string;
}

export class AgentTransportError extends Error {
  status?: number;
  detail?: string;

  constructor(message: string, options: AgentTransportErrorOptions = {}) {
    super(message);
    this.name = 'AgentTransportError';
    this.status = options.status;
    this.detail = options.detail;
  }
}
