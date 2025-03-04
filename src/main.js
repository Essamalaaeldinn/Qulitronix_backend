import express from "express";
import { config } from "dotenv";
import { database_connection } from "./DB/connection.js";
import routerHandler from "./utils/router-handler.utils.js";
import cors from "cors"; // ✅ Use import instead of require

config();

const bootstrap = async () => {
    const app = express();

    app.use(cors({ origin: "*" })); // ✅ Move inside function
    app.use(express.json());

    await database_connection();
    
    routerHandler(app);

    const port = process.env.PORT || 3000;
    app.listen(port, () => {
        console.log(`Server is running on port ${port}!`);
    });
};

export default bootstrap;
