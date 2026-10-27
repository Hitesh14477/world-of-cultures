import mongoose from 'mongoose'
import { REVIEW_STATUSES } from './CulturalEntry.js'
import { ImageAttributionSchema, SourceReferenceSchema } from './schemas/sourceMetadata.js'
import FactualClaimSchema from './schemas/factualClaim.js'
import GenerationMetadataSchema from './schemas/generationMetadata.js'

export const PLACE_CATEGORIES = ['landmark', 'heritage_site', 'cultural_destination', 'museum', 'natural_site', 'other']

const CoordinatesSchema = new mongoose.Schema({
  latitude: { type: Number, min: -90, max: 90, required: true },
  longitude: { type: Number, min: -180, max: 180, required: true },
}, { _id: false })

const SubmittedImageSchema = new mongoose.Schema({
  url: { type: String, required: true, trim: true, match: /^https:\/\//i },
  publicId: { type: String, required: true, trim: true, maxlength: 240 },
  caption: { type: String, trim: true, maxlength: 240 },
  rightsConfirmed: { type: Boolean, required: true, enum: [true] },
  rightsConfirmedAt: { type: Date, required: true },
}, { _id: false })

const PlaceSchema = new mongoose.Schema({
  country: { type: mongoose.Schema.Types.ObjectId, ref: 'Country', required: true, index: true },
  submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  sourceKey: { type: String, trim: true, minlength: 1, maxlength: 180, match: /^[a-z0-9][a-z0-9:._/-]*$/i },
  name: { type: String, required: true, trim: true, maxlength: 180 },
  description: { type: String, trim: true, maxlength: 5000 },
  location: { type: String, trim: true, maxlength: 200 },
  region: { type: String, trim: true, maxlength: 160 },
  coordinates: { type: CoordinatesSchema, default: undefined },
  category: { type: String, enum: PLACE_CATEGORIES, default: 'other', required: true },
  sources: { type: [SourceReferenceSchema], default: [] },
  facts: { type: [FactualClaimSchema], default: [] },
  imageAttributions: { type: [ImageAttributionSchema], default: [] },
  image: { type: SubmittedImageSchema, default: undefined },
  generationMetadata: { type: GenerationMetadataSchema, default: undefined },
  reviewStatus: { type: String, enum: REVIEW_STATUSES, default: 'pending_review', required: true, index: true },
  rejectionReason: { type: String, trim: true, maxlength: 1000 },
}, { timestamps: true, strict: 'throw' })

// Keep legacy documents and unsubmitted research drafts readable; require an
// image for new user submissions and new records marked public.
PlaceSchema.pre('validate', function requireSubmissionImage() {
  const requiresImage = this.isNew && (this.submittedBy || ['verified', 'published'].includes(this.reviewStatus))
  if (requiresImage && (!this.image?.url || !this.image?.publicId || this.image?.rightsConfirmed !== true || !this.image?.rightsConfirmedAt)) {
    this.invalidate('image', 'A valid stored image is required for submitted or public places.')
  }
})

PlaceSchema.index({ country: 1, reviewStatus: 1, category: 1, name: 1 })
PlaceSchema.index({ reviewStatus: 1, name: 1, _id: 1 })
PlaceSchema.index(
  { country: 1, sourceKey: 1 },
  { unique: true, partialFilterExpression: { sourceKey: { $type: 'string' } } },
)

const Place = mongoose.models.Place || mongoose.model('Place', PlaceSchema)

export default Place
