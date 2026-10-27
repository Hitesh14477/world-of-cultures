export async function createNotificationSafely(NotificationModel, notification, eventName) {
  if (!NotificationModel || !notification?.recipient) return false
  try {
    await NotificationModel.create(notification)
    return true
  } catch {
    // The primary like, comment, or moderation action has already succeeded.
    // Log only a fixed event label so no user content or secrets enter logs.
    console.error(`Notification could not be recorded (${eventName}).`)
    return false
  }
}
