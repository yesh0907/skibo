declare module "cloudflare:workers" {
  abstract class DurableObject {
    constructor(ctx: DurableObjectState, env: unknown);
  }
}

interface DurableObjectState {
  storage: {
    get<T>(key: string): Promise<T | undefined>;
    put<T>(key: string, value: T): Promise<void>;
  };
}

interface DurableObjectNamespace<T> {
  getByName(name: string): T;
}

interface ExportedHandler<Env = unknown> {
  fetch(request: Request, env: Env): Response | Promise<Response>;
}
