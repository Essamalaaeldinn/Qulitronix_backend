import express from "express";
import { config } from "dotenv";
import { database_connection } from "./DB/connection.js";
import routerHandler from "./utils/router-handler.utils.js";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import subscriptionRouter from "./Modules/Subscription/subscription.controller.js"; // ✅ import your subscription routes

config();

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename); // ✅ corrected

const bootstrap = async () => {
  const app = express();

  app.use(cors({ origin: "*" }));

  // ✅ Handle webhook first, BEFORE express.json()
  app.use(
    "/subscription/webhook",
    express.raw({ type: "application/json" }),
    subscriptionRouter
  );

  // ✅ Apply express.json() AFTER webhook route is mounted
  app.use(express.json());

  // Serve static files
  app.use(express.static("public"));

  await database_connection();

  // Other routes
  routerHandler(app);

  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`Server is running on port ${port}!`); // ✅ fixed backticks
  });
};

export default bootstrap;
