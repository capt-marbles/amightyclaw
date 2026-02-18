import { tool } from 'ai';
import { z } from 'zod';

export function createWebSearchTool(braveApiKey: string) {
  return tool({
    description: 'Search the web for current information. Use this when the user asks about recent events, facts you are unsure about, or anything that benefits from real-time web data.',
    parameters: z.object({
      query: z.string().describe('The search query'),
      count: z.number().min(1).max(10).optional().default(5).describe('Number of results to return'),
    }),
    execute: async ({ query, count }) => {
      const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${count}`;
      const res = await fetch(url, {
        headers: {
          'X-Subscription-Token': braveApiKey,
          'Accept': 'application/json',
        },
      });

      if (!res.ok) {
        throw new Error(`Brave search failed: HTTP ${res.status}`);
      }

      const data = await res.json() as { web?: { results?: Array<{ title: string; url: string; description: string }> } };
      const results = data.web?.results || [];

      if (results.length === 0) {
        return 'No results found.';
      }

      return results
        .map((r, i) => `${i + 1}. **${r.title}**\n   ${r.url}\n   ${r.description}`)
        .join('\n\n');
    },
  });
}
