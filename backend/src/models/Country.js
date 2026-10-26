import mongoose from 'mongoose';

export const CONTINENTS = [
  'Africa',
  'Asia',
  'Europe',
  'North America',
  'Oceania',
  'South America',
];

export function slugifyCountryName(value = '') {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

const SourceSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  url: {
    type: String,
    required: true,
    trim: true,
    match: /^https?:\/\//i,
  },
  publisher: { type: String, trim: true },
  accessedAt: { type: Date },
}, { _id: false });

const SourcedCultureItemSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 160 },
  summary: { type: String, trim: true, maxlength: 500 },
  content: { type: String, required: true, trim: true, maxlength: 12000 },
  sources: { type: [SourceSchema], default: [] },
}, { _id: false });

const CultureSchema = new mongoose.Schema({
  history: { type: [SourcedCultureItemSchema], default: [] },
  traditions: { type: [SourcedCultureItemSchema], default: [] },
  food: { type: [SourcedCultureItemSchema], default: [] },
  traditionalClothing: { type: [SourcedCultureItemSchema], default: [] },
  festivals: { type: [SourcedCultureItemSchema], default: [] },
  languagesAndDialects: { type: [SourcedCultureItemSchema], default: [] },
  mythologyAndFolklore: { type: [SourcedCultureItemSchema], default: [] },
  musicAndDance: { type: [SourcedCultureItemSchema], default: [] },
  landmarks: { type: [SourcedCultureItemSchema], default: [] },
  everydayLife: { type: [SourcedCultureItemSchema], default: [] },
}, { _id: false });

const CountrySchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  officialName: { type: String, required: true, trim: true, maxlength: 180 },
  slug: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
    match: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
  },
  cca2: { type: String, required: true, trim: true, uppercase: true, match: /^[A-Z]{2}$/ },
  cca3: { type: String, required: true, trim: true, uppercase: true, match: /^[A-Z]{3}$/ },
  capital: { type: [String], default: [] },
  flagEmoji: { type: String, trim: true, maxlength: 16 },
  flagImageUrl: {
    type: String,
    trim: true,
    validate: {
      validator: (value) => !value || /^https?:\/\//i.test(value),
      message: 'Flag image URL must use HTTP or HTTPS.',
    },
  },

  continent: { type: String, required: true, enum: CONTINENTS },
  region: { type: String, trim: true },
  subregion: { type: String, trim: true },
  area: { type: Number, min: 0 },
  latitude: { type: Number, min: -90, max: 90 },
  longitude: { type: Number, min: -180, max: 180 },
  landlocked: { type: Boolean, default: null },
  borders: {
    type: [{ type: String, uppercase: true, trim: true, match: /^[A-Z]{3}$/ }],
    default: [],
  },

  population: { type: Number, min: 0 },
  languages: {
    type: [{
      code: { type: String, trim: true, uppercase: true },
      name: { type: String, required: true, trim: true },
    }],
    default: [],
  },
  currencies: {
    type: [{
      code: { type: String, required: true, trim: true, uppercase: true },
      name: { type: String, required: true, trim: true },
      symbol: { type: String, trim: true },
    }],
    default: [],
  },
  timeZones: { type: [String], default: [] },

  culture: { type: CultureSchema, default: () => ({}) },
  dataSource: { type: String, trim: true },
}, { timestamps: true, strict: 'throw' });

CountrySchema.pre('validate', function normalizeCountryIdentifiers() {
  if (this.cca2) this.cca2 = this.cca2.trim().toUpperCase();
  if (this.cca3) this.cca3 = this.cca3.trim().toUpperCase();
  if (this.slug) this.slug = slugifyCountryName(this.slug);
  else if (this.name) this.slug = slugifyCountryName(this.name);
  if (this.borders) this.borders = this.borders.map((code) => code.trim().toUpperCase());
});

CountrySchema.index({ slug: 1 }, { unique: true });
CountrySchema.index({ cca2: 1 }, { unique: true });
CountrySchema.index({ cca3: 1 }, { unique: true });
CountrySchema.index({ continent: 1, name: 1 });
CountrySchema.index({ name: 1 });
CountrySchema.index({ officialName: 1 });

const Country = mongoose.models.Country || mongoose.model('Country', CountrySchema);

export default Country;
