import mongoose from 'mongoose'

const authStateSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  kind: { type: String, required: true, enum: ['session', 'rate-limit'] },
  value: { type: mongoose.Schema.Types.Mixed },
  count: { type: Number },
  windowStartedAt: { type: Date },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
}, { timestamps: true, versionKey: false, collection: 'auth_state' })

export default mongoose.models.AuthState || mongoose.model('AuthState', authStateSchema)
