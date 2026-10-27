import mongoose from 'mongoose'

export const FAVOURITE_TYPES = ['country', 'cultural-entry', 'place', 'community-post']

const UserFavouriteSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  targetType: { type: String, required: true, enum: FAVOURITE_TYPES },
  targetId: { type: mongoose.Schema.Types.ObjectId, required: true },
}, { timestamps: true, strict: 'throw' })

UserFavouriteSchema.index({ user: 1, createdAt: -1 })
UserFavouriteSchema.index({ user: 1, targetType: 1, targetId: 1 }, { unique: true })

const UserFavourite = mongoose.models.UserFavourite || mongoose.model('UserFavourite', UserFavouriteSchema)

export default UserFavourite
