import mongoose from 'mongoose'

const NotificationSchema = new mongoose.Schema({
  recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  type: { type: String, enum: ['community_like', 'community_comment', 'community_post_removed', 'contribution_approved', 'contribution_rejected'], required: true },
  message: { type: String, required: true, trim: true, maxlength: 500 },
  targetType: { type: String, enum: ['community-post', 'community-comment', 'cultural-entry', 'place'], required: true },
  targetId: { type: mongoose.Schema.Types.ObjectId, required: true },
  link: { type: String, required: true, maxlength: 500, validate: { validator: (value) => typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') && !value.includes('\\'), message: 'Notification link must be an internal path.' } },
  isRead: { type: Boolean, default: false, required: true },
}, { timestamps: true, strict: 'throw' })

NotificationSchema.index({ recipient: 1, createdAt: -1 })
NotificationSchema.index({ recipient: 1, isRead: 1, createdAt: -1 })

const Notification = mongoose.models.Notification || mongoose.model('Notification', NotificationSchema)
export default Notification
