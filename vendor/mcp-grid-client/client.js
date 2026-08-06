export class TooSClient {
  constructor(gatewayUrl, token) {
    this.baseUrl = String(gatewayUrl).replace(/\/$/, "");
    this.token = String(token);
  }

  get headers() {
    return { Authorization: `Bearer ${this.token}` };
  }

  async request(path, init = {}) {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: { ...this.headers, ...init.headers },
    });
    if (!response.ok) {
      let detail = `TooS request failed: ${response.status}`;
      try {
        const body = await response.json();
        detail = body.detail ?? body.error ?? detail;
      } catch {
        // Keep the HTTP status when an intermediary returns a non-JSON response.
      }
      throw new Error(detail);
    }
    return response.json();
  }

  async services() {
    const body = await this.request("/registry/v1/services");
    return body.services;
  }

  async service(serviceId) {
    return this.request(`/registry/v1/services/${encodeURIComponent(serviceId)}`);
  }

  async capabilities() {
    return this.request("/api/v1/capabilities");
  }

  async skills() {
    return this.request("/api/v1/skills");
  }

  async skill(skillId) {
    return this.request(`/api/v1/skills/${encodeURIComponent(skillId)}`);
  }

  async invoke(toolId, arguments_ = {}) {
    return this.request(`/api/v1/tools/${encodeURIComponent(toolId)}/call`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(arguments_),
    });
  }

  async invokeService(serviceId, toolName, arguments_ = {}) {
    return this.request(
      `/api/v1/services/${encodeURIComponent(serviceId)}/tools/${encodeURIComponent(toolName)}/call`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(arguments_),
      },
    );
  }
}

export class DiscoveryClient extends TooSClient {}
