const webpush = require('web-push');
const Subscription = require('../models/Subscription');

console.log('\n🔑 ========== VAPID CONFIGURATION CHECK ==========');
console.log(`   VAPID_PUBLIC_KEY: ${process.env.VAPID_PUBLIC_KEY ? '✅ Set (' + process.env.VAPID_PUBLIC_KEY.substring(0, 20) + '...)' : '❌ Missing'}`);
console.log(`   VAPID_PRIVATE_KEY: ${process.env.VAPID_PRIVATE_KEY ? '✅ Set (' + process.env.VAPID_PRIVATE_KEY.substring(0, 20) + '...)' : '❌ Missing'}`);
console.log(`   VAPID_SUBJECT: ${process.env.VAPID_SUBJECT || '⚠️  Using default'}`);

if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  try {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || 'mailto:test@example.com',
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );
    console.log('✅ VAPID details configured successfully');
  } catch (err) {
    console.error('❌ Error setting VAPID details:', err.message);
  }
} else {
  console.error('❌ ERROR: VAPID keys not set! Push notifications WILL NOT work!');
}
console.log('==================================================\n');

const sendNotificationToUser = async (user_id, payload) => {
  try {
    console.log(`\n📧 ========== SENDING PUSH NOTIFICATION ==========`);
    console.log(`   Recipient user_id: ${user_id}`);
    console.log(`   Payload title: ${payload.title}`);
    console.log(`   Payload body: ${payload.body}`);

    const subscriptions = await Subscription.find({ user_id });
    console.log(`   Found ${subscriptions.length} subscription(s) for user: ${user_id}`);

    if (subscriptions.length === 0) {
      console.warn(`⚠️  WARNING: No subscriptions found for user: ${user_id}`);
      console.warn(`   User may not have enabled push notifications or subscription wasn't saved`);
      return;
    }

    let successCount = 0;
    let failCount = 0;

    const promises = subscriptions.map(async (sub, index) => {
      try {
        console.log(`\n   [${index + 1}/${subscriptions.length}] Attempting to send notification...`);
        console.log(`      Endpoint: ${sub.endpoint.substring(0, 60)}...`);
        console.log(`      Subscription ID: ${sub._id}`);
        
        await webpush.sendNotification({
          endpoint: sub.endpoint,
          keys: sub.keys
        }, JSON.stringify(payload));
        
        console.log(`      ✅ Notification sent successfully!`);
        successCount++;
      } catch (err) {
        console.error(`      ❌ Error sending notification: ${err.message}`);
        console.error(`         Error code: ${err.statusCode}`);
        failCount++;
        
        if (err.statusCode === 410 || err.statusCode === 404) {
          console.log(`      🗑️  Subscription expired/invalid (${err.statusCode}). Deleting from DB...`);
          await Subscription.findByIdAndDelete(sub._id);
        } else if (err.statusCode === 401) {
          console.error(`      ⚠️  Authentication error (401) - Check VAPID keys!`);
        }
      }
    });
    
    await Promise.all(promises);
    console.log(`\n✅ NOTIFICATION SENDING COMPLETED`);
    console.log(`   Success: ${successCount}, Failed: ${failCount}`);
    console.log(`==================================================\n`);
  } catch (err) {
    console.error(`\n❌ ========== CRITICAL ERROR IN sendNotificationToUser ==========`);
    console.error(`   Error message: ${err.message}`);
    console.error(`   Error type: ${err.name}`);
    console.error(`   Stack: ${err.stack}`);
    console.error(`================================================================\n`);
  }
};

module.exports = {
  webpush,
  sendNotificationToUser
};
