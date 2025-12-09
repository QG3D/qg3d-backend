// QG3D Backend - Stripe Payment Server
// Node.js + Express + Stripe

const express = require('express');
const cors = require('cors');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();

// Middleware
app.use(cors({
    origin: process.env.FRONTEND_URL || '*',
    methods: ['GET', 'POST'],
    credentials: true
}));
app.use(express.json());

// Health check endpoint
app.get('/', (req, res) => {
    res.json({ 
        status: 'online', 
        service: 'QG3D Payment API',
        version: '1.0.0'
    });
});

// Create Payment Intent
app.post('/create-payment-intent', async (req, res) => {
    try {
        const { amount, currency = 'eur', metadata = {} } = req.body;

        // Validation
        if (!amount || amount < 50) {
            return res.status(400).json({ 
                error: 'Le montant minimum est de 0.50€' 
            });
        }

        // Create Payment Intent
        const paymentIntent = await stripe.paymentIntents.create({
            amount: Math.round(amount), // Montant en centimes
            currency: currency,
            automatic_payment_methods: {
                enabled: true,
            },
            metadata: {
                ...metadata,
                integration_source: 'qg3d-website'
            }
        });

        res.json({
            clientSecret: paymentIntent.client_secret,
            paymentIntentId: paymentIntent.id
        });

    } catch (error) {
        console.error('Erreur création PaymentIntent:', error);
        res.status(500).json({ 
            error: 'Erreur lors de la création du paiement',
            details: error.message 
        });
    }
});

// Webhook endpoint (pour les notifications Stripe)
app.post('/webhook', express.raw({type: 'application/json'}), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let event;

    try {
        event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err) {
        console.error('Webhook signature verification failed:', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle the event
    switch (event.type) {
        case 'payment_intent.succeeded':
            const paymentIntent = event.data.object;
            console.log('✅ Paiement réussi:', paymentIntent.id);
            
            // TODO: Enregistrer la commande dans Firebase
            // TODO: Envoyer email de confirmation
            
            break;

        case 'payment_intent.payment_failed':
            const failedPayment = event.data.object;
            console.log('❌ Paiement échoué:', failedPayment.id);
            break;

        default:
            console.log(`Événement non géré: ${event.type}`);
    }

    res.json({received: true});
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Erreur serveur:', err);
    res.status(500).json({ 
        error: 'Erreur interne du serveur',
        details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Serveur QG3D démarré sur le port ${PORT}`);
    console.log(`📡 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`💳 Stripe: ${process.env.STRIPE_SECRET_KEY ? 'Configuré ✅' : 'Non configuré ⚠️'}`);
});

module.exports = app;
