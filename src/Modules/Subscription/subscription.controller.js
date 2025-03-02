import express from "express";
import { createCheckoutSession, stripeWebhook } from "./services/subscription.service.js";

const router = express.Router();

router.post("/checkout", createCheckoutSession);
router.post("/webhook", express.raw({ type: "application/json" }), stripeWebhook);

export default router;
