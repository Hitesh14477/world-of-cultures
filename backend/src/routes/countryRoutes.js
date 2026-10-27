import { Router } from 'express';
import { createCountryController } from '../controllers/countryController.js';
import Country from '../models/Country.js';
import CulturalEntry from '../models/CulturalEntry.js';
import Place from '../models/Place.js';
import User from '../models/User.js';
import { createUserAuth } from '../middleware/userAuth.js';
import { createAdminAuth } from '../middleware/adminAuth.js';
import { createMemberAuth } from '../middleware/memberAuth.js';
import multer from 'multer';
import { fileTypeFromBuffer } from 'file-type';
import { communityImageStorage } from '../services/communityImageStorage.js';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const uploadImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES, files: 1, fields: 16, parts: 17 },
});

function handleContributionUpload(req, res, next) {
  uploadImage.single('image')(req, res, async (error) => {
    if (error?.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ success: false, message: 'Images must be 5 MB or smaller.' });
    if (error) return res.status(400).json({ success: false, message: 'The contribution form could not be read.' });
    if (req.file) {
      try {
        const type = await fileTypeFromBuffer(req.file.buffer);
        if (!type || !['image/jpeg', 'image/png', 'image/webp'].includes(type.mime)) {
          return res.status(415).json({ success: false, message: 'Use a valid JPEG, PNG, or WebP image.' });
        }
      } catch {
        return res.status(415).json({ success: false, message: 'Use a valid JPEG, PNG, or WebP image.' });
      }
    }
    if (typeof req.body?.sources === 'string') {
      try { req.body.sources = JSON.parse(req.body.sources); }
      catch { return res.status(400).json({ success: false, message: 'Provide sources in a valid format.' }); }
    }
    return next();
  });
}

export function createCountryRouter(CountryModel = Country, CulturalEntryModel = CulturalEntry, PlaceModel = Place, { UserModel = User, env = process.env, auth: providedAuth, adminAuth: providedAdminAuth, memberAuth: providedMemberAuth, imageStorage = communityImageStorage } = {}) {
  const router = Router();
  const controller = createCountryController(CountryModel, CulturalEntryModel, PlaceModel, { imageStorage });
  const auth = providedAuth || createUserAuth({ UserModel, env });
  const adminAuth = providedAdminAuth || createAdminAuth(env);
  const memberAuth = providedMemberAuth || createMemberAuth({ userAuth: auth, adminAuth, UserModel });

  router.get('/', controller.listCountries);
  // Keep this named route above /:slug so it is handled as a collection endpoint.
  router.get('/continents', controller.listContinents);
  router.get('/:slug/cultural-entries', controller.listCulturalEntries);
  router.post('/:slug/cultural-entries', memberAuth.requireMember, memberAuth.requireCsrf, handleContributionUpload, controller.submitCulturalEntry);
  router.get('/:slug/places', controller.listPlaces);
  router.post('/:slug/places', memberAuth.requireMember, memberAuth.requireCsrf, handleContributionUpload, controller.submitPlace);
  router.get('/:slug', controller.getCountryBySlug);

  return router;
}
