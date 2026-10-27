import mongoose from 'mongoose';
import { SourceReferenceSchema } from './sourceMetadata.js';

const FactualClaimSchema = new mongoose.Schema({
  propertyId: { type: String, required: true, trim: true, match: /^P\d+$/, maxlength: 16 },
  propertyLabel: { type: String, required: true, trim: true, maxlength: 160 },
  value: { type: String, required: true, trim: true, maxlength: 1000 },
  valueUrl: { type: String, trim: true, match: /^https:\/\//i, maxlength: 500 },
  references: {
    type: [SourceReferenceSchema],
    required: true,
    validate: { validator: (references) => references.length > 0, message: 'Each factual claim requires at least one source reference.' },
  },
}, { _id: false });

export default FactualClaimSchema;
