import type {
  WebSearchProvider,
  WebSearchSnippet,
} from "@/pipeline/application/interfaces/web-search-provider.js";

/**
 * No-op web search provider that returns empty results.
 * Replace with a real implementation (e.g. Google Custom Search, Tavily)
 * when web search functionality is needed.
 */
export class NoOpWebSearchProvider implements WebSearchProvider {
  async search(_query: string): Promise<WebSearchSnippet[]> {
    return [];
  }
}
