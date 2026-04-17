export interface NavigationClient {
  navigateTo(path: string): void;
  goBack(): void;
}
