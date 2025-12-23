// QG3D Backend - Stripe Payment + Email Server
// Node.js + Express + Stripe + Nodemailer

const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();

// Email transporter configuration
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.GMAIL_USER || 'qg3dprint@gmail.com',
        pass: process.env.GMAIL_APP_PASSWORD
    }
});

// Verify email configuration on startup
transporter.verify((error, success) => {
    if (error) {
        console.error('❌ Erreur configuration email:', error);
    } else {
        console.log('✅ Serveur email prêt à envoyer des messages');
    }
});

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

// Send Order Emails Endpoint
app.post('/send-order-emails', async (req, res) => {
    try {
        const { orderData } = req.body;

        if (!orderData) {
            return res.status(400).json({ error: 'Données de commande manquantes' });
        }

        console.log('📧 Envoi des emails pour commande:', orderData.orderNumber);

        // Format items list
        const itemsList = orderData.items.map(item => 
            `${item.quantity}x ${item.name} - ${item.price}€`
        ).join('\n');

        // Format shipping address
        const shippingAddress = `
${orderData.shippingAddress.firstName} ${orderData.shippingAddress.lastName}
${orderData.shippingAddress.street}
${orderData.shippingAddress.zip} ${orderData.shippingAddress.city}
${orderData.shippingAddress.country}
Téléphone: ${orderData.shippingAddress.phone}
        `.trim();

        // Email to customer
        const customerEmail = {
            from: '"QG3D" <qg3dprint@gmail.com>',
            to: orderData.customerEmail,
            subject: `Confirmation de commande #${orderData.orderNumber}`,
            html: `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #2c2c2c; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background-color: #f5f5f5; }
        .order-details { background: white; padding: 15px; margin: 20px 0; border-left: 4px solid #ff5757; }
        .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; }
        .button { display: inline-block; padding: 12px 30px; background-color: #ff5757; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>QG3D</h1>
            <p>Merci pour votre commande !</p>
        </div>
        
        <div class="content">
            <h2>Bonjour ${orderData.shippingAddress.firstName},</h2>
            <p>Nous avons bien reçu votre commande et nous vous remercions de votre confiance.</p>
            
            <div class="order-details">
                <h3>Détails de la commande</h3>
                <p><strong>N° de commande :</strong> ${orderData.orderNumber}</p>
                <p><strong>Date :</strong> ${new Date().toLocaleDateString('fr-FR')}</p>
                <p><strong>Montant total :</strong> ${orderData.total.toFixed(2)}€</p>
                
                <h4>Articles commandés :</h4>
                <pre>${itemsList}</pre>
                
                <h4>Adresse de livraison :</h4>
                <pre>${shippingAddress}</pre>
            </div>
            
            <p>Nous préparons votre commande avec soin. Vous recevrez un email de confirmation d'expédition dès que votre colis sera en route.</p>
            
            <a href="${process.env.FRONTEND_URL || 'http://localhost:8000'}/profile.html" class="button">Suivre ma commande</a>
        </div>
        
        <div class="footer">
            <p>© 2024 QG3D - Tous droits réservés</p>
            <p>Pour toute question, contactez-nous à qg3dprint@gmail.com</p>
        </div>
    </div>
</body>
</html>
            `
        };

        // Email to admin
        const adminEmail = {
            from: '"QG3D Notifications" <qg3dprint@gmail.com>',
            to: 'qg3dprint@gmail.com',
            subject: `🔔 Nouvelle commande #${orderData.orderNumber}`,
            html: `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #2c2c2c; color: white; padding: 20px; }
        .alert { background-color: #ff5757; color: white; padding: 15px; margin: 10px 0; border-radius: 5px; }
        .details { background: #f5f5f5; padding: 15px; margin: 10px 0; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🔔 Nouvelle Commande QG3D</h1>
        </div>
        
        <div class="alert">
            <strong>Commande n°${orderData.orderNumber}</strong> - ${orderData.total.toFixed(2)}€
        </div>
        
        <div class="details">
            <h3>Informations Client</h3>
            <p><strong>Nom :</strong> ${orderData.shippingAddress.firstName} ${orderData.shippingAddress.lastName}</p>
            <p><strong>Email :</strong> ${orderData.customerEmail}</p>
            <p><strong>Téléphone :</strong> ${orderData.shippingAddress.phone}</p>
            
            <h3>Articles commandés</h3>
            <pre>${itemsList}</pre>
            
            <h3>Adresse de livraison</h3>
            <pre>${shippingAddress}</pre>
            
            <h3>Informations de paiement</h3>
            <p><strong>ID Paiement Stripe :</strong> ${orderData.paymentId || 'N/A'}</p>
            <p><strong>Montant :</strong> ${orderData.total.toFixed(2)}€</p>
            
            ${orderData.orderNotes ? `<h3>Notes</h3><p>${orderData.orderNotes}</p>` : ''}
        </div>
        
        <p><a href="${process.env.FRONTEND_URL || 'http://localhost:8000'}/admin.html">Accéder à l'interface admin</a></p>
    </div>
</body>
</html>
            `
        };

        // Send both emails
        const results = await Promise.allSettled([
            transporter.sendMail(customerEmail),
            transporter.sendMail(adminEmail)
        ]);

        const customerSuccess = results[0].status === 'fulfilled';
        const adminSuccess = results[1].status === 'fulfilled';

        console.log('✅ Email client:', customerSuccess ? 'Envoyé' : 'Échoué');
        console.log('✅ Email admin:', adminSuccess ? 'Envoyé' : 'Échoué');

        res.json({
            success: true,
            customerEmailSent: customerSuccess,
            adminEmailSent: adminSuccess
        });

    } catch (error) {
        console.error('❌ Erreur envoi emails:', error);
        res.status(500).json({ 
            error: 'Erreur lors de l\'envoi des emails',
            details: error.message
        });
    }
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
