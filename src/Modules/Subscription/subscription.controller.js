import express from "express";
import { createCheckoutSession, stripeWebhook } from "./services/subscription.service.js";

const router = express.Router();

router.post("/", stripeWebhook); // Changed from "/webhook" to "/"
router.post("/checkout", createCheckoutSession);

export default router;