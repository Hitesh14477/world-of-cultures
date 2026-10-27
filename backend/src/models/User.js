import mongoose from 'mongoose'

const UserSchema = new mongoose.Schema({
  // Optional to keep accounts created before username support valid.
  username: {
    type: String,
    lowercase: true,
    trim: true,
    minlength: 3,
    maxlength: 24,
    match: /^[a-z0-9_]{3,24}$/,
  },
  displayName: { type: String, trim: true, maxlength: 60, default: '' },
  bio: { type: String, trim: true, maxlength: 240, default: '' },
  avatarUrl: { type: String, trim: true, maxlength: 2048, match: /^(?:https:\/\/\S+)?$/i },
  avatarPublicId: { type: String, trim: true, maxlength: 255, select: false },
  // Stable, server-managed identity for the separate administrator account's community profile.
  // It is never accepted by public registration or profile-update payloads.
  adminIdentity: { type: String, select: false },
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    maxlength: 254,
    match: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/,
  },
  passwordHash: {
    type: String,
    required: true,
    select: false,
    maxlength: 160,
    match: /^scrypt\$[A-Za-z0-9_-]{20,}\$[A-Za-z0-9_-]{80,}$/,
  },
}, {
  timestamps: true,
  strict: 'throw',
  toJSON: { transform(_document, result) { delete result.passwordHash; return result } },
  toObject: { transform(_document, result) { delete result.passwordHash; return result } },
})

UserSchema.index({ email: 1 }, { unique: true })
UserSchema.index({ username: 1 }, {
  unique: true,
  partialFilterExpression: { username: { $type: 'string' } },
})
UserSchema.index({ adminIdentity: 1 }, { unique: true, sparse: true })

const User = mongoose.models.User || mongoose.model('User', UserSchema)

export default User
