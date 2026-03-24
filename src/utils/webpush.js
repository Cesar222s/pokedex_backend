const webpush = require('web-push');
const Subscription = require('../models/Subscription');

if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:test@example.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

const sendNotificationToUser = async (user_id, payload) => {
  try {
    const subscriptions = await Subscription.find({ user_id });
    const promises = subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification({
          endpoint: sub.endpoint,
          keys: sub.keys
        }, JSON.stringify(payload));
      } catch (err) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          console.log('Suscripción expirada. Eliminando...');
          await Subscription.findByIdAndDelete(sub._id);
        } else {
          console.error('Error enviando push notification:', err);
        }
      }
    });
    await Promise.all(promises);
  } catch (err) {
    console.error('Error en sendNotificationToUser:', err);
  }
};

module.exports = {
  webpush,
  sendNotificationToUser
};
