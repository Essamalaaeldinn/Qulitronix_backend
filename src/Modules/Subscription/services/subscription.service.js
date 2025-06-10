// subscription.service.js
import Stripe from "stripe";
import mongoose from "mongoose";
import User from "../../../DB/models/users.model.js";
import dotenv from "dotenv";
dotenv.config();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2024-04-10" });

export const PLANS = {
  basic:   { priceId: "price_1QvNboJraeAEtfLfmlXv17lR", photosPerDay: 10  },
  silver:  { priceId: "price_1QvNcxJraeAEtfLftl5v8QJU", photosPerDay: 75  },
  gold:    { priceId: "price_1QvNBSJraeAEtfLfxlms1j5j", photosPerDay: 200 },
  diamond: { priceId: "price_1QvNdpJraeAEtfLfhpUuBK6A", photosPerDay: 500 },
};

/* -------------------------------------------------------------------------- */
/* 1. createCheckoutSession                                                   */
/* -------------------------------------------------------------------------- */
export const createCheckoutSession = async (req, res) => {
  const { userId, plan } = req.body;

  if (!PLANS[plan])                    return res.status(400).json({ error: "Invalid plan selected" });
  if (!mongoose.Types.ObjectId.isValid(userId))
                                       return res.status(400).json({ error: "Invalid user ID" });

  const user = await User.findById(userId);
  if (!user)                           return res.status(404).json({ error: "User not found" });

  const session = await stripe.checkout.sessions.create({
    mode:               "subscription",
    payment_method_types: ["card"],
    customer_email:     user.email,
    client_reference_id: userId.toString(),     // easier lookup later
    metadata:           { plan },
    line_items: [{
      price:    PLANS[plan].priceId,
      quantity: 1,
    }],
    success_url: `${process.env.FRONTEND_URL}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url:  `${process.env.FRONTEND_URL}/payment-failed`,
  });

  return res.json({ success: true, sessionId: session.id, url: session.url });
};

/* -------------------------------------------------------------------------- */
/* 2. stripeWebhook                                                           */
/* -------------------------------------------------------------------------- */
export const stripeWebhook = async (req, res) => {
  const sig = req.headers["stripe-signature"];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("\u26A0\uFE0F  Webhook signature failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(event.data.object);
        break;
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event.data.object);
        break;
      default:
        console.log(`Unhandled event type ${event.type}`);
    }
  } catch (dbErr) {
    console.error("Database update error:", dbErr);
    return res.status(500).send("Webhook handler failed");
  }

  res.json({ received: true }); 
};

/* -------------------------------------------------------------------------- */
/* 3. helpers                                                                 */
/* -------------------------------------------------------------------------- */
const handleCheckoutCompleted = async (session) => {
  const userId = session.client_reference_id;
  const plan   = session.metadata?.plan;

  if (!userId || !plan || !PLANS[plan]) {
    throw new Error("Invalid session metadata or plan not found");
  }

  await User.findByIdAndUpdate(
    userId,
    {
      isPremium:            true,
      subscriptionStatus:   "subscribed",
      subscriptionDate:     new Date(),
      plan,
      photosPerDay:         PLANS[plan].photosPerDay,
      stripeCustomerId:     session.customer,
      stripeSubscriptionId: session.subscription,
    },
    { new: true }
  );
};

const handleSubscriptionDeleted = async (subscription) => {
  const user = await User.findOne({ stripeSubscriptionId: subscription.id });
  if (!user) return;

  await User.findByIdAndUpdate(
    user._id,
    {
      isPremium:          false,
      subscriptionStatus: "canceled",
      plan:               "basic",
      photosPerDay:       PLANS.basic.photosPerDay,
    }
  );
};
