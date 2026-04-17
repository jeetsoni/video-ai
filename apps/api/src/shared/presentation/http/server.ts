import { createApp } from "./app.js";

const port = process.env["API_PORT"] ?? 4000;
const app = createApp();

app.listen(port, () => {
  console.log(`API server running on http://localhost:${port}`);
});
