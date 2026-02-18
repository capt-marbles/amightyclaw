import type { CoreTool } from 'ai';

export class ToolRegistry {
  private tools = new Map<string, CoreTool>();

  register(name: string, definition: CoreTool): void {
    this.tools.set(name, definition);
  }

  unregister(name: string): void {
    this.tools.delete(name);
  }

  getAll(): Record<string, CoreTool> {
    return Object.fromEntries(this.tools);
  }

  get(name: string): CoreTool | undefined {
    return this.tools.get(name);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }
}
