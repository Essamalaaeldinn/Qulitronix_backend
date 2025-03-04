import express from "express";
import { config } from "dotenv";
import { database_connection } from "./DB/connection.js";
import routerHandler from "./utils/router-handler.utils.js";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

config();

// Resolve __dirname in ES module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const bootstrap = async () => {
    const app = express();

    app.use(cors({ origin: "*" }));
    app.use(express.json());

    // ✅ Serve static files from the 'public' folder
    app.use(express.static("public"));

    await database_connection();

    routerHandler(app);

    const port = process.env.PORT || 3000;
    app.listen(port, () => {
        console.log(`Server is running on port ${port}!`);
    });
};

export default bootstrap;
