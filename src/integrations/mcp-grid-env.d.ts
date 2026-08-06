/**
 * The generated MCP Grid client is server-side only, but lives under `src`
 * so the CLI can manage it as an application integration.
 */
declare const process: {
  readonly env: {
    readonly MCP_API_TOKEN?: string;
    readonly MCP_GATEWAY_URL?: string;
  };
};
