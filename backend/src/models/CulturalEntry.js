import mongoose from 'mongoose'
import { ImageAttributionSchema, SourceReferenceSchema } from './schemas/sourceMetadata.js'
import FactualClaimSchema from './schemas/factualClaim.js'
import GenerationMetadataSchema from './schemas/generationMetadata.js'

export const CULTURAL_ENTRY_CATEGORIES = [
  'history',
  'traditional_food',
  'festivals',
  'traditional_clothing',
  'customs_and_traditions',
  'languages_and_dialects',
  'mythology_and_folklore',
  'music_and_dance',
  'everyday_life',
]

export const REVIEW_STATUSES = ['draft', 'pending_review', 'verified', 'published', 'rejected']

const SubmittedImageSchema = new mongoose.Schema({
  url: { type: String, required: true, trim: true, match: /^https:\/\//i },
  publicId: { type: String, required: true, trim: true, maxlength: 240 },
  caption: { type: String, trim: true, maxlength: 240 },
  rightsConfirmed: { type: Boolean, required: true, enum: [true] },
  rightsConfirmedAt: { type: Date, required: true },
}, { _id: false })

const CulturalEntrySchema = new mongoose.Schema({
  country: { type: mongoose.Schema.Types.ObjectId, ref: 'Country', required: true, index: true },
  submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  sourceKey: { type: String, trim: true, minlength: 1, maxlength: 180, match: /^[a-z0-9][a-z0-9:._/-]*$/i },
  category: { type: String, required: true, enum: CULTURAL_ENTRY_CATEGORIES, index: true },
  title: { type: String, required: true, trim: true, maxlength: 180 },
  summary: { type: String, trim: true, maxlength: 600 },
  content: { type: String, required: true, trim: true, maxlength: 20000 },
  region: { type: String, trim: true, maxlength: 160 },
  sources: { type: [SourceReferenceSchema], default: [] },
  // Structured sourced facts remain separate from the human-written summary/content.
  facts: { type: [FactualClaimSchema], default: [] },
  imageAttributions: { type: [ImageAttributionSchema], default: [] },
  image: { type: SubmittedImageSchema, default: undefined },
  generationMetadata: { type: GenerationMetadataSchema, default: undefined },
  reviewStatus: { type: String, enum: REVIEW_STATUSES, default: 'pending_review', required: true, index: true },
  rejectionReason: { type: String, trim: true, maxlength: 1000 },
}, { timestamps: true, strict: 'throw' })

CulturalEntrySchema.index({ country: 1, category: 1, reviewStatus: 1, title: 1 })
CulturalEntrySchema.index({ reviewStatus: 1, title: 1, _id: 1 })
CulturalEntrySchema.index(
  { country: 1, sourceKey: 1 },
  { unique: true, partialFilterExpression: { sourceKey: { $type: 'string' } } },
)

const CulturalEntry = mongoose.models.CulturalEntry || mongoose.model('CulturalEntry', CulturalEntrySchema)

export default CulturalEntry
