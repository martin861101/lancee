export interface Service {
  service_id: string;
  display_name: string;
  public_mcp_url: string;
  revision: string;
  last_seen: string;
}

export interface CapabilityService extends Service {
  status: "available" | "unreachable";
  tool_count: number;
}

export interface CapabilityTool {
  service_id: string;
  name: string;
  title: string | null;
  description: string;
  input_schema: Record<string, unknown>;
  catalog_id: string | null;
  tags: string[];
}

export interface Skill {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  tags: string[];
  instructions: string;
  tool_ids: string[];
  service_ids: string[];
  version: string;
  created_at: string;
  updated_at: string;
}

export interface Capabilities {
  services: CapabilityService[];
  tools: CapabilityTool[];
  skills: Skill[];
}

export interface ToolInvocation<T = unknown> {
  service_id: string;
  tool: string;
  is_error: boolean;
  data: T;
  result: Record<string, unknown>;
}

export declare class TooSClient {
  constructor(gatewayUrl: string, token: string);
  services(): Promise<Service[]>;
  service(serviceId: string): Promise<Service>;
  capabilities(): Promise<Capabilities>;
  skills(): Promise<Skill[]>;
  skill(skillId: string): Promise<Skill>;
  invoke<T = unknown>(toolId: string, arguments_?: Record<string, unknown>): Promise<ToolInvocation<T>>;
  invokeService<T = unknown>(
    serviceId: string,
    toolName: string,
    arguments_?: Record<string, unknown>,
  ): Promise<ToolInvocation<T>>;
}

export declare class DiscoveryClient extends TooSClient {}
