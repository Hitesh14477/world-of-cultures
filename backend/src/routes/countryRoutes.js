import { Router } from 'express';
import { createCountryController } from '../controllers/countryController.js';

export function createCountryRouter(CountryModel) {
  const router = Router();
  const controller = createCountryController(CountryModel);

  router.get('/', controller.listCountries);
  // Keep this named route above /:slug so it is handled as a collection endpoint.
  router.get('/continents', controller.listContinents);
  router.get('/:slug', controller.getCountryBySlug);

  return router;
}
