const webpush = require('web-push');
const Subscription = require('../models/Subscription');

console.log('🔑 Checking VAPID keys configuration...');
console.log(`   VAPID_PUBLIC_KEY: ${process.env.VAPID_PUBLIC_KEY ? '✅ Set' : '❌ Missing'}`);
console.log(`   VAPID_PRIVATE_KEY: ${process.env.VAPID_PRIVATE_KEY ? '✅ Set' : '❌ Missing'}`);

if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:test@example.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
  console.log('✅ VAPID details configured successfully');
} else {
  console.error('❌ WARNING: VAPID keys not set! Push notifications will NOT work.');
}

const sendNotificationToUser = async (user_id, payload) => {
  try {
    console.log(`📧 Sending notification to user: ${user_id}`);
    console.log(`   Payload: ${JSON.stringify(payload)}`);

    const subscriptions = await Subscription.find({ user_id });
    console.log(`   Found ${subscriptions.length} subscription(s) for this user`);

    if (subscriptions.length === 0) {
      console.warn(`⚠️  No subscriptions found for user: ${user_id}`);
      return;
    }

    const promises = subscriptions.map(async (sub, index) => {
      try {
        console.log(`   [Subscription ${index + 1}/${subscriptions.length}] Sending to endpoint...`);
        await webpush.sendNotification({
          endpoint: sub.endpoint,
          keys: sub.keys
        }, JSON.stringify(payload));
        console.log(`   ✅ Notification sent successfully`);
      } catch (err) {
        console.error(`   ❌ Error sending notification:`, err.message);
        if (err.statusCode === 410 || err.statusCode === 404) {
          console.log(`   🗑️  Subscription expired (${err.statusCode}). Deleting...`);
          await Subscription.findByIdAndDelete(sub._id);
        }
      }
    });
    await Promise.all(promises);
    console.log(`✅ Notification sending completed`);
  } catch (err) {
    console.error(`❌ Error in sendNotificationToUser:`, err.message);
    console.error(`   Stack:`, err.stack);
  }
};

module.exports = {
  webpush,
  sendNotificationToUser
};
