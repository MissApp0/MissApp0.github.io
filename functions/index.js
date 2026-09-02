const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { logger } = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();
const db = admin.firestore();

/** Sends data-only FCM so the service worker can safely render one notification. */
exports.notifyOnMessage = onDocumentCreated('conversations/{conversationId}/messages/{messageId}', async event => {
  const message = event.data?.data();
  const { conversationId, messageId } = event.params;
  if (!message || typeof message.sender !== 'string' || typeof message.receiver !== 'string' ||
      typeof message.text !== 'string' || !message.text.trim() || message.sender === message.receiver) {
    logger.warn('Ignoring malformed message', { conversationId, messageId });
    return;
  }
  const receiver = await db.doc(`users/${message.receiver}`).get();
  if (!receiver.exists) return;
  const user = receiver.data();
  const token = user.token;
  if (typeof token !== 'string' || !token) return;
  const body = message.text.trim().slice(0, 180);
  try {
    await admin.messaging().send({
      token,
      data: {
        title: `📩 Message from ${String(message.senderName || message.sender).slice(0, 48)}`,
        body,
        sender: message.sender,
        senderName: String(message.senderName || message.sender),
        receiver: message.receiver,
        conversationId,
        messageId,
        url: './'
      },
      webpush: { headers: { Urgency: 'high' } }
    });
  } catch (error) {
    const invalid = new Set(['messaging/registration-token-not-registered', 'messaging/invalid-registration-token']);
    if (invalid.has(error.code)) {
      await receiver.ref.update({ token: admin.firestore.FieldValue.delete(), notificationMode: 'live-sync' });
      logger.info('Removed invalid FCM token', { receiver: message.receiver });
      return;
    }
    logger.error('Could not send message notification', { conversationId, messageId, code: error.code, error: error.message });
  }
});
