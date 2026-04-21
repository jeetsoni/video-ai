export interface WebSearchSnippet {
  title: string;
  snippet: string;
  url: string;
}

export interface WebSearchProvider {
  search(query: string): Promise<WebSearchSnippet[]>;
}
