import { config } from '../config/index.js';

/**
 * Instant "new order" push to the merchant via a Telegram bot (free, arrives on
 * the phone immediately). Enabled only when TELEGRAM_BOT_TOKEN and
 * TELEGRAM_CHAT_ID are set. Best-effort — never throws, never blocks the order.
 *
 * Tip: add the bot to a Telegram group and use the group's chat id to notify a
 * whole team at once.
 */
export async function sendOrderNotification(order) {
  const { botToken, chatId } = config.telegram;
  if (!botToken || !chatId || !order) return;

  try {
    const c = order.customer || {};
    const text = [
      `🛒 নতুন অর্ডার #${order.orderNumber}`,
      '',
      `📦 ${order.offerTitle || ''}${order.quantity ? ' ×' + order.quantity : ''}`,
      order.variantSummary ? `🏷️ ${order.variantSummary}` : '',
      `💰 মোট: ৳${order.total}` + (order.deliveryCharge != null ? ` (ডেলিভারি ৳${order.deliveryCharge})` : ''),
      '',
      `👤 ${c.name || ''}`,
      `📞 ${c.phone || ''}`,
      `📍 ${c.address || ''}${order.deliveryZoneName ? ' — ' + order.deliveryZoneName : ''}`,
      '',
      `🔗 ${order.source || 'Direct'}`,
    ].filter((line) => line !== '').join('\n');

    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
    });
  } catch (e) {
    console.error('[notify] telegram order notification failed:', e.message);
  }
}

export default { sendOrderNotification };
