import mongoose from 'mongoose'

const CommunityPostSchema = new mongoose.Schema({
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  country: { type: mongoose.Schema.Types.ObjectId, ref: 'Country', required: true },
  image: {
    url: { type: String, required: true, trim: true, match: /^https:\/\//i },
    publicId: { type: String, required: true, trim: true },
  },
  caption: { type: String, required: true, trim: true, maxlength: 1000 },
  likesCount: { type: Number, min: 0, default: 0 },
  commentsCount: { type: Number, min: 0, default: 0 },
  pendingImageCleanupIds: { type: [String], default: [] },
  status: { type: String, enum: ['published', 'pending_review', 'removed'], default: 'published' },
}, { timestamps: true, strict: 'throw' })

CommunityPostSchema.index({ status: 1, createdAt: -1, _id: -1 })
CommunityPostSchema.index({ country: 1, status: 1, createdAt: -1, _id: -1 })
CommunityPostSchema.index({ author: 1, createdAt: -1 })

const CommunityPost = mongoose.models.CommunityPost || mongoose.model('CommunityPost', CommunityPostSchema)

export default CommunityPost
