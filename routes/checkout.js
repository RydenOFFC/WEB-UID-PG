const router = require('express').Router()
const pool = require('../db')
const { auth } = require('./middleware')
const Stripe = require('stripe')
const stripe = process.env.STRIPE_SECRET_KEY ? Stripe(process.env.STRIPE_SECRET_KEY) : null

function stripeEnabled(res) {
  if (!stripe) {
    console.error('Missing STRIPE_SECRET_KEY environment variable')
    res.status(500).json({ success: false, error: 'Payment configuration missing' })
    return false
  }
  return true
}

router.post('/', auth, async (req, res) => {
  const { items } = req.body

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, error: 'No items specified' })
  }

  const productIds = [...new Set(items
    .map(item => parseInt(item.productId, 10))
    .filter(id => Number.isInteger(id) && id > 0)
  )]

  if (productIds.length === 0) {
    return res.status(400).json({ success: false, error: 'No valid product IDs' })
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const productsResult = await client.query(
      'SELECT id, ff_id, uid, password, price FROM products WHERE id = ANY($1) AND status = $2 FOR UPDATE',
      [productIds, 'AVAILABLE']
    )

    if (productsResult.rows.length !== productIds.length) {
      await client.query('ROLLBACK')
      return res.status(409).json({ success: false, error: 'Product no longer available' })
    }

    if (!stripeEnabled(res)) {
      await client.query('ROLLBACK')
      return
    }

    const orderIds = []
    for (const product of productsResult.rows) {
      const orderInsert = await client.query(
        `INSERT INTO orders (user_id, product_id, amount_paid, currency_used, status, created_at)
         VALUES ($1, $2, $3, 'MYR', 'PENDING', NOW()) RETURNING id`,
        [req.userId, product.id, parseFloat(product.price)]
      )
      orderIds.push(orderInsert.rows[0].id)
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['fpx'],
      mode: 'payment',
      line_items: productsResult.rows.map(product => ({
        price_data: {
          currency: 'myr',
          product_data: {
            name: `FF ID ${product.ff_id}`,
            description: `UID ${product.uid}`
          },
          unit_amount: Math.round(parseFloat(product.price) * 100)
        },
        quantity: 1
      })),
      success_url: `${process.env.FRONTEND_URL}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/payment-cancel`,
      metadata: {
        type: 'PURCHASE',
        orderIds: JSON.stringify(orderIds),
        productIds: JSON.stringify(productIds),
        userId: String(req.userId)
      }
    })

    await client.query(
      'UPDATE orders SET stripe_session_id = $1 WHERE id = ANY($2)',
      [session.id, orderIds]
    )

    await client.query('COMMIT')
    res.json({ success: true, redirectUrl: session.url })
  } catch (error) {
    await client.query('ROLLBACK')
    console.error('Checkout request failed', error)
    res.status(500).json({ success: false, error: 'Checkout failed' })
  } finally {
    client.release()
  }
})

async function handleCheckoutWebhook(req, res) {
  if (!stripe) {
    console.error('Missing STRIPE_SECRET_KEY for checkout webhook')
    return res.status(500).json({ error: 'Payment configuration missing' })
  }

  const sig = req.headers['stripe-signature']
  let event

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET)
  } catch (error) {
    console.error('Checkout webhook signature failed', error.message || error)
    return res.status(400).send(`Webhook Error: ${error.message}`)
  }

  if (event.type !== 'checkout.session.completed') {
    return res.json({ received: true })
  }

  const session = event.data.object
  if (session.payment_status !== 'paid') {
    return res.json({ received: true })
  }

  const metadata = session.metadata || {}
  if (metadata.type === 'TOPUP') {
    return res.json({ received: true })
  }

  const stripeSessionId = session.id
  const userId = Number(metadata.userId)
  const productIds = Array.isArray(metadata.productIds) ? metadata.productIds : JSON.parse(metadata.productIds || '[]')

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const orderResult = await client.query(
      'SELECT id, status, amount_paid FROM orders WHERE stripe_session_id=$1 FOR UPDATE',
      [stripeSessionId]
    )

    if (orderResult.rows.length === 0) {
      await client.query('COMMIT')
      return res.json({ received: true })
    }

    const alreadySuccess = orderResult.rows.every(order => order.status === 'SUCCESS')
    if (alreadySuccess) {
      await client.query('COMMIT')
      return res.json({ received: true })
    }

    await client.query(
      'UPDATE products SET status = $1 WHERE id = ANY($2)',
      ['SOLD', productIds]
    )

    await client.query(
      'UPDATE orders SET status = $1, stripe_payment_intent = $2 WHERE stripe_session_id = $3',
      ['SUCCESS', session.payment_intent || null, stripeSessionId]
    )

    for (const order of orderResult.rows) {
      await client.query(
        'INSERT INTO wallet_transactions (user_id, type, amount, note, created_at) VALUES ($1, $2, $3, $4, NOW())',
        [userId, 'PURCHASE', parseFloat(order.amount_paid), `Stripe purchase order ${order.id}`]
      )
    }

    if (productIds.length > 0) {
      await client.query(
        'DELETE FROM carts WHERE user_id = $1 AND product_id = ANY($2)',
        [userId, productIds]
      )
    }

    await client.query('COMMIT')
    return res.json({ received: true })
  } catch (error) {
    await client.query('ROLLBACK')
    console.error('Checkout webhook processing failed', error)
    return res.status(500).json({ error: 'Webhook processing failed' })
  } finally {
    client.release()
  }
}

router.post('/webhook', handleCheckoutWebhook)

module.exports = {
  router,
  webhook: handleCheckoutWebhook
}
