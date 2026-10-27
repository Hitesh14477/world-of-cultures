import mongoose from 'mongoose'

const GenerationMetadataSchema = new mongoose.Schema({
  provider: { type: String, enum: ['google-gemini'], required: true },
  model: { type: String, required: true, trim: true, maxlength: 120 },
  promptVersion: { type: String, required: true, trim: true, match: /^[a-z0-9][a-z0-9._/-]{0,79}$/i },
  generatedAt: { type: Date, required: true },
}, { _id: false, strict: 'throw' })

export default GenerationMetadataSchema
