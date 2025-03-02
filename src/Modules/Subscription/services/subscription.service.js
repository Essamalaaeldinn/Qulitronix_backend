import Stripe from "stripe";
import mongoose from "mongoose";
import User from "../../../DB/models/users.model.js";
import dotenv from "dotenv";
dotenv.config();

const stripeInstance = new Stripe(process.env.STRIPE_SECRET_KEY);

const PLANS = {
    basic: { priceId: "price_1QvNboJraeAEtfLfmlXv17lR", photosPerDay: 10 },
    silver: { priceId: "price_1QvNcxJraeAEtfLftl5v8QJU", photosPerDay: 75 },
    gold: { priceId: "price_1QvNBSJraeAEtfLfxlms1j5j", photosPerDay: 200 },
    diamond: { priceId: "price_1QvNdpJraeAEtfLfhpUuBK6A", photosPerDay: 500 },
};

export const createCheckoutSession = async (req, res) => {
    const { userId, plan } = req.body;

    if (!PLANS[plan]) return res.status(400).json({ error: "Invalid plan selected" });
    if (!mongoose.Types.ObjectId.isValid(userId)) return res.status(400).json({ error: "Invalid user ID format" });

    try {
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ error: "User not found" });

        const session = await stripeInstance.checkout.sessions.create({
            payment_method_types: ["card"],
            mode: "subscription", // Must be "subscription" since it's recurring
            customer_email: user.email,
            line_items: [{
                price: PLANS[plan].priceId, // Use pre-created Stripe Price ID
                quantity: 1,
            }],
            success_url: `${process.env.FRONTEND_URL}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${process.env.FRONTEND_URL}/payment-failed`,
            metadata: { userId: userId.toString(), plan: plan.toString() },
        });

        res.json({ success: true, sessionId: session.id, url: session.url });
    } catch (error) {
        console.error("Checkout Session Error:", error.message);
        res.status(500).json({ error: "Internal Server Error" });
    }
};

export const stripeWebhook = async (req, res) => {
    const sig = req.headers["stripe-signature"];
    let event;

    try {
        event = stripeInstance.webhooks.constructEvent(req.rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
        console.error("Webhook signature verification failed:", err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === "checkout.session.completed") {
        const session = event.data.object;

        if (session.payment_status === "paid") {
            const { userId, plan } = session.metadata;

            try {
                const sessionUser = await User.findByIdAndUpdate(
                    userId,
                    {
                        isPremium: true,
                        subscriptionDate: new Date(),
                        plan,
                        photosPerDay: PLANS[plan].photosPerDay,
                    },
                    { new: true }
                );

                if (!sessionUser) {
                    console.error("User not found for subscription update.");
                } else {
                    console.log(`Subscription activated for user ${userId}`);
                }
            } catch (err) {
                console.error("Error updating user subscription:", err);
            }
        }
    }

    res.json({ received: true });
};
