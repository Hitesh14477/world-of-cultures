import mongoose from 'mongoose'

const CommunityLikeSchema = new mongoose.Schema({
  post: { type: mongoose.Schema.Types.ObjectId, ref: 'CommunityPost', required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true, strict: 'throw' })

CommunityLikeSchema.index({ post: 1, user: 1 }, { unique: true })
CommunityLikeSchema.index({ user: 1, createdAt: -1 })

const CommunityLike = mongoose.models.CommunityLike || mongoose.model('CommunityLike', CommunityLikeSchema)
export default CommunityLike
