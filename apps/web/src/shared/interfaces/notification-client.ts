export interface NotificationClient {
  showSuccess(message: string): void;
  showError(message: string): void;
}
