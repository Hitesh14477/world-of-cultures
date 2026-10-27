import mongoose from 'mongoose'

const CommunityCommentSchema = new mongoose.Schema({
  post: { type: mongoose.Schema.Types.ObjectId, ref: 'CommunityPost', required: true },
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  content: { type: String, required: true, trim: true, minlength: 1, maxlength: 1000 },
  status: { type: String, enum: ['published', 'removed'], default: 'published', required: true },
}, { timestamps: true, strict: 'throw' })

CommunityCommentSchema.index({ post: 1, status: 1, createdAt: 1 })

const CommunityComment = mongoose.models.CommunityComment || mongoose.model('CommunityComment', CommunityCommentSchema)
export default CommunityComment
