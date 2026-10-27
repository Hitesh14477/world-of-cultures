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

const User = mongoose.models.User || mongoose.model('User', UserSchema)

export default User
