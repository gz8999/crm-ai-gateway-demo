import serverless from "serverless-http";
import { createApp } from "../../server/app.mjs";

const app = createApp();
export const handler = serverless(app);
