import mongoose from 'mongoose'

export const SourceReferenceSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 200 },
  url: { type: String, required: true, trim: true, match: /^https?:\/\//i },
  publisher: { type: String, trim: true, maxlength: 160 },
  publishedAt: { type: Date },
  accessedAt: { type: Date },
  license: { type: String, trim: true, maxlength: 120 },
  licenseUrl: { type: String, trim: true, match: /^https?:\/\//i },
  attributionText: { type: String, trim: true, maxlength: 500 },
  licenseScope: { type: String, trim: true, maxlength: 240 },
}, { _id: false })

export const ImageAttributionSchema = new mongoose.Schema({
  title: { type: String, trim: true, maxlength: 200 },
  creator: { type: String, trim: true, maxlength: 160 },
  imageUrl: { type: String, trim: true, match: /^https?:\/\//i },
  sourceUrl: { type: String, required: true, trim: true, match: /^https?:\/\//i },
  license: { type: String, required: true, trim: true, maxlength: 120 },
  licenseUrl: { type: String, trim: true, match: /^https?:\/\//i },
  attributionText: { type: String, trim: true, maxlength: 500 },
}, { _id: false })
