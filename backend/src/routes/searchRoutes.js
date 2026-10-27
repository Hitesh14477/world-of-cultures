import { Router } from 'express'
import { createSearchController } from '../controllers/searchController.js'
import Country from '../models/Country.js'
import CulturalEntry from '../models/CulturalEntry.js'
import Place from '../models/Place.js'

export function createSearchRouter(models = {}) {
  const router = Router()
  router.get('/', createSearchController({
    CountryModel: models.CountryModel || Country,
    CulturalEntryModel: models.CulturalEntryModel || CulturalEntry,
    PlaceModel: models.PlaceModel || Place,
  }))
  return router
}
