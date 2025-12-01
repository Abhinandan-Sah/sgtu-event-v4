// Razorpay Payment Service - Production-ready payment integration
import Razorpay from 'razorpay';
import crypto from 'crypto';

class PaymentService {
  /**
   * Initialize Razorpay instance
   */
  static getRazorpayInstance() {
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      throw new Error('Razorpay credentials not configured');
    }

    return new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET
    });
  }

  /**
   * Create Razorpay order for event registration
   * @param {Object} orderData - { amount, currency, event_id, student_id, event_code }
   * @returns {Promise<Object>} Razorpay order
   */
  static async createOrder(orderData) {
    try {
      const { amount, currency = 'INR', event_id, student_id, event_code } = orderData;

      console.log('📋 [RAZORPAY] Creating order with:', { amount, currency, event_id, student_id, event_code });

      // Validate amount (minimum Rs. 1)
      if (amount < 1) {
        throw new Error('Invalid amount. Minimum payment is Rs. 1');
      }

      const razorpay = this.getRazorpayInstance();

      // Create receipt (max 40 chars for Razorpay)
      const timestamp = Date.now();
      const receipt = `${event_code}_${timestamp}`.substring(0, 40);

      // Create order
      const order = await razorpay.orders.create({
        amount: Math.round(amount * 100), // Convert to paise (smallest currency unit)
        currency: currency,
        receipt: receipt,
        notes: {
          event_id,
          student_id,
          event_code,
          purpose: 'event_registration'
        }
      });

      console.log(`✅ [RAZORPAY] Order created: ${order.id} for Rs. ${amount}`);

      return {
        order_id: order.id,
        amount: order.amount / 100, // Convert back to rupees
        currency: order.currency,
        receipt: order.receipt,
        status: order.status
      };
    } catch (error) {
      console.error('❌ [RAZORPAY] Order creation failed:', error);
      
      // Handle different error types
      const errorMessage = error.message || 
                          error.error?.description || 
                          error.description || 
                          JSON.stringify(error);
      
      throw new Error(`Payment order creation failed: ${errorMessage}`);
    }
  }

  /**
   * Verify Razorpay payment signature
   * @param {Object} paymentData - { order_id, payment_id, signature }
   * @returns {boolean} True if signature is valid
   */
  static verifyPaymentSignature(paymentData) {
    try {
      const { order_id, payment_id, signature } = paymentData;

      if (!order_id || !payment_id || !signature) {
        throw new Error('Missing required payment verification parameters');
      }

      // Generate expected signature
      const expectedSignature = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
        .update(`${order_id}|${payment_id}`)
        .digest('hex');

      // Compare signatures (timing-safe comparison)
      const isValid = crypto.timingSafeEqual(
        Buffer.from(expectedSignature),
        Buffer.from(signature)
      );

      if (isValid) {
        console.log(`✅ [RAZORPAY] Payment verified: ${payment_id}`);
      } else {
        console.log(`❌ [RAZORPAY] Invalid signature for payment: ${payment_id}`);
      }

      return isValid;
    } catch (error) {
      console.error('❌ [RAZORPAY] Signature verification failed:', error);
      return false;
    }
  }

  /**
   * Fetch payment details from Razorpay
   * @param {string} paymentId - Razorpay payment ID
   * @returns {Promise<Object>} Payment details
   */
  static async getPaymentDetails(paymentId) {
    try {
      const razorpay = this.getRazorpayInstance();
      const payment = await razorpay.payments.fetch(paymentId);

      return {
        id: payment.id,
        order_id: payment.order_id,
        amount: payment.amount / 100, // Convert to rupees
        currency: payment.currency,
        status: payment.status,
        method: payment.method,
        email: payment.email,
        contact: payment.contact,
        created_at: payment.created_at,
        captured: payment.captured,
        notes: payment.notes
      };
    } catch (error) {
      console.error('❌ [RAZORPAY] Fetch payment failed:', error);
      throw new Error(`Failed to fetch payment details: ${error.message}`);
    }
  }

  /**
   * Fetch order details from Razorpay
   * @param {string} orderId - Razorpay order ID
   * @returns {Promise<Object>} Order details
   */
  static async getOrderDetails(orderId) {
    try {
      const razorpay = this.getRazorpayInstance();
      const order = await razorpay.orders.fetch(orderId);

      return {
        id: order.id,
        amount: order.amount / 100,
        currency: order.currency,
        status: order.status,
        receipt: order.receipt,
        notes: order.notes,
        created_at: order.created_at,
        amount_paid: order.amount_paid / 100,
        amount_due: order.amount_due / 100
      };
    } catch (error) {
      console.error('❌ [RAZORPAY] Fetch order failed:', error);
      throw new Error(`Failed to fetch order details: ${error.message}`);
    }
  }

  /**
   * Process refund
   * @param {Object} refundData - { payment_id, amount, notes }
   * @returns {Promise<Object>} Refund details
   */
  static async processRefund(refundData) {
    try {
      const { payment_id, amount, notes = {} } = refundData;

      if (!payment_id) {
        throw new Error('Payment ID is required for refund');
      }

      const razorpay = this.getRazorpayInstance();

      // Create refund (amount in paise, if not specified - full refund)
      const refund = await razorpay.payments.refund(payment_id, {
        amount: amount ? Math.round(amount * 100) : undefined,
        notes
      });

      console.log(`✅ [RAZORPAY] Refund processed: ${refund.id} for Rs. ${refund.amount / 100}`);

      return {
        id: refund.id,
        payment_id: refund.payment_id,
        amount: refund.amount / 100,
        currency: refund.currency,
        status: refund.status,
        created_at: refund.created_at,
        notes: refund.notes
      };
    } catch (error) {
      console.error('❌ [RAZORPAY] Refund failed:', error);
      throw new Error(`Refund processing failed: ${error.message}`);
    }
  }

  /**
   * Verify webhook signature
   * @param {string} webhookBody - Raw webhook body
   * @param {string} signature - X-Razorpay-Signature header
   * @returns {boolean} True if webhook is valid
   */
  static verifyWebhookSignature(webhookBody, signature) {
    try {
      if (!process.env.RAZORPAY_WEBHOOK_SECRET) {
        throw new Error('Razorpay webhook secret not configured');
      }

      const expectedSignature = crypto
        .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
        .update(webhookBody)
        .digest('hex');

      const isValid = crypto.timingSafeEqual(
        Buffer.from(expectedSignature),
        Buffer.from(signature)
      );

      if (isValid) {
        console.log('✅ [RAZORPAY] Webhook signature verified');
      } else {
        console.log('❌ [RAZORPAY] Invalid webhook signature');
      }

      return isValid;
    } catch (error) {
      console.error('❌ [RAZORPAY] Webhook verification failed:', error);
      return false;
    }
  }

  /**
   * Handle Razorpay webhook events
   * @param {Object} event - Webhook event payload
   * @returns {Promise<Object>} Processed event data
   */
  static async handleWebhook(event) {
    try {
      const { event: eventType, payload } = event;

      console.log(`📩 [RAZORPAY WEBHOOK] Received: ${eventType}`);

      switch (eventType) {
        case 'payment.captured':
          return {
            type: 'payment_success',
            payment_id: payload.payment.entity.id,
            order_id: payload.payment.entity.order_id,
            amount: payload.payment.entity.amount / 100,
            status: 'captured'
          };

        case 'payment.failed':
          return {
            type: 'payment_failed',
            payment_id: payload.payment.entity.id,
            order_id: payload.payment.entity.order_id,
            error_code: payload.payment.entity.error_code,
            error_description: payload.payment.entity.error_description,
            status: 'failed'
          };

        case 'refund.processed':
          return {
            type: 'refund_processed',
            refund_id: payload.refund.entity.id,
            payment_id: payload.refund.entity.payment_id,
            amount: payload.refund.entity.amount / 100,
            status: 'processed'
          };

        case 'order.paid':
          return {
            type: 'order_paid',
            order_id: payload.order.entity.id,
            amount_paid: payload.order.entity.amount_paid / 100,
            status: 'paid'
          };

        default:
          console.log(`⚠️ [RAZORPAY WEBHOOK] Unhandled event type: ${eventType}`);
          return {
            type: 'unhandled',
            event_type: eventType
          };
      }
    } catch (error) {
      console.error('❌ [RAZORPAY WEBHOOK] Processing failed:', error);
      throw new Error(`Webhook processing failed: ${error.message}`);
    }
  }

  /**
   * Generate payment link for event (alternative to checkout)
   * @param {Object} linkData - { amount, currency, description, customer, event_id }
   * @returns {Promise<Object>} Payment link details
   */
  static async createPaymentLink(linkData) {
    try {
      const {
        amount,
        currency = 'INR',
        description,
        customer,
        event_id,
        event_code
      } = linkData;

      const razorpay = this.getRazorpayInstance();

      const link = await razorpay.paymentLink.create({
        amount: Math.round(amount * 100),
        currency,
        description: description || 'Event Registration Payment',
        customer: {
          name: customer.name,
          email: customer.email,
          contact: customer.contact
        },
        notify: {
          sms: true,
          email: true
        },
        reminder_enable: true,
        notes: {
          event_id,
          event_code,
          purpose: 'event_registration'
        },
        callback_url: `${process.env.CLIENT_URL}/payment/callback`,
        callback_method: 'get'
      });

      console.log(`✅ [RAZORPAY] Payment link created: ${link.short_url}`);

      return {
        id: link.id,
        short_url: link.short_url,
        amount: link.amount / 100,
        currency: link.currency,
        status: link.status
      };
    } catch (error) {
      console.error('❌ [RAZORPAY] Payment link creation failed:', error);
      throw new Error(`Payment link creation failed: ${error.message}`);
    }
  }

  /**
   * Check if Razorpay is configured
   * @returns {boolean}
   */
  static isConfigured() {
    return !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
  }

  /**
   * Get Razorpay public key (safe to expose to frontend)
   * @returns {string} Public key
   */
  static getPublicKey() {
    return process.env.RAZORPAY_KEY_ID || null;
  }
}

export default PaymentService;
